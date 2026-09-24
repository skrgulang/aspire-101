import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  getSupabaseServiceClient,
  stripeFormRequest,
  stripeGet,
  stripeLivemode
} from '../../../../lib/server/aspireServer';
import {
  classifyCheckoutReconciliation,
  secureConnectionPayment
} from '../../../../lib/server/stripePaymentReconciliation';
import { matchesSellerTransfer, type ObservedTransfer } from '../../../../lib/server/stripeTransferReconciliation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Payment = {
  id: string;
  status: string;
  stripe_checkout_session_id: string;
  stripe_payment_intent_id: string | null;
};

type CheckoutSession = {
  id: string;
  status?: 'open' | 'complete' | 'expired' | null;
  payment_status?: 'paid' | 'unpaid' | 'no_payment_required' | null;
  payment_intent?: string | { id?: string } | null;
  metadata?: Record<string, string> | null;
};

type PaymentIntent = {
  id: string;
  status?: string | null;
  livemode: boolean;
  amount: number;
  amount_received: number;
  currency: string;
  latest_charge?: string | { id?: string } | null;
  metadata?: Record<string, string> | null;
  last_payment_error?: { message?: string | null } | null;
};

type RecoverableTransferPayment = {
  id: string;
  status: string;
  stripe_transfer_id: string;
  stripe_transfer_reversal_id: string | null;
  provider_net_cents: number | null;
  provider_amount_cents: number | null;
  stripe_transfer_attempted_amount_cents: number | null;
};

async function alertManualRecovery(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  paymentId: string,
  transferId: string
) {
  const { data: payment, error: paymentError } = await supabase.from('connection_payments')
    .select('connection_id,request_id').eq('id', paymentId).maybeSingle();
  if (paymentError) throw paymentError;
  const { data: staff, error: staffError } = await supabase.from('user_roles')
    .select('user_id').in('role', ['admin', 'moderator']);
  if (staffError) throw staffError;
  for (const staffId of new Set((staff ?? []).map((row) => String(row.user_id)))) {
    const { error: noticeError } = await supabase.rpc('push_notification', {
      p_user_id: staffId,
      p_kind: 'market_order',
      p_event_key: `manual-transfer-recovery:${paymentId}:${staffId}`,
      p_title: 'Seller transfer recovery needs manual review',
      p_body: `Stripe transfer ${transferId} could not be reversed automatically. Review payment ${paymentId}.`,
      p_actor_id: null,
      p_request_id: payment?.request_id || null,
      p_response_id: null,
      p_connection_id: payment?.connection_id || null,
      p_message_id: null
    });
    if (noticeError) throw noticeError;
  }
}

async function reverseHeldTransfer(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  payment: RecoverableTransferPayment,
  reason: 'refund' | 'dispute'
) {
  if (payment.stripe_transfer_reversal_id) return false;
  const amount = Number(payment.stripe_transfer_attempted_amount_cents
    ?? payment.provider_net_cents ?? payment.provider_amount_cents ?? 0);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Invalid seller transfer reversal amount.');
  const { data: claim, error: claimError } = await supabase.rpc('claim_connection_payment_transfer_recovery', {
    p_payment_id: payment.id, p_reason: reason
  });
  if (claimError) throw claimError;
  if (claim?.status === 'reversed') return false;
  if (claim?.status !== 'claimed') throw new Error(`Transfer recovery claim: ${claim?.status || 'unknown'}`);
  try {
    const reversal = await stripeFormRequest<{ id: string; amount?: number }>(
      `/v1/transfers/${encodeURIComponent(payment.stripe_transfer_id)}/reversals`, { amount },
      { idempotencyKey: `aspire_transfer_recovery_${payment.id}` }
    );
    const { error: recordError } = await supabase.rpc('record_connection_payment_transfer_recovery', {
      p_payment_id: payment.id, p_reason: reason, p_outcome: 'reversed',
      p_reversal_id: reversal.id, p_amount_cents: reversal.amount ?? amount,
      p_stripe_event_id: `reconcile:${payment.stripe_transfer_id}`
    });
    if (recordError) throw recordError;
    return true;
  } catch (reversalError) {
    const { error: recordError } = await supabase.rpc('record_connection_payment_transfer_recovery', {
      p_payment_id: payment.id, p_reason: reason, p_outcome: 'manual_required',
      p_amount_cents: amount, p_error: reversalError instanceof Error ? reversalError.message : String(reversalError),
      p_stripe_event_id: `reconcile:${payment.stripe_transfer_id}`
    });
    if (recordError) throw recordError;
    await alertManualRecovery(supabase, payment.id, payment.stripe_transfer_id);
    throw reversalError;
  }
}

