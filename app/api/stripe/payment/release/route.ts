import { NextResponse } from 'next/server';
import {
  apiError,
  getAuthenticatedUser,
  getSupabaseServiceClient,
  stripeFormRequest,
  stripeGet
} from '../../../../../lib/server/aspireServer';

type StripePaymentIntent = { latest_charge?: string | { id?: string } | null };
type StripeTransfer = { id: string };
type StripeConnectAccount = {
  capabilities?: { transfers?: string | null };
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  requirements?: {
    currently_due?: string[];
    past_due?: string[];
    pending_verification?: string[];
    disabled_reason?: string | null;
  };
};

function stripeId(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') return (value as { id: string }).id;
  return null;
}

function stripePayoutState(account: StripeConnectAccount) {
  const transferActive = account.capabilities?.transfers === 'active';
  const payoutsEnabled = account.payouts_enabled === true;
  const currentlyDue = account.requirements?.currently_due ?? [];
  const pastDue = account.requirements?.past_due ?? [];
  const disabledReason = account.requirements?.disabled_reason || '';
  const requirementsDue = new Set([...currentlyDue, ...pastDue]).size;
  const ready = transferActive && payoutsEnabled;
  const status = ready
    ? 'READY'
    : pastDue.length > 0 || disabledReason.includes('past_due')
      ? 'RESTRICTED'
      : currentlyDue.length > 0 || account.details_submitted === false
        ? 'ACTION_REQUIRED'
        : 'UNDER_REVIEW';

  return { ready, status, requirementsDue };
}

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    const connectionId = typeof body?.connectionId === 'string' ? body.connectionId : '';
    if (!connectionId) return NextResponse.json({ error: 'Missing connection.' }, { status: 400 });

    const supabase = getSupabaseServiceClient();
    const { data: connection } = await supabase.from('connections').select('*').eq('id', connectionId).maybeSingle();
    if (!connection) return NextResponse.json({ error: 'Connection not found.' }, { status: 404 });
    if (user.id !== connection.requester_id && user.id !== connection.responder_id) {
      return NextResponse.json({ error: 'You are not part of this connection.' }, { status: 403 });
    }

    const [{ data: payment }, { data: completions }, { data: marketOrder }] = await Promise.all([
      supabase.from('connection_payments').select('*').eq('connection_id', connectionId).maybeSingle(),
      supabase.from('connection_completion_confirmations').select('user_id').eq('connection_id', connectionId),
      supabase.from('market_orders').select('*').eq('connection_id', connectionId).maybeSingle()
    ]);

    if (!payment) throw new Error('PAYMENT_NOT_SECURED');

    const providerNet = Number(payment.provider_net_cents ?? payment.provider_amount_cents ?? 0);
    if (payment.status === 'released' && payment.stripe_transfer_id) {
      return NextResponse.json({
        status: 'released',
        transactionType: marketOrder ? 'marketplace' : 'connection',
        transferId: payment.stripe_transfer_id,
        providerNetCents: providerNet,
        feePolicyVersion: payment.fee_policy_version || 'legacy_v0',
        duplicate: true
      });
    }
    if (payment.status !== 'secured') throw new Error('PAYMENT_NOT_SECURED');

    // A participant-created Resolution Center case freezes payout release before any
    // Stripe transfer is attempted. During rollout the table may not exist in older
    // preview databases; only a missing-table error is ignored.
    const { data: openResolution, error: resolutionError } = await supabase
      .from('connection_resolution_cases')
      .select('id,status')
      .eq('connection_id', connectionId)
      .in('status', ['submitted', 'under_review'])
      .limit(1)
      .maybeSingle();
    if (resolutionError && resolutionError.code !== '42P01') throw resolutionError;
    if (openResolution) {
      return NextResponse.json({
        error: 'Payout is paused while this connection is being reviewed in the Aspire Resolution Center.',
        code: 'RESOLUTION_CASE_OPEN'
      }, { status: 409 });
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
    } else {
      const completedIds = new Set((completions ?? []).map((row) => row.user_id as string));
      if (!completedIds.has(connection.requester_id) || !completedIds.has(connection.responder_id)) {
        throw new Error('COMPLETION_NOT_READY');
      }
    }

    const { data: payoutAccount } = await supabase
      .from('payment_accounts')
      .select('stripe_account_id,status,transfers_enabled')
      .eq('user_id', payment.payee_id)
      .maybeSingle();
    if (!payoutAccount?.stripe_account_id) throw new Error('PAYOUT_NOT_READY');

    // Re-check the connected account with Stripe's stable v1 Account endpoint
    // immediately before a transfer so a stale Aspire status cannot block or
    // incorrectly allow release.
    const stripeAccount = await stripeGet<StripeConnectAccount>(
      `/v1/accounts/${encodeURIComponent(payoutAccount.stripe_account_id)}`
    );
    const payoutState = stripePayoutState(stripeAccount);

    await supabase.from('payment_accounts').update({
      status: payoutState.status,
      transfers_enabled: payoutState.ready,
      requirements_due: payoutState.requirementsDue,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq('user_id', payment.payee_id);

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

    const transfer = await stripeFormRequest<StripeTransfer>('/v1/transfers', {
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

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase.from('connection_payments').update({
      status: 'released',
      stripe_transfer_id: transfer.id,
      released_at: now,
      failure_reason: null,
      updated_at: now
    }).eq('id', payment.id).eq('status', 'secured').select('id,status,stripe_transfer_id').maybeSingle();
    if (updateError) throw updateError;

    if (!updated) {
      const { data: latest } = await supabase.from('connection_payments').select('status,stripe_transfer_id').eq('id', payment.id).maybeSingle();
      if (latest?.status !== 'released' || !latest?.stripe_transfer_id) {
        throw new Error('STRIPE:Transfer was created but Aspire could not finalize the payment record. Retry this payout step.');
      }
    }

    await Promise.all([
      supabase.from('connections').update({ status: 'completed', updated_at: now }).eq('id', connection.id),
      supabase.from('requests').update({ status: 'completed', updated_at: now }).eq('id', connection.request_id),
      marketOrder ? supabase.from('market_orders').update({ status: 'released', released_at: now, updated_at: now }).eq('id', marketOrder.id) : Promise.resolve()
    ]);

    return NextResponse.json({
      status: 'released',
      transactionType: marketOrder ? 'marketplace' : 'connection',
      transferId: transfer.id,
      providerNetCents: providerNet,
      feePolicyVersion: payment.fee_policy_version || 'legacy_v0'
    });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
