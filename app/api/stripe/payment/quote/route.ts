import { NextResponse } from 'next/server';
import { apiError, getAuthenticatedUser, getSupabaseServiceClient } from '../../../../../lib/server/aspireServer';

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
    const body = await request.json().catch(() => ({}));
    const connectionId = typeof body?.connectionId === 'string' ? body.connectionId : '';
    if (!connectionId) return NextResponse.json({ error: 'Missing connection.' }, { status: 400 });

    const supabase = getSupabaseServiceClient();
    const { data: connection } = await supabase
      .from('connections')
      .select('id,request_id,requester_id,responder_id,agreed_amount_cents,payment_method,status')
      .eq('id', connectionId)
      .maybeSingle();

    if (!connection) return NextResponse.json({ error: 'Connection not found.' }, { status: 404 });
    if (user.id !== connection.requester_id && user.id !== connection.responder_id) {
      return NextResponse.json({ error: 'You are not part of this connection.' }, { status: 403 });
    }

    const [{ data: aspireRequest }, { data: marketOrder }] = await Promise.all([
      supabase
        .from('requests')
        .select('id,title,kind,amount_cents,currency,campus_id')
        .eq('id', connection.request_id)
        .maybeSingle(),
      supabase
        .from('market_orders')
        .select('id,buyer_id,seller_id,fulfillment_method,shipping_rate_id,shipping_rate_cents,shipping_currency,shipping_paid_by,shipping_carrier,shipping_service')
        .eq('connection_id', connection.id)
        .maybeSingle()
    ]);
    if (!aspireRequest) return NextResponse.json({ error: 'Request not found.' }, { status: 404 });

    const baseAmount = Number(connection.agreed_amount_cents ?? aspireRequest.amount_cents ?? 0);
    if (!Number.isInteger(baseAmount) || baseAmount <= 0) {
      return NextResponse.json({ error: 'This connection does not have a valid agreed amount yet.' }, { status: 409 });
    }

    const isMarket = aspireRequest.kind === 'buy_sell';
    const shippingOrder = isMarket && marketOrder?.fulfillment_method === 'shipping';
    const shippingRateCents = shippingOrder ? Number(marketOrder?.shipping_rate_cents ?? 0) : 0;
    const shippingPaidBy = shippingOrder ? String(marketOrder?.shipping_paid_by || 'buyer') : null;
    if (shippingOrder && (!marketOrder?.shipping_rate_id || !Number.isInteger(shippingRateCents) || shippingRateCents < 0)) {
      return NextResponse.json({ error: 'Choose a live carrier rate before payment.', code: 'SHIPPING_RATE_REQUIRED' }, { status: 409 });
    }

    const { data: quoteRows, error: quoteError } = await supabase.rpc('quote_aspire_fees', {
      p_base_amount_cents: baseAmount,
      p_campus_id: aspireRequest.campus_id || null,
      p_tip_amount_cents: 0
    });
    if (quoteError) throw quoteError;
    const quote = (quoteRows?.[0] || null) as FeeQuote | null;
    if (!quote) return NextResponse.json({ error: 'Aspire fee policy is unavailable.' }, { status: 503 });

    const shippingChargedToBuyer = shippingOrder && shippingPaidBy === 'buyer' ? shippingRateCents : 0;
    const shippingChargedToSeller = shippingOrder && shippingPaidBy === 'seller' ? shippingRateCents : 0;
    const customerTotalCents = quote.customer_total_cents + shippingChargedToBuyer;
    const providerNetCents = quote.provider_net_cents - shippingChargedToSeller;
    if (providerNetCents < 0) {
      return NextResponse.json({ error: 'This shipping rate is greater than the seller proceeds. Choose another rate or have the buyer cover shipping.', code: 'SHIPPING_EXCEEDS_SELLER_PROCEEDS' }, { status: 409 });
    }

    return NextResponse.json({
      connectionId,
      requestId: aspireRequest.id,
      title: aspireRequest.title,
      currency: String(aspireRequest.currency || 'USD').toUpperCase(),
      paymentMethod: connection.payment_method,
      feePolicyVersion: quote.fee_policy_version,
      baseAmountCents: quote.base_amount_cents,
      requesterFeeCents: quote.requester_fee_cents,
      providerFeeCents: quote.provider_fee_cents,
      tipAmountCents: quote.tip_amount_cents,
      customerTotalCents,
      providerNetCents,
      platformFeeRevenueCents: quote.platform_fee_revenue_cents,
      minimumPaidOrderCents: quote.minimum_paid_order_cents,
      standardPayoutCadence: quote.standard_payout_cadence,
      shippingRateCents,
      shippingPaidBy,
      shippingCarrier: shippingOrder ? marketOrder?.shipping_carrier || null : null,
      shippingService: shippingOrder ? marketOrder?.shipping_service || null : null,
      requester: {
        percentBps: quote.requester_fee_percent_bps,
        fixedCents: quote.requester_fee_fixed_cents,
        minCents: quote.requester_fee_min_cents,
        maxCents: quote.requester_fee_max_cents
      },
      provider: { percentBps: quote.provider_fee_percent_bps },
      tips: { platformPercentBps: quote.tip_fee_percent_bps }
    });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
