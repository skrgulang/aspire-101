import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  getSupabaseServiceClient,
  stripeGet,
  stripeLivemode
} from '../../../../lib/server/aspireServer';
import {
  classifyCheckoutReconciliation,
  secureConnectionPayment
} from '../../../../lib/server/stripePaymentReconciliation';

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
  const summary = { checked: 0, secured: 0, processing: 0, failed: 0, unchanged: 0 };

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

  return NextResponse.json(
    { ok: errors.length === 0, ...summary, errors: errors.slice(0, 10) },
    {
      status: errors.length ? 500 : 200,
      headers: { 'Cache-Control': 'no-store' }
    }
  );
}
