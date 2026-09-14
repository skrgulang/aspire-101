import { NextResponse } from 'next/server';
import {
  apiError,
  getAuthenticatedUser,
  getStripePayoutState,
  getSupabaseServiceClient,
  publicOrigin,
  stripeFormRequest,
  stripeGet,
  stripeLivemode
} from '../../../../../lib/server/aspireServer';

type CheckoutSession = {
  id: string;
  url: string | null;
  status?: 'open' | 'complete' | 'expired' | null;
  payment_status?: 'paid' | 'unpaid' | 'no_payment_required' | null;
};

type PaymentRow = {
  id: string;
  status: string;
  transfer_group: string;
  checkout_attempt: number;
  stripe_checkout_session_id: string | null;
  payer_id?: string;
  payee_id?: string;
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
    const livemode = stripeLivemode();
    const [{ data: verification }, { data: connection }] = await Promise.all([
      supabase.from('school_verifications').select('status').eq('user_id', user.id).maybeSingle(),
      supabase.from('connections').select('*').eq('id', connectionId).maybeSingle()
    ]);

    if (verification?.status !== 'verified') throw new Error('SCHOOL_REQUIRED');
    if (!connection) return NextResponse.json({ error: 'Connection not found.' }, { status: 404 });
    if (!['confirmed', 'active'].includes(connection.status)) throw new Error('CONNECTION_NOT_READY');

    const [{ data: aspireRequest }, { data: existingPayment }, { data: marketOrder }] = await Promise.all([
      supabase.from('requests').select('id,title,kind,amount_cents,currency,campus_id,market_intent').eq('id', connection.request_id).maybeSingle(),
      supabase.from('connection_payments').select('*').eq('connection_id', connection.id).maybeSingle(),
      supabase.from('market_orders').select('id,buyer_id,seller_id,status').eq('connection_id', connection.id).maybeSingle()
    ]);

    if (!aspireRequest) return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
    if (connection.payment_method !== 'aspire') throw new Error('PAYMENT_NOT_REQUIRED');

    const isMarket = aspireRequest.kind === 'buy_sell';
    if (isMarket && !marketOrder) {
      return NextResponse.json({ error: 'This marketplace order is not initialized yet. Reconnect to the listing and try again.', code: 'MARKET_ORDER_NOT_READY' }, { status: 409 });
    }

    const payerId = isMarket ? marketOrder!.buyer_id : connection.requester_id;
    const payeeId = isMarket ? marketOrder!.seller_id : connection.responder_id;

    if (user.id !== payerId) {
      return NextResponse.json({ error: isMarket ? 'Only the buyer can secure payment for this marketplace order.' : 'Only the requester can start this payment.', code: 'NOT_PAYER' }, { status: 403 });
    }
    if (isMarket && ['disputed', 'released', 'refunded', 'cancelled'].includes(String(marketOrder!.status))) {
      return NextResponse.json({ error: 'This marketplace order can no longer accept a new payment.', code: 'MARKET_ORDER_CLOSED' }, { status: 409 });
    }

    const { data: payoutAccount } = await supabase
      .from('payment_accounts')
      .select('stripe_account_id,status,transfers_enabled')
      .eq('user_id', payeeId)
      .eq('livemode', livemode)
      .maybeSingle();

    if (!payoutAccount?.stripe_account_id) throw new Error('PAYOUT_NOT_READY');

    // Do not trust a stale local flag. Accounts v2 is the source of truth immediately before checkout.
    const payoutState = await getStripePayoutState(payoutAccount.stripe_account_id);
    await supabase.from('payment_accounts').update({
      status: payoutState.status,
      transfers_enabled: payoutState.ready,
      requirements_due: payoutState.requirementsDue,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq('user_id', payeeId).eq('livemode', livemode);
    if (!payoutState.ready) throw new Error('PAYOUT_NOT_READY');

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
      standard_payout_cadence: quote.standard_payout_cadence,
      transaction_type: isMarket ? 'marketplace_physical_goods' : 'connection_service'
    };

    let payment = existingPayment as PaymentRow | null;
    const paymentValues = {
      payer_id: payerId,
      payee_id: payeeId,
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
      gross_amount_cents: quote.customer_total_cents,
      platform_fee_cents: quote.platform_fee_revenue_cents,
      provider_amount_cents: quote.provider_net_cents
    };

    if (!payment) {
      const { data, error } = await supabase.from('connection_payments').insert({
        connection_id: connection.id,
        request_id: aspireRequest.id,
        status: 'not_started',
        transfer_group: transferGroup,
        ...paymentValues
      }).select('*').single();

      if (error) {
        // Two first-click requests can both observe "no payment" before either insert
        // commits. The unique connection_id row is the lock: the loser reuses the
        // row that just won instead of surfacing a duplicate-key failure to the user.
        if (error.code !== '23505') throw error;
        const { data: concurrentPayment, error: concurrentPaymentError } = await supabase
          .from('connection_payments')
          .select('*')
          .eq('connection_id', connection.id)
          .maybeSingle();
        if (concurrentPaymentError) throw concurrentPaymentError;
        if (!concurrentPayment) throw error;
        payment = concurrentPayment as PaymentRow;
      } else {
        payment = data as PaymentRow;
      }
    } else {
      const { data, error } = await supabase.from('connection_payments').update({
        ...paymentValues,
        updated_at: new Date().toISOString()
      }).eq('id', payment.id).select('*').single();
      if (error) throw error;
      payment = data as PaymentRow;
    }

    if (payment.status === 'processing') {
      return NextResponse.json({
        error: 'Payment has already been submitted and is still being confirmed by Stripe.',
        code: 'PAYMENT_PROCESSING'
      }, { status: 409 });
    }

    if (payment.stripe_checkout_session_id && ['checkout_created', 'failed'].includes(payment.status)) {
      const previousSession = await stripeGet<CheckoutSession>(
        `/v1/checkout/sessions/${encodeURIComponent(payment.stripe_checkout_session_id)}`
      );

      if (previousSession.payment_status === 'paid') {
        return NextResponse.json({
          error: 'Payment has already been submitted and is still being confirmed by Stripe.',
          code: 'PAYMENT_PROCESSING'
        }, { status: 409 });
      }

      if (previousSession.status === 'open') {
        if (!previousSession.url) throw new Error('STRIPE:Existing checkout is still open but has no redirect URL.');
        return NextResponse.json({
          url: previousSession.url,
          paymentId: payment.id,
          status: 'checkout_created',
          transactionType: isMarket ? 'marketplace' : 'connection',
          payerId,
          payeeId,
          feePolicyVersion: quote.fee_policy_version,
          baseAmountCents: quote.base_amount_cents,
          requesterFeeCents: quote.requester_fee_cents,
          customerTotalCents: quote.customer_total_cents,
          providerFeeCents: quote.provider_fee_cents,
          providerNetCents: quote.provider_net_cents,
          tipAmountCents: quote.tip_amount_cents,
          reusedCheckout: true
        });
      }

      // A completed Checkout Session should not be replaced while the webhook is still
      // advancing the local payment state. Failed asynchronous payments are the exception:
      // those need a fresh session because the completed Checkout Session cannot be reused.
      if (previousSession.status === 'complete' && payment.status !== 'failed') {
        return NextResponse.json({
          error: 'Payment has already been submitted and is still being confirmed by Stripe.',
          code: 'PAYMENT_PROCESSING'
        }, { status: 409 });
      }
    }

    const attempt = Number(payment.checkout_attempt || 0) + 1;
    const origin = publicOrigin(request);
    if (!origin.startsWith('https://')) throw new Error('MISSING_ENV:NEXT_PUBLIC_SITE_URL');

    const checkoutParams: Record<string, string | number | boolean | null | undefined> = {
      mode: 'payment',
      customer_email: user.email || undefined,
      'line_items[0][price_data][currency]': currency.toLowerCase(),
      'line_items[0][price_data][product_data][name]': String(aspireRequest.title).slice(0, 100),
      'line_items[0][price_data][product_data][description]': isMarket ? 'Aspire Protected campus marketplace purchase' : 'Aspire 101 connection',
      'line_items[0][price_data][unit_amount]': quote.base_amount_cents,
      'line_items[0][quantity]': 1,
      'line_items[1][price_data][currency]': currency.toLowerCase(),
      'line_items[1][price_data][product_data][name]': 'Aspire 101 Service Fee',
      'line_items[1][price_data][product_data][description]': 'Supports payments, support, trust & safety, dispute review, and platform operations.',
      'line_items[1][price_data][unit_amount]': quote.requester_fee_cents,
      'line_items[1][quantity]': 1,
      'payment_intent_data[transfer_group]': transferGroup,
      'payment_intent_data[metadata][aspire_payment_id]': payment.id,
      'payment_intent_data[metadata][connection_id]': connection.id,
      'payment_intent_data[metadata][request_id]': aspireRequest.id,
      'payment_intent_data[metadata][payer_id]': payerId,
      'payment_intent_data[metadata][payee_id]': payeeId,
      'payment_intent_data[metadata][transaction_type]': isMarket ? 'marketplace' : 'connection',
      'payment_intent_data[metadata][fee_policy_version]': quote.fee_policy_version,
      'metadata[aspire_payment_id]': payment.id,
      'metadata[connection_id]': connection.id,
      'metadata[transaction_type]': isMarket ? 'marketplace' : 'connection',
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

    const { data: savedPayment, error: saveError } = await supabase.from('connection_payments').update({
      status: 'checkout_created',
      checkout_attempt: attempt,
      stripe_checkout_session_id: session.id,
      failure_reason: null,
      updated_at: new Date().toISOString()
    })
      .eq('id', payment.id)
      .in('status', ['not_started', 'checkout_created', 'failed'])
      .select('status')
      .maybeSingle();
    if (saveError) throw saveError;

    if (!savedPayment) {
      const { data: latestPayment, error: latestError } = await supabase
        .from('connection_payments')
        .select('status')
        .eq('id', payment.id)
        .maybeSingle();
      if (latestError) throw latestError;
      if (latestPayment && ['processing', 'secured', 'released'].includes(String(latestPayment.status))) {
        return NextResponse.json({
          error: 'Payment has already been submitted and is still being confirmed by Stripe.',
          code: 'PAYMENT_PROCESSING'
        }, { status: 409 });
      }
      throw new Error('STRIPE:Checkout state changed while creating the payment session. Try again.');
    }

    return NextResponse.json({
      url: session.url,
      paymentId: payment.id,
      status: 'checkout_created',
      transactionType: isMarket ? 'marketplace' : 'connection',
      payerId,
      payeeId,
      feePolicyVersion: quote.fee_policy_version,
      baseAmountCents: quote.base_amount_cents,
      requesterFeeCents: quote.requester_fee_cents,
      customerTotalCents: quote.customer_total_cents,
      providerFeeCents: quote.provider_fee_cents,
      providerNetCents: quote.provider_net_cents,
      tipAmountCents: quote.tip_amount_cents,
      reusedCheckout: false
    });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
