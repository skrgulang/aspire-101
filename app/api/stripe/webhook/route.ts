import { NextResponse } from 'next/server';
import { apiError, getSupabaseServiceClient, verifyStripeWebhookSignature } from '../../../../lib/server/aspireServer';

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

function requireDatabaseWrite(error: unknown) {
  if (error) throw error;
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
        const { data: accountActive, error: accountActiveError } = await supabase.rpc('account_is_active_for_service_event', {
          p_user_id: aspireUserId
        });
        requireDatabaseWrite(accountActiveError);

        if (accountActive) {
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

    if (event.type === 'checkout.session.completed') {
      const paymentId = object.metadata?.aspire_payment_id;
      if (paymentId) {
        const { error } = await supabase.from('connection_payments').update({
          status: 'processing',
          stripe_checkout_session_id: object.id || null,
          stripe_payment_intent_id: objectId(object.payment_intent),
          updated_at: new Date().toISOString()
        }).eq('id', paymentId).eq('stripe_livemode', eventLivemode).in('status', ['not_started', 'checkout_created', 'failed', 'processing']);
        requireDatabaseWrite(error);
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
        const { data: payment, error: paymentError } = await supabase
          .from('connection_payments')
          .select('id,status,customer_total_cents,gross_amount_cents,currency,stripe_livemode')
          .eq('id', paymentId)
          .maybeSingle();
        requireDatabaseWrite(paymentError);

        if (!payment) throw new Error('STRIPE:Aspire payment record was not found for the completed PaymentIntent.');
        if (payment.stripe_livemode !== eventLivemode) {
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
        const expectedAmount = Number(payment.customer_total_cents ?? payment.gross_amount_cents ?? 0);
        const receivedAmount = Number(object.amount_received ?? object.amount ?? 0);
        const expectedCurrency = String(payment.currency || 'USD').toLowerCase();
        const receivedCurrency = String(object.currency || '').toLowerCase();
        if (expectedAmount <= 0 || receivedAmount !== expectedAmount || receivedCurrency !== expectedCurrency) {
          throw new Error('STRIPE:Stripe payment amount or currency did not match the Aspire fee snapshot.');
        }

        const { error } = await supabase.from('connection_payments').update({
          status: 'secured',
          stripe_payment_intent_id: object.id || null,
          stripe_charge_id: objectId(object.latest_charge),
          failure_reason: null,
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).eq('id', paymentId).eq('stripe_livemode', eventLivemode).in('status', ['not_started', 'checkout_created', 'processing', 'failed', 'secured']);
        requireDatabaseWrite(error);
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
        const { error } = await supabase.from('connection_payments').update({
          status: 'disputed',
          disputed_at: new Date().toISOString(),
          failure_reason: event.type === 'radar.early_fraud_warning.created'
            ? 'Stripe Radar issued an early fraud warning. Payout is paused for review.'
            : 'Stripe opened a payment dispute. Payout is paused for review.',
          updated_at: new Date().toISOString()
        }).eq('stripe_charge_id', chargeId).eq('stripe_livemode', eventLivemode).neq('status', 'refunded');
        requireDatabaseWrite(error);
      }
    }

    if (event.type === 'charge.refunded' && object.id && Number(object.amount_refunded || 0) >= Number(object.amount || 0)) {
      const { data: payment, error: paymentError } = await supabase
        .from('connection_payments')
        .select('id,status,stripe_refund_id,stripe_livemode')
        .eq('stripe_charge_id', object.id)
        .eq('stripe_livemode', eventLivemode)
        .maybeSingle();
      requireDatabaseWrite(paymentError);

      // A released transfer needs manual recovery; do not erase that liability by
      // flattening it into the ordinary refunded state. All normal app refunds are
      // serialized against payout release before Stripe receives the request.
      if (payment && payment.status !== 'released') {
        const refundId = latestRefundId(object.refunds) || payment.stripe_refund_id;
        if (!refundId) throw new Error('STRIPE:Full refund event did not include a refund identifier.');
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
