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
  amount_total?: number | null;
};

type PaymentRow = {
  id: string;
  status: string;
  transfer_group: string;
  checkout_attempt: number;
  stripe_checkout_session_id: string | null;
  stripe_livemode: boolean;
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
      supabase.from('requests').select('id,title,kind,amount_cents,currency,campus_id,market_intent,seller_livemode').eq('id', connection.request_id).maybeSingle(),
      supabase.from('connection_payments').select('*').eq('connection_id', connection.id).maybeSingle(),
      supabase
        .from('market_orders')
        .select('id,buyer_id,seller_id,status,fulfillment_method,shipping_rate_id,shipping_rate_cents,shipping_currency,shipping_paid_by,shipping_carrier,shipping_service')
        .eq('connection_id', connection.id)
        .maybeSingle()
    ]);

    if (!aspireRequest) return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
    if (connection.payment_method !== 'aspire') throw new Error('PAYMENT_NOT_REQUIRED');

    const isMarket = aspireRequest.kind === 'buy_sell';
    if (
      isMarket
      && aspireRequest.market_intent === 'sell'
      && aspireRequest.seller_livemode !== livemode
    ) {
      return NextResponse.json({
        error: 'This listing was verified in a different Stripe environment. The seller must relist it before payment can continue.',
        code: 'LISTING_PAYMENT_MODE_MISMATCH'
      }, { status: 409 });
    }
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

    let paymentSeed = existingPayment as PaymentRow | null;
    if (paymentSeed && paymentSeed.stripe_livemode !== livemode) {
      const resettable = new Set(['not_started', 'checkout_created', 'failed', 'cancelled']);
      if (!resettable.has(paymentSeed.status)) {
        return NextResponse.json({
          error: 'This payment belongs to a different Stripe mode and cannot be reused.',
          code: 'PAYMENT_MODE_MISMATCH'
        }, { status: 409 });
      }

      const { data: resetPayment, error: resetError } = await supabase
        .from('connection_payments')
        .update({
          stripe_livemode: livemode,
          status: 'not_started',
          checkout_attempt: 0,
          stripe_checkout_session_id: null,
          stripe_payment_intent_id: null,
          stripe_charge_id: null,
          stripe_transfer_id: null,
          stripe_refund_id: null,
          release_claimed_at: null,
          refund_claimed_at: null,
          paid_at: null,
          released_at: null,
          refunded_at: null,
          disputed_at: null,
          failure_reason: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', paymentSeed.id)
        .select('*')
        .single();
      if (resetError) throw resetError;
      paymentSeed = resetPayment as PaymentRow;
    }

    if (paymentSeed && ['secured', 'released'].includes(paymentSeed.status)) throw new Error('PAYMENT_ALREADY_SECURED');

    const baseAmount = Number(connection.agreed_amount_cents ?? aspireRequest.amount_cents ?? 0);
    if (!Number.isInteger(baseAmount) || baseAmount <= 0) {
      return NextResponse.json({ error: 'This connection does not have a valid agreed amount yet.' }, { status: 409 });
    }

    const { data: quoteRows, error: quoteError } = await supabase.rpc('quote_aspire_fees', {
      p_base_amount_cents: baseAmount,
      p_campus_id: aspireRequest.campus_id || null,
      p_tip_amount_cents: 0
    });
    if (quoteError) throw quoteError;
    const quote = (quoteRows?.[0] || null) as FeeQuote | null;

    if (!quote) return NextResponse.json({ error: 'Aspire fee policy is unavailable.' }, { status: 503 });
    if (baseAmount < quote.minimum_paid_order_cents) {
      return NextResponse.json({
        error: `Pay with Aspire currently requires a minimum paid order of $${(quote.minimum_paid_order_cents / 100).toFixed(2)}.`,
        code: 'MINIMUM_PAID_ORDER'
      }, { status: 409 });
    }

    const currency = String(aspireRequest.currency || 'USD').toUpperCase();
    const shippingOrder = Boolean(isMarket && marketOrder?.fulfillment_method === 'shipping');
    const shippingRateCents = shippingOrder ? Number(marketOrder?.shipping_rate_cents ?? 0) : 0;
    const shippingPaidBy = shippingOrder ? String(marketOrder?.shipping_paid_by || '') : null;
    const shippingCurrency = shippingOrder ? String(marketOrder?.shipping_currency || currency).toUpperCase() : null;

    if (shippingOrder) {
      if (!marketOrder?.shipping_rate_id || !Number.isInteger(shippingRateCents) || shippingRateCents < 0) {
        return NextResponse.json({ error: 'Choose a live carrier rate before payment.', code: 'SHIPPING_RATE_REQUIRED' }, { status: 409 });
      }
      if (shippingPaidBy !== 'buyer' && shippingPaidBy !== 'seller') {
        return NextResponse.json({ error: 'Choose who pays for carrier shipping before payment.', code: 'SHIPPING_PAYER_REQUIRED' }, { status: 409 });
      }
      if (shippingCurrency !== currency) {
        return NextResponse.json({ error: 'The selected shipping rate currency does not match this order.', code: 'SHIPPING_CURRENCY_MISMATCH' }, { status: 409 });
      }
    }

    const shippingChargedToBuyer = shippingOrder && shippingPaidBy === 'buyer' ? shippingRateCents : 0;
    const shippingChargedToSeller = shippingOrder && shippingPaidBy === 'seller' ? shippingRateCents : 0;
    const customerTotalCents = quote.customer_total_cents + shippingChargedToBuyer;
    const providerNetCents = quote.provider_net_cents - shippingChargedToSeller;

    if (!Number.isInteger(customerTotalCents) || customerTotalCents <= 0) {
      return NextResponse.json({ error: 'The checkout total is invalid. Refresh the order and try again.', code: 'INVALID_CHECKOUT_TOTAL' }, { status: 409 });
    }
    if (!Number.isInteger(providerNetCents) || providerNetCents <= 0) {
      return NextResponse.json({ error: 'This shipping rate leaves no seller proceeds. Choose another rate or have the buyer cover shipping.', code: 'SHIPPING_EXCEEDS_SELLER_PROCEEDS' }, { status: 409 });
    }

    const transferGroup = paymentSeed?.transfer_group || `aspire_${connection.id.replace(/-/g, '')}`;
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
      transaction_type: isMarket ? 'marketplace_physical_goods' : 'connection_service',
      shipping_rate_id: shippingOrder ? marketOrder?.shipping_rate_id || null : null,
      shipping_rate_cents: shippingOrder ? shippingRateCents : 0,
      shipping_paid_by: shippingPaidBy,
      shipping_carrier: shippingOrder ? marketOrder?.shipping_carrier || null : null,
      shipping_service: shippingOrder ? marketOrder?.shipping_service || null : null,
      customer_total_cents: customerTotalCents,
      provider_net_cents: providerNetCents
    };

    let payment = paymentSeed;
    const paymentValues = {
      stripe_livemode: livemode,
      payer_id: payerId,
      payee_id: payeeId,
      currency,
      base_amount_cents: quote.base_amount_cents,
      requester_fee_cents: quote.requester_fee_cents,
      provider_fee_cents: quote.provider_fee_cents,
      tip_amount_cents: quote.tip_amount_cents,
      tip_fee_cents: quote.tip_fee_cents,
      customer_total_cents: customerTotalCents,
      provider_net_cents: providerNetCents,
      fee_policy_version: quote.fee_policy_version,
      requester_fee_percent_bps: quote.requester_fee_percent_bps,
      requester_fee_fixed_cents: quote.requester_fee_fixed_cents,
      requester_fee_min_cents: quote.requester_fee_min_cents,
      requester_fee_max_cents: quote.requester_fee_max_cents,
      provider_fee_percent_bps: quote.provider_fee_percent_bps,
      tip_fee_percent_bps: quote.tip_fee_percent_bps,
      minimum_paid_order_cents: quote.minimum_paid_order_cents,
      fee_snapshot: feeSnapshot,
      gross_amount_cents: customerTotalCents,
      platform_fee_cents: quote.platform_fee_revenue_cents,
      provider_amount_cents: providerNetCents
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
        if (Number(previousSession.amount_total ?? 0) === customerTotalCents) {
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
            customerTotalCents,
            providerFeeCents: quote.provider_fee_cents,
            providerNetCents,
            tipAmountCents: quote.tip_amount_cents,
            shippingRateCents,
            shippingPaidBy,
            reusedCheckout: true
          });
        }

        // Older open sessions may have been created before a live carrier rate was
        // attached. Expire an amount-mismatched session instead of letting Stripe
        // collect a total that the webhook will correctly reject later.
        await stripeFormRequest<CheckoutSession>(
          `/v1/checkout/sessions/${encodeURIComponent(payment.stripe_checkout_session_id)}/expire`,
          {}
        );
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

    const { error: checkoutRateError } = await supabase.rpc('claim_payment_checkout_attempt', {
      p_user_id: user.id,
      p_connection_id: connection.id
    });
    if (checkoutRateError) {
      if (checkoutRateError.message.includes('CHECKOUT_RATE_LIMIT')) {
        return NextResponse.json({
          error: 'Too many new checkout attempts. Wait a few minutes and use the existing checkout link if one is still open.',
          code: 'CHECKOUT_RATE_LIMIT'
        }, { status: 429 });
      }
      throw checkoutRateError;
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
      'payment_intent_data[metadata][checkout_attempt]': attempt,
      'payment_intent_data[metadata][connection_id]': connection.id,
      'payment_intent_data[metadata][request_id]': aspireRequest.id,
      'payment_intent_data[metadata][payer_id]': payerId,
      'payment_intent_data[metadata][payee_id]': payeeId,
      'payment_intent_data[metadata][transaction_type]': isMarket ? 'marketplace' : 'connection',
      'payment_intent_data[metadata][fee_policy_version]': quote.fee_policy_version,
      'payment_intent_data[metadata][shipping_rate_id]': shippingOrder ? marketOrder?.shipping_rate_id || '' : '',
      'payment_intent_data[metadata][shipping_rate_cents]': shippingOrder ? shippingRateCents : 0,
      'payment_intent_data[metadata][shipping_paid_by]': shippingPaidBy || '',
      'metadata[aspire_payment_id]': payment.id,
      'metadata[checkout_attempt]': attempt,
      'metadata[connection_id]': connection.id,
      'metadata[transaction_type]': isMarket ? 'marketplace' : 'connection',
      'metadata[fee_policy_version]': quote.fee_policy_version,
      'metadata[shipping_rate_id]': shippingOrder ? marketOrder?.shipping_rate_id || '' : '',
      'metadata[shipping_rate_cents]': shippingOrder ? shippingRateCents : 0,
      'metadata[shipping_paid_by]': shippingPaidBy || '',
      success_url: isMarket
        ? `${origin}/transactions?payment=success&connection=${encodeURIComponent(connection.id)}${shippingOrder ? '&delivery=ship' : ''}&session_id={CHECKOUT_SESSION_ID}`
        : `${origin}/connections?payment=success&connection=${encodeURIComponent(connection.id)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: isMarket
        ? `${origin}/transactions?payment=cancelled&connection=${encodeURIComponent(connection.id)}${shippingOrder ? '&delivery=ship' : ''}`
        : `${origin}/connections?payment=cancelled&connection=${encodeURIComponent(connection.id)}`
    };

    let nextLineItemIndex = 2;
    if (shippingChargedToBuyer > 0) {
      checkoutParams[`line_items[${nextLineItemIndex}][price_data][currency]`] = currency.toLowerCase();
      checkoutParams[`line_items[${nextLineItemIndex}][price_data][product_data][name]`] = 'Carrier shipping';
      checkoutParams[`line_items[${nextLineItemIndex}][price_data][product_data][description]`] = [marketOrder?.shipping_carrier, marketOrder?.shipping_service].filter(Boolean).join(' · ') || 'Live Shippo carrier rate';
      checkoutParams[`line_items[${nextLineItemIndex}][price_data][unit_amount]`] = shippingChargedToBuyer;
      checkoutParams[`line_items[${nextLineItemIndex}][quantity]`] = 1;
      nextLineItemIndex += 1;
    }

    if (quote.tip_amount_cents > 0) {
      checkoutParams[`line_items[${nextLineItemIndex}][price_data][currency]`] = currency.toLowerCase();
      checkoutParams[`line_items[${nextLineItemIndex}][price_data][product_data][name]`] = 'Tip';
      checkoutParams[`line_items[${nextLineItemIndex}][price_data][unit_amount]`] = quote.tip_amount_cents;
      checkoutParams[`line_items[${nextLineItemIndex}][quantity]`] = 1;
    }

    const stripeLineItemTotal = quote.base_amount_cents + quote.requester_fee_cents + quote.tip_amount_cents + shippingChargedToBuyer;
    if (stripeLineItemTotal !== customerTotalCents) {
      throw new Error('STRIPE:Checkout line items do not match the Aspire payment snapshot.');
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
      customerTotalCents,
      providerFeeCents: quote.provider_fee_cents,
      providerNetCents,
      tipAmountCents: quote.tip_amount_cents,
      shippingRateCents,
      shippingPaidBy,
      reusedCheckout: false
    });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
