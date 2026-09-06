import { NextResponse } from 'next/server';
import {
  apiError,
  getAuthenticatedUser,
  getSupabaseServiceClient,
  publicOrigin,
  stripeFormRequest
} from '../../../../../lib/server/aspireServer';

type CheckoutSession = {
  id: string;
  url: string | null;
};

type PaymentRow = {
  id: string;
  status: string;
  transfer_group: string;
  checkout_attempt: number;
  base_amount_cents: number | null;
  requester_fee_cents: number | null;
  provider_fee_cents: number | null;
  tip_amount_cents: number;
  tip_fee_cents: number;
  customer_total_cents: number | null;
  provider_net_cents: number | null;
  fee_policy_version: string | null;
  requester_fee_percent_bps: number | null;
  requester_fee_fixed_cents: number | null;
  requester_fee_min_cents: number | null;
  requester_fee_max_cents: number | null;
  provider_fee_percent_bps: number | null;
  tip_fee_percent_bps: number | null;
  minimum_paid_order_cents: number | null;
  fee_snapshot: Record<string, unknown>;
};

type FeeQuote = {
  fee_policy_version: string;
  base_amount_cents: number;
  requester_fee_cents: number;
  provider_fee_cents: number;
  tip_amount_cents: number;
  tip_fee_cents: number;
  customer_total_cents: number;
  provider_net_cents: number;
  platform_fee_revenue_cents: number;
  requester_fee_percent_bps: number;
  requester_fee_fixed_cents: number;
  requester_fee_min_cents: number;
  requester_fee_max_cents: number;
  provider_fee_percent_bps: number;
  tip_fee_percent_bps: number;
  minimum_paid_order_cents: number;
  standard_payout_cadence: string;
};