function objectId(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
    return (value as { id: string }).id;
  }
  return null;
}

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const received = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  if (!authorized(request)) {
    return NextResponse.json(
      { error: 'Unauthorized.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const supabase = getSupabaseServiceClient();
  const currentMode = stripeLivemode();
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const errors: string[] = [];
  const summary = { checked: 0, secured: 0, processing: 0, failed: 0, unchanged: 0, transfersReconciled: 0, transfersReversed: 0 };

  const { data, error } = await supabase
    .from('connection_payments')
    .select('id,status,stripe_checkout_session_id,stripe_payment_intent_id')
    .eq('stripe_livemode', currentMode)
    .in('status', ['checkout_created', 'processing', 'failed'])
    .not('stripe_checkout_session_id', 'is', null)
    .lte('updated_at', staleBefore)
    .order('updated_at', { ascending: true })
    .limit(50);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  for (const payment of (data ?? []) as Payment[]) {
    summary.checked += 1;
    try {
      const session = await stripeGet<CheckoutSession>(
        `/v1/checkout/sessions/${encodeURIComponent(payment.stripe_checkout_session_id)}`
      );
      const sessionPaymentId = session.metadata?.aspire_payment_id || null;
      if (sessionPaymentId && sessionPaymentId !== payment.id) {
        throw new Error('Stripe Checkout metadata does not match the Aspire payment.');
      }

      const intentId = objectId(session.payment_intent) || payment.stripe_payment_intent_id;
      const intent = intentId
        ? await stripeGet<PaymentIntent>(`/v1/payment_intents/${encodeURIComponent(intentId)}`)
        : null;
      const action = classifyCheckoutReconciliation(session, intent);

      if (action === 'secure') {
        if (!intent) throw new Error('Paid Stripe Checkout Session has no PaymentIntent.');
        const result = await secureConnectionPayment(supabase, payment.id, {
          paymentIntentId: intent.id,
          chargeId: objectId(intent.latest_charge),
          amountReceived: Number(intent.amount_received ?? intent.amount ?? 0),
          currency: String(intent.currency || ''),
          livemode: Boolean(intent.livemode),
          aspirePaymentId: intent.metadata?.aspire_payment_id || sessionPaymentId
        });
        if (result.status === 'secured' || result.status === 'already_terminal') summary.secured += 1;
        else throw new Error('Stripe mode did not match the Aspire payment.');
        continue;
      }

      if (action === 'processing') {
        if (payment.status !== 'processing') {
          const { error: updateError } = await supabase.from('connection_payments').update({
            status: 'processing',
            stripe_payment_intent_id: intentId,
            failure_reason: null,
            updated_at: new Date().toISOString()
          }).eq('id', payment.id).eq('stripe_livemode', currentMode).in('status', ['checkout_created', 'failed']);
          if (updateError) throw updateError;
        }
        summary.processing += 1;
        continue;
      }

      if (action === 'failed') {
        if (payment.status === 'failed') {
          summary.failed += 1;
          continue;
        }
        const reason = intent?.last_payment_error?.message
          || (session.status === 'expired'
            ? 'Stripe Checkout expired before payment completed.'
            : 'Stripe reported that the payment did not complete.');
        const { error: updateError } = await supabase.from('connection_payments').update({
          status: 'failed',
          stripe_payment_intent_id: intentId,
          failure_reason: reason.slice(0, 500),
          updated_at: new Date().toISOString()
        }).eq('id', payment.id).eq('stripe_livemode', currentMode).in('status', ['checkout_created', 'processing', 'failed']);
        if (updateError) throw updateError;
        summary.failed += 1;
        continue;
      }

      summary.unchanged += 1;
    } catch (reconciliationError) {
      const message = reconciliationError instanceof Error ? reconciliationError.message : String(reconciliationError);
      errors.push(`${payment.id}: ${message}`);
    }
  }

  // An HTTP timeout or a dispute arriving while Stripe creates a transfer can
  // leave the transfer at Stripe without a local transfer ID. Reconcile against
  // Stripe after the request has had time to finish, even if the webhook was missed.
  const { data: stalled, error: stalledError } = await supabase.from('connection_payments')
    .select('id,status,stripe_livemode,stripe_transfer_id,stripe_transfer_reversal_id,transfer_recovery_status,transfer_group,provider_net_cents,provider_amount_cents,stripe_transfer_attempted_amount_cents,release_claimed_at,stripe_transfer_attempted_at')
    .eq('stripe_livemode', currentMode)
    .eq('status', 'secured')
    .in('transfer_recovery_status', ['not_required', 'pending'])
    .or(`release_claimed_at.lte.${staleBefore},stripe_transfer_attempted_at.lte.${staleBefore},stripe_transfer_id.not.is.null`)
    .order('updated_at', { ascending: false }).limit(100);
  if (stalledError) errors.push(`transfer reconciliation: ${stalledError.message}`);

  // A refund or dispute may clear release_claimed_at after the Stripe transfer
  // request started. The durable attempt marker retains the audit trail.
  const terminal: NonNullable<typeof stalled> = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const { data: page, error: pageError } = await supabase.from('connection_payments')
      .select('id,status,stripe_livemode,stripe_transfer_id,stripe_transfer_reversal_id,transfer_recovery_status,transfer_group,provider_net_cents,provider_amount_cents,stripe_transfer_attempted_amount_cents,release_claimed_at,stripe_transfer_attempted_at')
      .eq('stripe_livemode', currentMode)
      .in('status', ['disputed', 'refunded'])
      .in('transfer_recovery_status', ['not_required', 'pending'])
      .not('transfer_group', 'is', null)
      .or('stripe_transfer_attempted_at.not.is.null,stripe_transfer_id.not.is.null')
      .order('id', { ascending: true }).range(offset, offset + 99);
    if (pageError) {
      errors.push(`terminal transfer reconciliation: ${pageError.message}`);
      break;
    }
    terminal.push(...(page ?? []));
    if ((page ?? []).length < 100) break;
    if (offset === 900) errors.push('Terminal transfer reconciliation exceeded 1000 records; manual review required.');
  }

  for (const pending of [...(stalled ?? []), ...terminal]) {
    try {
      if (!pending.stripe_transfer_id && pending.stripe_transfer_attempted_at
        && pending.stripe_transfer_attempted_at > staleBefore) continue;
      if (!pending.transfer_group) throw new Error('Transfer group missing; manual reconciliation required.');
      let transfer: ObservedTransfer;
      if (pending.stripe_transfer_id) {
        transfer = await stripeGet<ObservedTransfer>(`/v1/transfers/${encodeURIComponent(pending.stripe_transfer_id)}`);
        if (!matchesSellerTransfer(pending, transfer) || transfer.id !== pending.stripe_transfer_id) {
          throw new Error('Existing transfer reference failed Stripe reconciliation.');
        }
      } else {
        const transfers = await stripeGet<{ data: ObservedTransfer[]; has_more: boolean }>(
          `/v1/transfers?transfer_group=${encodeURIComponent(pending.transfer_group)}&limit=100`
        );
        const matching = transfers.data.filter((item) => matchesSellerTransfer(pending, item));
        if (matching.length !== 1) {
          if (matching.length > 1 || transfers.has_more) throw new Error('Transfer group is ambiguous; manual review required.');
          continue;
        }
        transfer = matching[0];
        const { error: attachError } = await supabase.from('connection_payments')
          .update({ stripe_transfer_id: transfer.id, updated_at: new Date().toISOString() })
          .eq('id', pending.id).eq('stripe_livemode', currentMode).is('stripe_transfer_id', null);
        if (attachError) throw attachError;
      }
      const { data: current, error: currentError } = await supabase.from('connection_payments')
        .select('id,status,stripe_transfer_id,stripe_transfer_reversal_id,provider_net_cents,provider_amount_cents,stripe_transfer_attempted_amount_cents')
        .eq('id', pending.id).maybeSingle();
      if (currentError) throw currentError;
      if (!current || current.stripe_transfer_id !== transfer.id) throw new Error('Transfer reference mismatch.');

      let heldReason: 'refund' | 'dispute' | null = null;
      if (current.status === 'secured') {
        // The guarded SQL RPC checks the order, connection and open cases again.
        const { error: finalizeError } = await supabase.rpc('finalize_connection_payment_release', {
          p_payment_id: pending.id, p_transfer_id: transfer.id
        });
        if (finalizeError) {
          const message = String(finalizeError.message || '');
          if (!/PAYOUT_HOLD_OPEN|CONNECTION_CANCELLED|MARKET_RELEASE_NOT_READY|MARKET_ORDER_MISSING|COMPLETION_NOT_READY|TRANSFER_AMOUNT_CHANGED/.test(message)) throw finalizeError;
          heldReason = 'dispute';
        }
      } else if (current.status === 'disputed' || current.status === 'refunded') {
        heldReason = current.status === 'refunded' ? 'refund' : 'dispute';
      }
      if (heldReason && await reverseHeldTransfer(supabase, current as RecoverableTransferPayment, heldReason)) {
        summary.transfersReversed += 1;
      }
      summary.transfersReconciled += 1;
    } catch (transferError) {
      errors.push(`${pending.id}: ${transferError instanceof Error ? transferError.message : String(transferError)}`);
    }
  }

  // A failed reversal must remain visible even if the first notification call
  // failed. The notification key makes this safe to repeat on every cron run.
  const { data: manualCases, error: manualError } = await supabase.from('connection_payments')
    .select('id,stripe_transfer_id')
    .eq('stripe_livemode', currentMode)
    .eq('transfer_recovery_status', 'manual_required')
    .not('stripe_transfer_id', 'is', null)
    .order('updated_at', { ascending: false }).limit(50);
  if (manualError) errors.push(`manual transfer recovery queue: ${manualError.message}`);
  for (const manualCase of manualCases ?? []) {
    try {
      await alertManualRecovery(supabase, manualCase.id, manualCase.stripe_transfer_id);
    } catch (noticeError) {
      errors.push(`${manualCase.id}: staff alert failed: ${noticeError instanceof Error ? noticeError.message : String(noticeError)}`);
    }
  }

  return NextResponse.json(
    { ok: errors.length === 0, ...summary, errors: errors.slice(0, 10) },
    {
      status: errors.length ? 500 : 200,
      headers: { 'Cache-Control': 'no-store' }
    }
  );
}
