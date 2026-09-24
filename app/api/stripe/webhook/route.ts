import { NextResponse } from 'next/server';
import { apiError, getSupabaseServiceClient, stripeFormRequest, stripeGet, stripeLivemode, verifyStripeWebhookSignature } from '../../../../lib/server/aspireServer';
import { secureConnectionPayment } from '../../../../lib/server/stripePaymentReconciliation';

type StripeEvent = {
  id: string;
  type: string;
  livemode: boolean;
  data: { object: Record<string, any> };
};

function objectId(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') return (value as { id: string }).id;
  return null;
}

function latestRefundId(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const data = (value as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;
  for (let index = data.length - 1; index >= 0; index -= 1) {
    const id = objectId(data[index]);
    if (id) return id;
  }
  return null;
}

function stripeTimestamp(value: unknown) {
  const seconds = Number(value || 0);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

function requireDatabaseWrite(error: unknown) {
  if (error) throw error;
}

type RecoverablePayment = {
  id: string;
  status: string;
  stripe_transfer_id: string | null;
  stripe_transfer_reversal_id?: string | null;
  provider_net_cents: number | null;
  provider_amount_cents: number | null;
};

type StripeTransferReversal = { id: string; amount?: number | null };


async function syncStripeMarketplaceRiskCase(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  payment: RecoverablePayment & { connection_id: string },
  eventType: 'charge.dispute.created' | 'radar.early_fraud_warning.created',
  object: Record<string, any>,
  stripeEventId: string
) {
  const { data: order, error: orderError } = await supabase
    .from('market_orders')
    .select('id,connection_id,request_id,buyer_id,seller_id,status')
    .eq('connection_id', payment.connection_id)
    .maybeSingle();
  requireDatabaseWrite(orderError);
  if (!order) return;

  const now = new Date().toISOString();
  const source = eventType === 'charge.dispute.created' ? 'stripe_dispute' : 'stripe_radar';
  const stripeCaseId = `${source}:${String(object.id || stripeEventId)}`;
  const details = eventType === 'charge.dispute.created'
    ? 'Stripe opened a card-network payment dispute. Aspire paused the order and seller payout for human review.'
    : 'Stripe Radar issued an early fraud warning. Aspire paused the order and seller payout for human review.';
  const evidenceDueBy = eventType === 'charge.dispute.created'
    ? stripeTimestamp(object.evidence_details?.due_by)
    : null;

  const { error: orderUpdateError } = await supabase
    .from('market_orders')
    .update({
      status: 'disputed',
      dispute_opened_at: now,
      updated_at: now
    })
    .eq('id', order.id)
    .neq('status', 'refunded');
  requireDatabaseWrite(orderUpdateError);

  const { data: existing, error: existingError } = await supabase
    .from('market_disputes')
    .select('id')
    .eq('stripe_case_id', stripeCaseId)
    .maybeSingle();
  requireDatabaseWrite(existingError);

  if (existing) {
    const { error } = await supabase
      .from('market_disputes')
      .update({
        status: 'under_review',
        details,
        stripe_status: String(object.status || 'open'),
        stripe_status_updated_at: now,
        evidence_due_by: evidenceDueBy,
        updated_at: now
      })
      .eq('id', existing.id);
    requireDatabaseWrite(error);
  } else {
    const { error } = await supabase
      .from('market_disputes')
      .insert({
        market_order_id: order.id,
        opened_by: null,
        reason: 'payment_issue',
        details,
        evidence: [{
          source,
          stripe_event_id: stripeEventId,
          stripe_object_id: String(object.id || ''),
          stripe_charge_id: objectId(object.charge)
        }],
        status: 'under_review',
        source,
        stripe_case_id: stripeCaseId,
        stripe_status: String(object.status || 'open'),
        stripe_status_updated_at: now,
        evidence_due_by: evidenceDueBy
      });
    requireDatabaseWrite(error);
  }

  const { error: eventError } = await supabase.from('market_order_events').insert({
    market_order_id: order.id,
    actor_id: null,
    event_type: eventType === 'charge.dispute.created' ? 'stripe_dispute_opened' : 'stripe_radar_warning',
    payload: {
      stripe_event_id: stripeEventId,
      stripe_case_id: stripeCaseId,
      stripe_status: String(object.status || 'open')
    }
  });
  requireDatabaseWrite(eventError);

  const title = eventType === 'charge.dispute.created'
    ? 'Payment dispute under review'
    : 'Payment flagged for review';
  const body = eventType === 'charge.dispute.created'
    ? 'Stripe reported a card-network dispute. Aspire paused this order while the payment issue is reviewed.'
    : 'Stripe Radar flagged this payment. Aspire paused this order while the payment is reviewed.';

  const { error: buyerNoticeError } = await supabase.rpc('push_notification', {
    p_user_id: order.buyer_id,
    p_kind: 'market_order',
    p_event_key: `market-stripe-risk:${stripeCaseId}:${order.buyer_id}`,
    p_title: title,
    p_body: body,
    p_actor_id: null,
    p_request_id: order.request_id,
    p_response_id: null,
    p_connection_id: order.connection_id,
    p_message_id: null
  });
  requireDatabaseWrite(buyerNoticeError);

  const { error: sellerNoticeError } = await supabase.rpc('push_notification', {
    p_user_id: order.seller_id,
    p_kind: 'market_order',
    p_event_key: `market-stripe-risk:${stripeCaseId}:${order.seller_id}`,
    p_title: title,
    p_body: body,
    p_actor_id: null,
    p_request_id: order.request_id,
    p_response_id: null,
    p_connection_id: order.connection_id,
    p_message_id: null
  });
  requireDatabaseWrite(sellerNoticeError);
}

async function recordStripeDisputeUpdate(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  object: Record<string, any>,
  stripeEventId: string,
  eventType: string
) {
  if (!object.id) return;
  const stripeCaseId = `stripe_dispute:${String(object.id)}`;
  const now = new Date().toISOString();
  const { data: dispute, error } = await supabase
    .from('market_disputes')
    .select('id,market_order_id')
    .eq('stripe_case_id', stripeCaseId)
    .maybeSingle();
  requireDatabaseWrite(error);
  if (!dispute) return;

  const stripeStatus = String(object.status || eventType.replace('charge.dispute.', ''));
  const { error: updateError } = await supabase.from('market_disputes').update({
    status: 'under_review',
    stripe_status: stripeStatus,
    stripe_status_updated_at: now,
    evidence_due_by: stripeTimestamp(object.evidence_details?.due_by),
    updated_at: now
  }).eq('id', dispute.id);
  requireDatabaseWrite(updateError);

  const { error: eventError } = await supabase.from('market_order_events').insert({
    market_order_id: dispute.market_order_id,
    actor_id: null,
    event_type: 'stripe_dispute_updated',
    payload: {
      stripe_event_id: stripeEventId,
      stripe_case_id: stripeCaseId,
      stripe_status: stripeStatus,
      stripe_event_type: eventType
    }
  });
  requireDatabaseWrite(eventError);
}

async function recordRefundFailure(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  object: Record<string, any>,
  eventLivemode: boolean
) {
  const refundId = String(object.id || '');
  if (!refundId) return;
  const chargeId = objectId(object.charge);
  let query = supabase
    .from('connection_payments')
    .select('id,connection_id,status,stripe_transfer_id')
    .eq('stripe_livemode', eventLivemode);
  query = chargeId ? query.or(`stripe_refund_id.eq.${refundId},stripe_charge_id.eq.${chargeId}`) : query.eq('stripe_refund_id', refundId);
  const { data: payment, error } = await query.maybeSingle();
  requireDatabaseWrite(error);
  if (!payment || payment.stripe_transfer_id) return;

  const failure = String(object.failure_reason || 'Stripe reported that the refund failed. Manual review is required.').slice(0, 500);
  const now = new Date().toISOString();
  const { error: paymentError } = await supabase.from('connection_payments').update({
    status: 'secured',
    refunded_at: null,
    failure_reason: failure,
    refund_claimed_at: null,
    updated_at: now
  }).eq('id', payment.id).eq('status', 'refunded');
  requireDatabaseWrite(paymentError);

  const { data: order, error: orderError } = await supabase
    .from('market_orders')
    .select('id')
    .eq('connection_id', payment.connection_id)
    .maybeSingle();
  requireDatabaseWrite(orderError);
  if (order) {
    const { error: orderUpdateError } = await supabase.from('market_orders').update({ status: 'disputed', refunded_at: null, updated_at: now }).eq('id', order.id);
    requireDatabaseWrite(orderUpdateError);
    const disputeId = typeof object.metadata?.aspire_market_dispute_id === 'string' ? object.metadata.aspire_market_dispute_id : null;
    if (disputeId) {
      const { error: reopenError } = await supabase.from('market_disputes').update({
        status: 'under_review',
        resolution_note: `Stripe refund failed: ${failure}`,
        resolved_at: null,
        updated_at: now
      }).eq('id', disputeId);
      requireDatabaseWrite(reopenError);
    }
  }

  const resolutionCaseId = typeof object.metadata?.aspire_resolution_case_id === 'string' ? object.metadata.aspire_resolution_case_id : null;
  if (resolutionCaseId) {
    const { error: reopenCaseError } = await supabase.from('connection_resolution_cases').update({
      status: 'under_review',
      resolution_note: `Stripe refund failed: ${failure}`,
      refund_cents: null,
      reviewed_at: null,
      updated_at: now
    }).eq('id', resolutionCaseId);
    requireDatabaseWrite(reopenCaseError);
  }
}

async function recordStripeDisputeClosure(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  object: Record<string, any>,
  stripeEventId: string
) {
  const stripeCaseId = `stripe_dispute:${String(object.id || '')}`;
  if (!object.id) return;

  const { data: dispute, error: disputeError } = await supabase
    .from('market_disputes')
    .select('id,market_order_id,status')
    .eq('stripe_case_id', stripeCaseId)
    .maybeSingle();
  requireDatabaseWrite(disputeError);
  if (!dispute) return;

  const outcome = String(object.status || 'closed');
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('market_disputes')
    .update({
      status: 'under_review',
      stripe_status: outcome,
      stripe_outcome: outcome,
      stripe_status_updated_at: now,
      resolution_note: `Stripe closed the card-network dispute with status “${outcome}”. Aspire still requires human financial reconciliation before changing the protected order state.`,
      updated_at: now
    })
    .eq('id', dispute.id);
  requireDatabaseWrite(updateError);

  const { error: eventError } = await supabase.from('market_order_events').insert({
    market_order_id: dispute.market_order_id,
    actor_id: null,
    event_type: 'stripe_dispute_closed',
    payload: {
      stripe_event_id: stripeEventId,
      stripe_case_id: stripeCaseId,
      stripe_outcome: outcome,
      manual_reconciliation_required: true
    }
  });
  requireDatabaseWrite(eventError);
}

async function recoverReleasedTransfer(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  payment: RecoverablePayment,
  reason: 'refund' | 'dispute',
  stripeEventId: string,
  refundId: string | null = null
) {
  if (!payment.stripe_transfer_id) return { status: 'not_required' as const };

  const recoveredCents = Number(payment.provider_net_cents ?? payment.provider_amount_cents ?? 0);
  if (recoveredCents <= 0) throw new Error('STRIPE:Seller transfer recovery amount was invalid.');

  const { data: claim, error: claimError } = await supabase.rpc('claim_connection_payment_transfer_recovery', {
    p_payment_id: payment.id,
    p_reason: reason
  });
  requireDatabaseWrite(claimError);

  const claimStatus = typeof claim?.status === 'string' ? claim.status : '';
  if (claimStatus === 'busy') throw new Error('STRIPE:Seller transfer recovery is already in progress.');
  if (claimStatus === 'not_required') return { status: 'not_required' as const };

  if (claimStatus === 'reversed') {
    const reversalId = typeof claim?.reversal_id === 'string'
      ? claim.reversal_id
      : payment.stripe_transfer_reversal_id;
    if (!reversalId) throw new Error('STRIPE:Recovered seller transfer is missing its reversal reference.');
    const { error: reconcileError } = await supabase.rpc('record_connection_payment_transfer_recovery', {
      p_payment_id: payment.id,
      p_reason: reason,
      p_outcome: 'reversed',
      p_reversal_id: reversalId,
      p_amount_cents: recoveredCents,
      p_refund_id: refundId,
      p_error: null,
      p_stripe_event_id: stripeEventId
    });
    requireDatabaseWrite(reconcileError);
    return { status: 'reversed' as const, reversalId };
  }

  if (claimStatus !== 'claimed') {
    throw new Error('STRIPE:Seller transfer recovery could not be claimed.');
  }

  try {
    const reversal = await stripeFormRequest<StripeTransferReversal>(
      `/v1/transfers/${encodeURIComponent(payment.stripe_transfer_id)}/reversals`,
      {
        amount: recoveredCents,
        'metadata[aspire_payment_id]': payment.id,
        'metadata[recovery_reason]': reason,
        'metadata[stripe_event_id]': stripeEventId
      },
      { idempotencyKey: `aspire_transfer_recovery_${payment.id}` }
    );

    const { error: recordError } = await supabase.rpc('record_connection_payment_transfer_recovery', {
      p_payment_id: payment.id,
      p_reason: reason,
      p_outcome: 'reversed',
      p_reversal_id: reversal.id,
      p_amount_cents: Number(reversal.amount ?? recoveredCents),
      p_refund_id: refundId,
      p_error: null,
      p_stripe_event_id: stripeEventId
    });
    requireDatabaseWrite(recordError);
    return { status: 'reversed' as const, reversalId: reversal.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown transfer reversal error';
    const { error: recordError } = await supabase.rpc('record_connection_payment_transfer_recovery', {
      p_payment_id: payment.id,
      p_reason: reason,
      p_outcome: 'manual_required',
      p_reversal_id: null,
      p_amount_cents: recoveredCents,
      p_refund_id: refundId,
      p_error: message,
      p_stripe_event_id: stripeEventId
    });
    requireDatabaseWrite(recordError);
    throw error;
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  let verified = false;
  let parsedEvent: StripeEvent | null = null;

  try {
    verifyStripeWebhookSignature(rawBody, request.headers.get('stripe-signature'));
    verified = true;
    const event = JSON.parse(rawBody) as StripeEvent;
    parsedEvent = event;

    if (!event?.id || !event?.type || !event?.data?.object) {
      return NextResponse.json({ error: 'Invalid Stripe event.' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { data: claimStatus, error: claimError } = await supabase.rpc('claim_stripe_webhook_event', {
      p_event_id: event.id,
      p_event_type: event.type,
      p_livemode: Boolean(event.livemode)
    });
    requireDatabaseWrite(claimError);

    if (claimStatus === 'processed') {
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (claimStatus === 'busy') {
      return NextResponse.json({ received: true, duplicate: true, processing: true });
    }
    if (claimStatus !== 'claimed') {
      throw new Error('STRIPE:Webhook event could not be claimed.');
    }

    const object = event.data.object;
    const eventLivemode = Boolean(event.livemode);

    if (event.type.startsWith('identity.verification_session.')) {
      const aspireUserId = typeof object.metadata?.aspire_user_id === 'string' ? object.metadata.aspire_user_id : null;
      const sessionId = typeof object.id === 'string' ? object.id : null;
      const identityStatus = event.type === 'identity.verification_session.verified'
        ? 'verified'
        : event.type === 'identity.verification_session.requires_input'
          ? 'requires_input'
          : event.type === 'identity.verification_session.canceled'
            ? 'failed'
            : 'pending';
      const identityPatch = {
        status: identityStatus,
        provider: 'stripe_identity',
        provider_session_id: sessionId,
        stripe_livemode: eventLivemode,
        verified_at: identityStatus === 'verified' ? new Date().toISOString() : null,
        last_error: identityStatus === 'requires_input' || identityStatus === 'failed'
          ? String(object.last_error?.reason || object.last_error?.code || 'Verification needs attention.').slice(0, 300)
          : null,
        updated_at: new Date().toISOString()
      };

      if (aspireUserId) {
        const { data: existingIdentity, error: identityLookupError } = await supabase
          .from('identity_verifications')
          .select('stripe_livemode,provider_session_id')
          .eq('user_id', aspireUserId)
          .maybeSingle();
        requireDatabaseWrite(identityLookupError);

        const staleMode = existingIdentity && existingIdentity.stripe_livemode !== eventLivemode;
        const staleSession = existingIdentity?.provider_session_id && sessionId && existingIdentity.provider_session_id !== sessionId;
        if (!staleMode && !staleSession) {
          const query = existingIdentity
            ? supabase.from('identity_verifications').update(identityPatch).eq('user_id', aspireUserId).eq('stripe_livemode', eventLivemode)
            : supabase.from('identity_verifications').insert({ user_id: aspireUserId, ...identityPatch });
          const { error } = await query;
          requireDatabaseWrite(error);
        }
      } else if (sessionId) {
        const { error } = await supabase
          .from('identity_verifications')
          .update(identityPatch)
          .eq('provider_session_id', sessionId)
          .eq('stripe_livemode', eventLivemode);
        requireDatabaseWrite(error);
      }
    }

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const paymentId = object.metadata?.aspire_payment_id;
      if (paymentId) {
        const paymentIntentId = objectId(object.payment_intent);
        if (object.payment_status === 'paid' && eventLivemode === stripeLivemode()) {
          if (!paymentIntentId) throw new Error('STRIPE:Paid Stripe Checkout Session did not include a PaymentIntent.');
          const intent = await stripeGet<Record<string, any>>(
            `/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`
          );
          if (intent.status !== 'succeeded') {
            throw new Error('STRIPE:Stripe Checkout reported paid before its PaymentIntent succeeded.');
          }
          const result = await secureConnectionPayment(supabase, paymentId, {
            paymentIntentId: String(intent.id || paymentIntentId),
            chargeId: objectId(intent.latest_charge),
            amountReceived: Number(intent.amount_received ?? intent.amount ?? 0),
            currency: String(intent.currency || ''),
            livemode: Boolean(intent.livemode),
            aspirePaymentId: intent.metadata?.aspire_payment_id || paymentId
          });
          if (result.status === 'mode_mismatch') {
            const { error: ignoredError } = await supabase.from('stripe_webhook_events').update({
              status: 'processed',
              processed_at: new Date().toISOString(),
              processing_error: 'Ignored because Stripe mode did not match the Aspire payment record.'
            }).eq('event_id', event.id).eq('status', 'received');
            requireDatabaseWrite(ignoredError);
            return NextResponse.json({ received: true, ignored: true, reason: 'stripe_mode_mismatch' });
          }
        } else {
          const { error } = await supabase.from('connection_payments').update({
            status: 'processing',
            stripe_checkout_session_id: object.id || null,
            stripe_payment_intent_id: paymentIntentId,
            updated_at: new Date().toISOString()
          }).eq('id', paymentId).eq('stripe_livemode', eventLivemode).in('status', ['not_started', 'checkout_created', 'failed', 'processing']);
          requireDatabaseWrite(error);
        }
      }
    }

    if (event.type === 'checkout.session.async_payment_failed') {
      const paymentId = object.metadata?.aspire_payment_id;
      if (paymentId) {
        const { error } = await supabase.from('connection_payments').update({
          status: 'failed',
          failure_reason: 'Stripe reported that the asynchronous payment failed.',
          updated_at: new Date().toISOString()
        }).eq('id', paymentId).eq('stripe_livemode', eventLivemode).in('status', ['checkout_created', 'processing']);
        requireDatabaseWrite(error);
      }
    }

    if (event.type === 'payment_intent.succeeded') {
      const paymentId = object.metadata?.aspire_payment_id;
      if (paymentId) {
        const result = await secureConnectionPayment(supabase, paymentId, {
          paymentIntentId: String(object.id || ''),
          chargeId: objectId(object.latest_charge),
          amountReceived: Number(object.amount_received ?? object.amount ?? 0),
          currency: String(object.currency || ''),
          livemode: eventLivemode,
          aspirePaymentId: paymentId
        });
        if (result.status === 'mode_mismatch') {
          // Valid event from the other Stripe environment. Keep the current-mode payment untouched,
          // but still close the webhook claim so Stripe does not retry it forever.
          const { error: ignoredError } = await supabase.from('stripe_webhook_events').update({
            status: 'processed',
            processed_at: new Date().toISOString(),
            processing_error: 'Ignored because Stripe mode did not match the Aspire payment record.'
          }).eq('event_id', event.id).eq('status', 'received');
          requireDatabaseWrite(ignoredError);
          return NextResponse.json({ received: true, ignored: true, reason: 'stripe_mode_mismatch' });
        }
      }
    }

    if (event.type === 'payment_intent.payment_failed') {
      const paymentId = object.metadata?.aspire_payment_id;
      if (paymentId) {
        const { error } = await supabase.from('connection_payments').update({
          status: 'failed',
          stripe_payment_intent_id: object.id || null,
          failure_reason: object.last_payment_error?.message || 'Stripe reported that the payment failed.',
          updated_at: new Date().toISOString()
        }).eq('id', paymentId).eq('stripe_livemode', eventLivemode).in('status', ['not_started', 'checkout_created', 'processing', 'failed']);
        requireDatabaseWrite(error);
      }
    }

    if (event.type === 'charge.dispute.created' || event.type === 'radar.early_fraud_warning.created') {
      const chargeId = objectId(object.charge);
      if (chargeId) {
        const { data: payment, error: paymentError } = await supabase
          .from('connection_payments')
          .select('id,connection_id,status,stripe_transfer_id,stripe_transfer_reversal_id,provider_net_cents,provider_amount_cents')
          .eq('stripe_charge_id', chargeId)
          .eq('stripe_livemode', eventLivemode)
          .maybeSingle();
        requireDatabaseWrite(paymentError);

        if (payment && payment.status !== 'refunded') {
          const { error } = await supabase.from('connection_payments').update({
            status: 'disputed',
            disputed_at: new Date().toISOString(),
            failure_reason: event.type === 'radar.early_fraud_warning.created'
              ? 'Stripe Radar issued an early fraud warning. Payout is paused for review.'
              : payment.stripe_transfer_id
                ? 'Stripe opened a payment dispute after seller payout. Transfer recovery is in progress.'
                : 'Stripe opened a payment dispute. Payout is paused for review.',
            updated_at: new Date().toISOString()
          }).eq('id', payment.id).neq('status', 'refunded');
          requireDatabaseWrite(error);

          await syncStripeMarketplaceRiskCase(
            supabase,
            payment as RecoverablePayment & { connection_id: string },
            event.type,
            object,
            event.id
          );

          // An early warning pauses an unreleased payout but does not itself remove funds.
          // A real dispute after release immediately attempts to recover the seller transfer.
          if (event.type === 'charge.dispute.created' && payment.stripe_transfer_id) {
            await recoverReleasedTransfer(supabase, payment, 'dispute', event.id);
          }
        }
      }
    }

    if (event.type === 'charge.dispute.closed') {
      await recordStripeDisputeClosure(supabase, object, event.id);
    }

    if (['charge.dispute.updated', 'charge.dispute.funds_withdrawn', 'charge.dispute.funds_reinstated'].includes(event.type)) {
      await recordStripeDisputeUpdate(supabase, object, event.id, event.type);
    }

    if (event.type === 'refund.failed' || (event.type === 'refund.updated' && object.status === 'failed')) {
      await recordRefundFailure(supabase, object, eventLivemode);
    }

    if (event.type === 'charge.refunded' && object.id && Number(object.amount_refunded || 0) >= Number(object.amount || 0)) {
      const { data: payment, error: paymentError } = await supabase
        .from('connection_payments')
        .select('id,status,stripe_refund_id,stripe_livemode,stripe_transfer_id,stripe_transfer_reversal_id,provider_net_cents,provider_amount_cents')
        .eq('stripe_charge_id', object.id)
        .eq('stripe_livemode', eventLivemode)
        .maybeSingle();
      requireDatabaseWrite(paymentError);

      if (payment) {
        const refundId = latestRefundId(object.refunds) || payment.stripe_refund_id;
        if (!refundId) throw new Error('STRIPE:Full refund event did not include a refund identifier.');

        if (payment.stripe_transfer_id) {
          // Separate charges and transfers do not reverse a seller transfer when the
          // platform charge is refunded. Recover it explicitly and preserve any
          // insufficient-balance failure as an auditable, retryable liability.
          await recoverReleasedTransfer(supabase, payment, 'refund', event.id, refundId);
        } else if (payment.status !== 'released') {
          const { error } = await supabase.rpc('finalize_connection_payment_refund', {
            p_payment_id: payment.id,
            p_refund_id: refundId,
            p_amount_cents: Number(object.amount_refunded || object.amount || 0),
            p_actor_id: null,
            p_resolution_case_id: null,
            p_note: 'Stripe confirmed a full refund.',
            p_stripe_status: 'succeeded'
          });
          requireDatabaseWrite(error);
        }
      }
    }

    const { error: processedError } = await supabase.from('stripe_webhook_events').update({
      status: 'processed',
      processed_at: new Date().toISOString(),
      processing_error: null
    }).eq('event_id', event.id);
    requireDatabaseWrite(processedError);

    return NextResponse.json({ received: true });
  } catch (error) {
    if (verified && parsedEvent?.id) {
      try {
        const supabase = getSupabaseServiceClient();
        await supabase.from('stripe_webhook_events').update({
          status: 'failed',
          processing_error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown webhook error'
        }).eq('event_id', parsedEvent.id).eq('status', 'received');
      } catch {
        // Avoid masking the original processing error.
      }
    }
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
