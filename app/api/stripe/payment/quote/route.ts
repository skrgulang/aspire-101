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

    const { data: aspireRequest } = await supabase
      .from('requests')
      .select('id,title,kind,amount_cents,currency,campus_id')
      .eq('id', connection.request_id)
      .maybeSingle();
    if (!aspireRequest) return NextResponse.json({ error: 'Request not found.' }, { status: 404 });

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
      customerTotalCents: quote.customer_total_cents,
      providerNetCents: quote.provider_net_cents,
      platformFeeRevenueCents: quote.platform_fee_revenue_cents,
      minimumPaidOrderCents: quote.minimum_paid_order_cents,
      standardPayoutCadence: quote.standard_payout_cadence,
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