function quoteFromPayment(payment: PaymentRow): FeeQuote | null {
  if (
    payment.base_amount_cents == null ||
    payment.requester_fee_cents == null ||
    payment.provider_fee_cents == null ||
    payment.customer_total_cents == null ||
    payment.provider_net_cents == null ||
    !payment.fee_policy_version
  ) return null;

  return {
    fee_policy_version: payment.fee_policy_version,
    base_amount_cents: payment.base_amount_cents,
    requester_fee_cents: payment.requester_fee_cents,
    provider_fee_cents: payment.provider_fee_cents,
    tip_amount_cents: Number(payment.tip_amount_cents || 0),
    tip_fee_cents: Number(payment.tip_fee_cents || 0),
    customer_total_cents: payment.customer_total_cents,
    provider_net_cents: payment.provider_net_cents,
    platform_fee_revenue_cents: Number(payment.requester_fee_cents || 0) + Number(payment.provider_fee_cents || 0) + Number(payment.tip_fee_cents || 0),
    requester_fee_percent_bps: Number(payment.requester_fee_percent_bps || 0),
    requester_fee_fixed_cents: Number(payment.requester_fee_fixed_cents || 0),
    requester_fee_min_cents: Number(payment.requester_fee_min_cents || 0),
    requester_fee_max_cents: Number(payment.requester_fee_max_cents || 0),
    provider_fee_percent_bps: Number(payment.provider_fee_percent_bps || 0),
    tip_fee_percent_bps: Number(payment.tip_fee_percent_bps || 0),
    minimum_paid_order_cents: Number(payment.minimum_paid_order_cents || 0),
    standard_payout_cadence: String(payment.fee_snapshot?.standard_payout_cadence || 'weekly')
  };
}

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    if (!user.phone_confirmed_at) throw new Error('PHONE_REQUIRED');

    const body = await request.json().catch(() => ({}));
    const connectionId = typeof body?.connectionId === 'string' ? body.connectionId : '';
    if (!connectionId) return NextResponse.json({ error: 'Missing connection.' }, { status: 400 });

    const supabase = getSupabaseServiceClient();
    const [{ data: verification }, { data: connection }] = await Promise.all([
      supabase.from('school_verifications').select('status').eq('user_id', user.id).maybeSingle(),
      supabase.from('connections').select('*').eq('id', connectionId).maybeSingle()
    ]);

    if (verification?.status !== 'verified') throw new Error('SCHOOL_REQUIRED');
    if (!connection) return NextResponse.json({ error: 'Connection not found.' }, { status: 404 });
    if (connection.requester_id !== user.id) throw new Error('NOT_REQUESTER');
    if (!['confirmed', 'active'].includes(connection.status)) throw new Error('CONNECTION_NOT_READY');

    const [{ data: aspireRequest }, { data: payoutAccount }, { data: existingPayment }] = await Promise.all([
      supabase.from('requests').select('id,title,kind,amount_cents,currency,campus_id').eq('id', connection.request_id).maybeSingle(),
      supabase.from('payment_accounts').select('stripe_account_id,status,transfers_enabled').eq('user_id', connection.responder_id).maybeSingle(),
      supabase.from('connection_payments').select('*').eq('connection_id', connection.id).maybeSingle()
    ]);

    if (!aspireRequest) return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
    if (connection.payment_method !== 'aspire') throw new Error('PAYMENT_NOT_REQUIRED');
    if (!payoutAccount?.stripe_account_id || payoutAccount.status !== 'READY' || payoutAccount.transfers_enabled !== true) {
      throw new Error('PAYOUT_NOT_READY');
    }
    if (existingPayment && ['secured', 'released'].includes(existingPayment.status)) throw new Error('PAYMENT_ALREADY_SECURED');

    const baseAmount = Number(connection.agreed_amount_cents ?? aspireRequest.amount_cents ?? 0);
    if (!Number.isInteger(baseAmount) || baseAmount <= 0) {
      return NextResponse.json({ error: 'This connection does not have a valid agreed amount yet.' }, { status: 409 });
    }

    let quote = existingPayment ? quoteFromPayment(existingPayment as PaymentRow) : null;
    if (!quote) {
      const { data: quoteRows, error: quoteError } = await supabase.rpc('quote_aspire_fees', {
        p_base_amount_cents: baseAmount,
        p_campus_id: aspireRequest.campus_id || null,
        p_tip_amount_cents: 0
      });
      if (quoteError) throw quoteError;
      quote = (quoteRows?.[0] || null) as FeeQuote | null;
    }

    if (!quote) return NextResponse.json({ error: 'Aspire fee policy is unavailable.' }, { status: 503 });
    if (baseAmount < quote.minimum_paid_order_cents) {
      return NextResponse.json({
        error: `Pay with Aspire currently requires a minimum paid order of $${(quote.minimum_paid_order_cents / 100).toFixed(2)}.`,
        code: 'MINIMUM_PAID_ORDER'
      }, { status: 409 });
    }

    const currency = String(aspireRequest.currency || 'USD').toUpperCase();
    const transferGroup = existingPayment?.transfer_group || `aspire_${connection.id.replace(/-/g, '')}`;
    const feeSnapshot = {
      version: quote.fee_policy_version,
      requester_fee_percent_bps: quote.requester_fee_percent_bps,
      requester_fee_fixed_cents: quote.requester_fee_fixed_cents,
      requester_fee_min_cents: quote.requester_fee_min_cents,
      requester_fee_max_cents: quote.requester_fee_max_cents,
      provider_fee_percent_bps: quote.provider_fee_percent_bps,
      tip_fee_percent_bps: quote.tip_fee_percent_bps,
      minimum_paid_order_cents: quote.minimum_paid_order_cents,
      standard_payout_cadence: quote.standard_payout_cadence
    };

    let payment = existingPayment as PaymentRow | null;
    const paymentValues = {
      currency,
      base_amount_cents: quote.base_amount_cents,
      requester_fee_cents: quote.requester_fee_cents,
      provider_fee_cents: quote.provider_fee_cents,
      tip_amount_cents: quote.tip_amount_cents,
      tip_fee_cents: quote.tip_fee_cents,
      customer_total_cents: quote.customer_total_cents,
      provider_net_cents: quote.provider_net_cents,
      fee_policy_version: quote.fee_policy_version,
      requester_fee_percent_bps: quote.requester_fee_percent_bps,
      requester_fee_fixed_cents: quote.requester_fee_fixed_cents,
      requester_fee_min_cents: quote.requester_fee_min_cents,
      requester_fee_max_cents: quote.requester_fee_max_cents,
      provider_fee_percent_bps: quote.provider_fee_percent_bps,
      tip_fee_percent_bps: quote.tip_fee_percent_bps,
      minimum_paid_order_cents: quote.minimum_paid_order_cents,
      fee_snapshot: feeSnapshot,
      // Backward-compatible aliases used by earlier V2 code.
      gross_amount_cents: quote.customer_total_cents,
      platform_fee_cents: quote.platform_fee_revenue_cents,
      provider_amount_cents: quote.provider_net_cents
    };

    if (!payment) {
      const { data, error } = await supabase.from('connection_payments').insert({
        connection_id: connection.id,
        request_id: aspireRequest.id,
        payer_id: connection.requester_id,
        payee_id: connection.responder_id,
        status: 'not_started',
        transfer_group: transferGroup,
        ...paymentValues
      }).select('*').single();
      if (error) throw error;
      payment = data as PaymentRow;
    } else {
      const { data, error } = await supabase.from('connection_payments').update({
        ...paymentValues,
        updated_at: new Date().toISOString()
      }).eq('id', payment.id).select('*').single();
      if (error) throw error;
      payment = data as PaymentRow;
    }

    const attempt = Number(payment.checkout_attempt || 0) + 1;
    const origin = publicOrigin(request);
    if (!origin.startsWith('https://')) throw new Error('MISSING_ENV:NEXT_PUBLIC_SITE_URL');

    const checkoutParams: Record<string, string | number | boolean | null | undefined> = {
      mode: 'payment',
      customer_email: user.email || undefined,
      'line_items[0][price_data][currency]': currency.toLowerCase(),
      'line_items[0][price_data][product_data][name]': String(aspireRequest.title).slice(0, 100),
      'line_items[0][price_data][product_data][description]': 'Aspire 101 connection',
      'line_items[0][price_data][unit_amount]': quote.base_amount_cents,
      'line_items[0][quantity]': 1,
      'line_items[1][price_data][currency]': currency.toLowerCase(),
      'line_items[1][price_data][product_data][name]': 'Aspire 101 Service Fee',
      'line_items[1][price_data][product_data][description]': 'Supports secure payments, support, trust & safety, and platform operations.',
      'line_items[1][price_data][unit_amount]': quote.requester_fee_cents,
      'line_items[1][quantity]': 1,
      'payment_intent_data[transfer_group]': transferGroup,
      'payment_intent_data[metadata][aspire_payment_id]': payment.id,
      'payment_intent_data[metadata][connection_id]': connection.id,
      'payment_intent_data[metadata][request_id]': aspireRequest.id,
      'payment_intent_data[metadata][payer_id]': connection.requester_id,
      'payment_intent_data[metadata][payee_id]': connection.responder_id,
      'payment_intent_data[metadata][fee_policy_version]': quote.fee_policy_version,
      'metadata[aspire_payment_id]': payment.id,
      'metadata[connection_id]': connection.id,
      'metadata[fee_policy_version]': quote.fee_policy_version,
      success_url: `${origin}/connections?payment=success&connection=${encodeURIComponent(connection.id)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/connections?payment=cancelled&connection=${encodeURIComponent(connection.id)}`
    };

    if (quote.tip_amount_cents > 0) {
      checkoutParams['line_items[2][price_data][currency]'] = currency.toLowerCase();
      checkoutParams['line_items[2][price_data][product_data][name]'] = 'Tip';
      checkoutParams['line_items[2][price_data][unit_amount]'] = quote.tip_amount_cents;
      checkoutParams['line_items[2][quantity]'] = 1;
    }

    const session = await stripeFormRequest<CheckoutSession>('/v1/checkout/sessions', checkoutParams, {
      idempotencyKey: `aspire_checkout_${payment.id}_${attempt}`
    });

    if (!session.url) throw new Error('STRIPE:Checkout did not return a redirect URL.');

    const { error: saveError } = await supabase.from('connection_payments').update({
      status: 'checkout_created',
      checkout_attempt: attempt,
      stripe_checkout_session_id: session.id,
      failure_reason: null,
      updated_at: new Date().toISOString()
    }).eq('id', payment.id);
    if (saveError) throw saveError;

    return NextResponse.json({
      url: session.url,
      paymentId: payment.id,
      status: 'checkout_created',
      feePolicyVersion: quote.fee_policy_version,
      baseAmountCents: quote.base_amount_cents,
      requesterFeeCents: quote.requester_fee_cents,
      customerTotalCents: quote.customer_total_cents,
      providerFeeCents: quote.provider_fee_cents,
      providerNetCents: quote.provider_net_cents,
      tipAmountCents: quote.tip_amount_cents
    });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
