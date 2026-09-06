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
    const { data: connection } = await supabase.from('connections').select('*').eq('id', connectionId).maybeSingle();
    if (!connection) return NextResponse.json({ error: 'Connection not found.' }, { status: 404 });
    if (user.id !== connection.requester_id && user.id !== connection.responder_id) {
      return NextResponse.json({ error: 'You are not part of this connection.' }, { status: 403 });
    }

    const [{ data: payment }, { data: completions }] = await Promise.all([
      supabase.from('connection_payments').select('*').eq('connection_id', connectionId).maybeSingle(),
      supabase.from('connection_completion_confirmations').select('user_id').eq('connection_id', connectionId)
    ]);

    if (!payment || payment.status !== 'secured') throw new Error('PAYMENT_NOT_SECURED');
    const completedIds = new Set((completions ?? []).map((row) => row.user_id as string));
    if (!completedIds.has(connection.requester_id) || !completedIds.has(connection.responder_id)) {
      throw new Error('COMPLETION_NOT_READY');
    }

    const { data: payoutAccount } = await supabase
      .from('payment_accounts')
      .select('stripe_account_id,status,transfers_enabled')
      .eq('user_id', payment.payee_id)
      .maybeSingle();
    if (!payoutAccount?.stripe_account_id || payoutAccount.status !== 'READY' || payoutAccount.transfers_enabled !== true) {
      throw new Error('PAYOUT_NOT_READY');
    }

    let chargeId = payment.stripe_charge_id as string | null;
    if (!chargeId && payment.stripe_payment_intent_id) {
      const intent = await stripeGet<StripePaymentIntent>(`/v1/payment_intents/${encodeURIComponent(payment.stripe_payment_intent_id)}`);
      chargeId = stripeId(intent.latest_charge);
      if (chargeId) {
        await supabase.from('connection_payments').update({ stripe_charge_id: chargeId, updated_at: new Date().toISOString() }).eq('id', payment.id);
      }
    }
    if (!chargeId) throw new Error('STRIPE:Payment charge is not ready for transfer yet.');

    const providerNet = Number(payment.provider_net_cents ?? payment.provider_amount_cents ?? 0);
    if (!Number.isInteger(providerNet) || providerNet <= 0) {
      return NextResponse.json({ error: 'No provider payout is due for this payment.' }, { status: 409 });
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
      'metadata[fee_policy_version]': payment.fee_policy_version || 'legacy_v0'
    }, { idempotencyKey: `aspire_release_${payment.id}` });

    const now = new Date().toISOString();
    const { error: updateError } = await supabase.from('connection_payments').update({
      status: 'released',
      stripe_transfer_id: transfer.id,
      released_at: now,
      failure_reason: null,
      updated_at: now
    }).eq('id', payment.id).eq('status', 'secured');
    if (updateError) throw updateError;

    await Promise.all([
      supabase.from('connections').update({ status: 'completed', updated_at: now }).eq('id', connection.id),
      supabase.from('requests').update({ status: 'completed', updated_at: now }).eq('id', connection.request_id)
    ]);

    return NextResponse.json({
      status: 'released',
      transferId: transfer.id,
      providerNetCents: providerNet,
      feePolicyVersion: payment.fee_policy_version || 'legacy_v0'
    });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
