import { NextResponse } from 'next/server';
import {
  apiError,
  getAuthenticatedUser,
  getStripePayoutState,
  getSupabaseServiceClient,
  stripeFormRequest,
  stripeGet,
  stripeLivemode
} from '../../../../../lib/server/aspireServer';

type StripePaymentIntent = { latest_charge?: string | { id?: string } | null };
type StripeTransfer = { id: string };

function stripeId(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') return (value as { id: string }).id;
  return null;
}

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    const connectionId = typeof body?.connectionId === 'string' ? body.connectionId : '';
    if (!connectionId) return NextResponse.json({ error: 'Missing connection.' }, { status: 400 });

    const supabase = getSupabaseServiceClient();
    const livemode = stripeLivemode();
    const { data: connection } = await supabase.from('connections').select('*').eq('id', connectionId).maybeSingle();
    if (!connection) return NextResponse.json({ error: 'Connection not found.' }, { status: 404 });
    if (user.id !== connection.requester_id && user.id !== connection.responder_id) {
      return NextResponse.json({ error: 'You are not part of this connection.' }, { status: 403 });
    }
    if (connection.status === 'cancelled') {
      return NextResponse.json({
        error: 'This connection was cancelled. Provider payout is paused until any secured payment is reviewed.',
        code: 'CONNECTION_CANCELLED'
      }, { status: 409 });
    }

    const [paymentResult, completionsResult, marketOrderResult, resolutionCaseResult] = await Promise.all([
      supabase.from('connection_payments').select('*').eq('connection_id', connectionId).maybeSingle(),
      supabase.from('connection_completion_confirmations').select('user_id').eq('connection_id', connectionId),
      supabase.from('market_orders').select('*').eq('connection_id', connectionId).maybeSingle(),
      supabase
        .from('connection_resolution_cases')
        .select('id,status')
        .eq('connection_id', connectionId)
        .in('status', ['submitted', 'under_review'])
        .limit(1)
        .maybeSingle()
    ]);

    const payment = paymentResult.data;
    const completions = completionsResult.data;
    const marketOrder = marketOrderResult.data;
    const openResolutionCase = resolutionCaseResult.data;

    // For paid help / split-cost connections, the activity lifecycle must not depend on
    // whether checkout happened, Stripe has finished processing, or the provider can
    // receive a payout yet. Two completion confirmations are enough to move it to History.
    if (!marketOrder) {
      const completedIds = new Set((completions ?? []).map((row) => row.user_id as string));
      const mutuallyCompleted = completedIds.has(connection.requester_id) && completedIds.has(connection.responder_id);
      if (!mutuallyCompleted && connection.status !== 'completed') {
        throw new Error('COMPLETION_NOT_READY');
      }

      const lifecycleNow = new Date().toISOString();
      const [connectionUpdate, requestUpdate] = await Promise.all([
        supabase.from('connections').update({ status: 'completed', updated_at: lifecycleNow }).eq('id', connection.id).neq('status', 'cancelled'),
        supabase.from('requests').update({ status: 'completed', updated_at: lifecycleNow }).eq('id', connection.request_id).neq('status', 'cancelled')
      ]);
      if (connectionUpdate.error) throw connectionUpdate.error;
      if (requestUpdate.error) throw requestUpdate.error;
    }

    // A completed activity may legitimately have no secured payment: for example the
    // requester never finished checkout. Keep the lifecycle closed and report the money
    // state separately instead of leaving the connection stuck active.
    if (!payment) {
      if (!marketOrder) {
        return NextResponse.json({
          error: 'Activity completed and moved to History. There is no secured Aspire payment to release.',
          code: 'COMPLETED_WITHOUT_SECURED_PAYMENT'
        }, { status: 409 });
      }
      throw new Error('PAYMENT_NOT_SECURED');
    }

    const providerNet = Number(payment.provider_net_cents ?? payment.provider_amount_cents ?? 0);
    if (payment.status === 'released' && payment.stripe_transfer_id) {
      const { error: reconcileError } = await supabase.rpc('finalize_connection_payment_release', {
        p_payment_id: payment.id,
        p_transfer_id: payment.stripe_transfer_id
      });
      if (reconcileError) throw reconcileError;
      return NextResponse.json({
        status: 'released',
        transactionType: marketOrder ? 'marketplace' : 'connection',
        transferId: payment.stripe_transfer_id,
        providerNetCents: providerNet,
        feePolicyVersion: payment.fee_policy_version || 'legacy_v0',
        duplicate: true
      });
    }
    if (payment.status !== 'secured') {
      if (!marketOrder) {
        return NextResponse.json({
          error: 'Activity completed and moved to History. The Aspire payment is not secured, so no payout was released.',
          code: 'COMPLETED_WITHOUT_SECURED_PAYMENT',
          paymentStatus: payment.status
        }, { status: 409 });
      }
      throw new Error('PAYMENT_NOT_SECURED');
    }

    if (marketOrder) {
      if (user.id !== marketOrder.buyer_id && user.id !== marketOrder.seller_id) {
        return NextResponse.json({ error: 'You are not part of this marketplace order.' }, { status: 403 });
      }
      const { data: openDispute } = await supabase
        .from('market_disputes')
        .select('id')
        .eq('market_order_id', marketOrder.id)
        .in('status', ['open', 'under_review'])
        .limit(1)
        .maybeSingle();
      if (openDispute || marketOrder.status === 'disputed') {
        return NextResponse.json({ error: 'Seller payout is paused while this order is under review.', code: 'MARKET_ORDER_DISPUTED' }, { status: 409 });
      }
      if (marketOrder.status !== 'release_ready' || !marketOrder.seller_handed_off_at || !marketOrder.buyer_received_at) {
        return NextResponse.json({ error: 'Buyer receipt confirmation is required before the seller payout can be released.', code: 'MARKET_RECEIPT_NOT_CONFIRMED' }, { status: 409 });
      }
    }

    // Payout protection is fail-closed, but a temporary Resolution Center lookup problem
    // must not keep an already-completed service connection stuck in the active lifecycle.
    if (resolutionCaseResult.error) {
      return NextResponse.json({
        error: 'Aspire could not verify Resolution Center protection, so this payout was not released. Try again later.',
        code: 'RESOLUTION_PROTECTION_UNAVAILABLE'
      }, { status: 503 });
    }
    if (openResolutionCase) {
      return NextResponse.json({
        error: 'Provider payout is paused while an Aspire Resolution Center case is open.',
        code: 'RESOLUTION_CASE_OPEN',
        caseId: openResolutionCase.id
      }, { status: 409 });
    }

    const { data: payoutAccount } = await supabase
      .from('payment_accounts')
      .select('stripe_account_id,status,transfers_enabled')
      .eq('user_id', payment.payee_id)
      .eq('livemode', livemode)
      .maybeSingle();
    if (!payoutAccount?.stripe_account_id) throw new Error('PAYOUT_NOT_READY');

    const payoutState = await getStripePayoutState(payoutAccount.stripe_account_id);

    await supabase.from('payment_accounts').update({
      status: payoutState.status,
      transfers_enabled: payoutState.ready,
      requirements_due: payoutState.requirementsDue,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq('user_id', payment.payee_id).eq('livemode', livemode);

    if (!payoutState.ready) throw new Error('PAYOUT_NOT_READY');

    let chargeId = payment.stripe_charge_id as string | null;
    if (!chargeId && payment.stripe_payment_intent_id) {
      const intent = await stripeGet<StripePaymentIntent>(`/v1/payment_intents/${encodeURIComponent(payment.stripe_payment_intent_id)}`);
      chargeId = stripeId(intent.latest_charge);
      if (chargeId) {
        await supabase.from('connection_payments').update({ stripe_charge_id: chargeId, updated_at: new Date().toISOString() }).eq('id', payment.id);
      }
    }
    if (!chargeId) throw new Error('STRIPE:Payment charge is not ready for transfer yet.');

    if (!Number.isInteger(providerNet) || providerNet <= 0) {
      return NextResponse.json({ error: 'No seller/provider payout is due for this payment.' }, { status: 409 });
    }

    // Keep the ordinary late check for a clear user-facing case id. The database claim
    // below is the actual commit boundary: it locks the payment row, rechecks every
    // financial hold, and makes a simultaneous new hold wait until this decision commits.
    const lateResolutionCheck = await supabase
      .from('connection_resolution_cases')
      .select('id,status')
      .eq('connection_id', connectionId)
      .in('status', ['submitted', 'under_review'])
      .limit(1)
      .maybeSingle();
    if (lateResolutionCheck.error) {
      return NextResponse.json({
        error: 'Aspire could not recheck Resolution Center protection, so this payout was not released. Try again later.',
        code: 'RESOLUTION_PROTECTION_UNAVAILABLE'
      }, { status: 503 });
    }
    if (lateResolutionCheck.data) {
      return NextResponse.json({
        error: 'Provider payout is paused while an Aspire Resolution Center case is open.',
        code: 'RESOLUTION_CASE_OPEN',
        caseId: lateResolutionCheck.data.id
      }, { status: 409 });
    }

    const { data: claimedAtValue, error: claimError } = await supabase.rpc('claim_connection_payment_release', {
      p_payment_id: payment.id
    });
    if (claimError) {
      const claimText = `${claimError.message || ''} ${claimError.details || ''}`;
      if (/PAYOUT_HOLD_OPEN/i.test(claimText)) {
        return NextResponse.json({
          error: 'Provider payout is paused because a refund, dispute, or Resolution Center review is open.',
          code: 'PAYOUT_HOLD_OPEN'
        }, { status: 409 });
      }
      if (/REFUND_IN_PROGRESS/i.test(claimText)) {
        return NextResponse.json({
          error: 'Provider payout is paused because a refund is already being processed.',
          code: 'REFUND_IN_PROGRESS'
        }, { status: 409 });
      }
      if (/CONNECTION_CANCELLED/i.test(claimText)) {
        return NextResponse.json({
          error: 'This connection was cancelled. Provider payout remains paused for review.',
          code: 'CONNECTION_CANCELLED'
        }, { status: 409 });
      }
      throw claimError;
    }

    const claimedAt = typeof claimedAtValue === 'string' ? claimedAtValue : String(claimedAtValue || '');
    let transfer: StripeTransfer;
    try {
      transfer = await stripeFormRequest<StripeTransfer>('/v1/transfers', {
        amount: providerNet,
        currency: String(payment.currency || 'USD').toLowerCase(),
        destination: payoutAccount.stripe_account_id,
        transfer_group: payment.transfer_group,
        source_transaction: chargeId,
        'metadata[aspire_payment_id]': payment.id,
        'metadata[connection_id]': connection.id,
        'metadata[request_id]': payment.request_id,
        'metadata[transaction_type]': marketOrder ? 'marketplace' : 'connection',
        'metadata[fee_policy_version]': payment.fee_policy_version || 'legacy_v0'
      }, { idempotencyKey: `aspire_release_${payment.id}` });
    } catch (error) {
      if (claimedAt) {
        const { error: clearClaimError } = await supabase.rpc('clear_connection_payment_release_claim', {
          p_payment_id: payment.id,
          p_claimed_at: claimedAt
        });
        if (clearClaimError) console.error('Could not clear failed payout release claim', clearClaimError);
      }
      throw error;
    }

    const { data: finalized, error: finalizeError } = await supabase.rpc('finalize_connection_payment_release', {
      p_payment_id: payment.id,
      p_transfer_id: transfer.id
    });
    if (finalizeError) throw finalizeError;

    return NextResponse.json({
      status: 'released',
      transactionType: marketOrder ? 'marketplace' : 'connection',
      transferId: transfer.id,
      providerNetCents: providerNet,
      feePolicyVersion: payment.fee_policy_version || 'legacy_v0',
      duplicate: Boolean(finalized?.duplicate)
    });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
