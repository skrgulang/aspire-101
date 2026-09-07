import { NextResponse } from 'next/server';
import { apiError, getAuthenticatedUser, getSupabaseServiceClient } from '../../../../../../lib/server/aspireServer';

type Payment = {
  id: string;
  connection_id: string;
  request_id: string;
  payer_id: string;
  payee_id: string;
  currency: string;
  status: string;
  base_amount_cents: number | null;
  requester_fee_cents: number | null;
  provider_fee_cents: number | null;
  customer_total_cents: number | null;
  provider_net_cents: number | null;
  gross_amount_cents: number | null;
  provider_amount_cents: number | null;
  stripe_transfer_id: string | null;
  paid_at: string | null;
  released_at: string | null;
  refunded_at: string | null;
  disputed_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function GET(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const supabase = getSupabaseServiceClient();

    const [{ data: payments, error: paymentError }, { data: payoutAccount }] = await Promise.all([
      supabase
        .from('connection_payments')
        .select('id,connection_id,request_id,payer_id,payee_id,currency,status,base_amount_cents,requester_fee_cents,provider_fee_cents,customer_total_cents,provider_net_cents,gross_amount_cents,provider_amount_cents,stripe_transfer_id,paid_at,released_at,refunded_at,disputed_at,created_at,updated_at')
        .or(`payer_id.eq.${user.id},payee_id.eq.${user.id}`)
        .order('updated_at', { ascending: false })
        .limit(100),
      supabase
        .from('payment_accounts')
        .select('status,transfers_enabled,requirements_due,last_synced_at')
        .eq('user_id', user.id)
        .maybeSingle()
    ]);

    if (paymentError) throw paymentError;
    const rows = (payments ?? []) as Payment[];
    const requestIds = [...new Set(rows.map((item) => item.request_id))];
    const { data: requests } = requestIds.length
      ? await supabase.from('requests').select('id,title,category,kind,campus,currency').in('id', requestIds)
      : { data: [] as any[] };
    const requestMap = new Map((requests ?? []).map((item: any) => [item.id, item]));

    let pendingIncoming = 0;
    let releasedIncoming = 0;
    let disputedIncoming = 0;
    let protectedOutgoing = 0;
    let completedOutgoing = 0;
    let refundedOutgoing = 0;
    let feesPaid = 0;

    const transactions = rows.map((payment) => {
      const role = payment.payee_id === user.id ? 'payee' : 'payer';
      const requestRow: any = requestMap.get(payment.request_id) || {};
      const customerTotal = Number(payment.customer_total_cents ?? payment.gross_amount_cents ?? 0);
      const providerNet = Number(payment.provider_net_cents ?? payment.provider_amount_cents ?? 0);

      if (role === 'payee') {
        if (payment.status === 'secured') pendingIncoming += providerNet;
        if (payment.status === 'released') releasedIncoming += providerNet;
        if (payment.status === 'disputed') disputedIncoming += providerNet;
        feesPaid += Number(payment.provider_fee_cents || 0);
      } else {
        if (payment.status === 'secured') protectedOutgoing += customerTotal;
        if (payment.status === 'released') completedOutgoing += customerTotal;
        if (payment.status === 'refunded') refundedOutgoing += customerTotal;
        feesPaid += Number(payment.requester_fee_cents || 0);
      }

      return {
        id: payment.id,
        connectionId: payment.connection_id,
        requestId: payment.request_id,
        title: requestRow.title || 'Aspire transaction',
        category: requestRow.category || (requestRow.kind === 'buy_sell' ? 'Buy & sell' : 'Connection'),
        kind: requestRow.kind || null,
        campus: requestRow.campus || null,
        role,
        status: payment.status,
        currency: payment.currency || requestRow.currency || 'USD',
        baseAmountCents: payment.base_amount_cents,
        customerTotalCents: customerTotal,
        providerNetCents: providerNet,
        requesterFeeCents: Number(payment.requester_fee_cents || 0),
        providerFeeCents: Number(payment.provider_fee_cents || 0),
        transferReference: payment.stripe_transfer_id ? payment.stripe_transfer_id.slice(-8) : null,
        paidAt: payment.paid_at,
        releasedAt: payment.released_at,
        refundedAt: payment.refunded_at,
        disputedAt: payment.disputed_at,
        updatedAt: payment.updated_at
      };
    });

    return NextResponse.json({
      payout: {
        status: payoutAccount?.status || 'NOT_STARTED',
        transfersEnabled: payoutAccount?.transfers_enabled === true,
        requirementsDue: Number(payoutAccount?.requirements_due || 0),
        lastSyncedAt: payoutAccount?.last_synced_at || null
      },
      summary: {
        pendingIncomingCents: pendingIncoming,
        releasedIncomingCents: releasedIncoming,
        disputedIncomingCents: disputedIncoming,
        protectedOutgoingCents: protectedOutgoing,
        completedOutgoingCents: completedOutgoing,
        refundedOutgoingCents: refundedOutgoing,
        feesPaidCents: feesPaid
      },
      transactions
    });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
