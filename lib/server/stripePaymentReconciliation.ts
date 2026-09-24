import type { SupabaseClient } from '@supabase/supabase-js';

export type LocalPaymentSnapshot = {
  id: string;
  status: string;
  customer_total_cents: number | null;
  gross_amount_cents: number | null;
  currency: string | null;
  stripe_livemode: boolean;
  paid_at?: string | null;
};

export type StripePaymentEvidence = {
  paymentIntentId: string;
  chargeId: string | null;
  amountReceived: number;
  currency: string;
  livemode: boolean;
  aspirePaymentId?: string | null;
};

export type StripeCheckoutSnapshot = {
  status?: 'open' | 'complete' | 'expired' | null;
  payment_status?: 'paid' | 'unpaid' | 'no_payment_required' | null;
};

export type StripeIntentSnapshot = {
  status?: string | null;
};

export type CheckoutReconciliationAction = 'secure' | 'processing' | 'failed' | 'unchanged';

export function classifyCheckoutReconciliation(
  session: StripeCheckoutSnapshot,
  intent?: StripeIntentSnapshot | null
): CheckoutReconciliationAction {
  if (session.payment_status === 'paid') {
    return intent?.status === 'succeeded' ? 'secure' : 'processing';
  }
  if (intent?.status === 'succeeded') return 'secure';
  if (intent && ['canceled', 'requires_payment_method'].includes(String(intent.status))) return 'failed';
  if (session.status === 'complete') return 'processing';
  if (session.status === 'expired') return 'failed';
  return 'unchanged';
}

export function validateStripePaymentEvidence(
  payment: LocalPaymentSnapshot,
  evidence: StripePaymentEvidence
) {
  if (payment.stripe_livemode !== evidence.livemode) {
    return { matchesMode: false as const };
  }
  if (evidence.aspirePaymentId && evidence.aspirePaymentId !== payment.id) {
    throw new Error('STRIPE:Stripe payment metadata did not match the Aspire payment record.');
  }

  const expectedAmount = Number(payment.customer_total_cents ?? payment.gross_amount_cents ?? 0);
  const expectedCurrency = String(payment.currency || 'USD').toLowerCase();
  const receivedCurrency = String(evidence.currency || '').toLowerCase();
  if (
    expectedAmount <= 0 ||
    evidence.amountReceived !== expectedAmount ||
    receivedCurrency !== expectedCurrency
  ) {
    throw new Error('STRIPE:Stripe payment amount or currency did not match the Aspire fee snapshot.');
  }
  if (!evidence.paymentIntentId) {
    throw new Error('STRIPE:Stripe payment confirmation did not include a PaymentIntent.');
  }
  return { matchesMode: true as const };
}

export async function secureConnectionPayment(
  supabase: SupabaseClient,
  paymentId: string,
  evidence: StripePaymentEvidence
) {
  const { data: payment, error: paymentError } = await supabase
    .from('connection_payments')
    .select('id,status,customer_total_cents,gross_amount_cents,currency,stripe_livemode,paid_at')
    .eq('id', paymentId)
    .maybeSingle();
  if (paymentError) throw paymentError;
  if (!payment) throw new Error('STRIPE:Aspire payment record was not found for the completed payment.');

  const validation = validateStripePaymentEvidence(payment as LocalPaymentSnapshot, evidence);
  if (!validation.matchesMode) return { status: 'mode_mismatch' as const };

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from('connection_payments')
    .update({
      status: 'secured',
      stripe_payment_intent_id: evidence.paymentIntentId,
      stripe_charge_id: evidence.chargeId,
      failure_reason: null,
      paid_at: payment.paid_at || now,
      updated_at: now
    })
    .eq('id', paymentId)
    .eq('stripe_livemode', evidence.livemode)
    .in('status', ['not_started', 'checkout_created', 'processing', 'failed', 'secured'])
    .select('id,status')
    .maybeSingle();
  if (error) throw error;

  if (!updated) {
    const { data: latest, error: latestError } = await supabase
      .from('connection_payments')
      .select('status')
      .eq('id', paymentId)
      .maybeSingle();
    if (latestError) throw latestError;
    if (latest && ['released', 'refunded', 'disputed'].includes(String(latest.status))) {
      return { status: 'already_terminal' as const };
    }
    throw new Error('STRIPE:Aspire payment state changed before payment confirmation could be saved.');
  }

  return { status: 'secured' as const };
}
