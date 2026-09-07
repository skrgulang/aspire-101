import { getSupabaseBrowserClient } from './client';

export type RefundReason = 'not_received' | 'not_as_described' | 'service_not_completed' | 'wrong_charge' | 'unsafe_or_cancelled' | 'other';
export type RefundRequestStatus = 'open' | 'under_review' | 'approved' | 'denied' | 'processed';

export type RefundRequest = {
  id: string;
  payment_id: string;
  connection_id: string;
  requested_by: string;
  reason: RefundReason;
  details: string;
  requested_amount_cents: number | null;
  status: RefundRequestStatus;
  resolution_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RefundEligiblePayment = {
  id: string;
  connection_id: string;
  request_id: string;
  status: 'secured' | 'released';
  currency: string;
  customer_total_cents: number | null;
  gross_amount_cents: number | null;
  paid_at: string | null;
  released_at: string | null;
  updated_at: string;
  title: string;
  category: string;
  kind: string;
  marketplaceStatus: string | null;
};

export async function fetchMyRefundActivity() {
  const supabase = getSupabaseBrowserClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Sign in again to view refunds.');

  const { data: payments, error } = await supabase
    .from('connection_payments')
    .select('id,connection_id,request_id,status,currency,customer_total_cents,gross_amount_cents,paid_at,released_at,updated_at')
    .eq('payer_id', auth.user.id)
    .in('status', ['secured','released'])
    .order('updated_at', { ascending: false });
  if (error) throw error;

  const rows = payments ?? [];
  const paymentIds = rows.map((item) => item.id);
  const requestIds = [...new Set(rows.map((item) => item.request_id))];
  const connectionIds = [...new Set(rows.map((item) => item.connection_id))];
  const [{ data: requests }, { data: marketOrders }, { data: refundRequests }] = await Promise.all([
    requestIds.length ? supabase.from('requests').select('id,title,category,kind').in('id', requestIds) : Promise.resolve({ data: [] as any[] }),
    connectionIds.length ? supabase.from('market_orders').select('connection_id,status').in('connection_id', connectionIds) : Promise.resolve({ data: [] as any[] }),
    paymentIds.length ? supabase.from('payment_refund_requests').select('*').in('payment_id', paymentIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [] as any[] })
  ]);

  const requestMap = new Map((requests ?? []).map((item: any) => [item.id, item]));
  const marketMap = new Map((marketOrders ?? []).map((item: any) => [item.connection_id, item.status as string]));
  const eligible = rows.map((payment: any) => {
    const request = requestMap.get(payment.request_id) as any;
    return {
      ...payment,
      title: request?.title || 'Aspire transaction',
      category: request?.category || 'Connection',
      kind: request?.kind || 'unknown',
      marketplaceStatus: marketMap.get(payment.connection_id) || null
    } as RefundEligiblePayment;
  });

  return { payments: eligible, requests: (refundRequests ?? []) as RefundRequest[] };
}

export async function requestPaymentRefund(connectionId: string, reason: RefundReason, details: string) {
  const clean = details.trim();
  if (clean.length < 10) throw new Error('Describe what happened in a little more detail.');
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('request_payment_refund', {
    p_connection_id: connectionId,
    p_reason: reason,
    p_details: clean
  });
  if (error) {
    const raw = `${error.message || ''} ${error.details || ''}`;
    if (/REFUND_REVIEW_WINDOW_CLOSED/i.test(raw)) throw new Error('The 7-day refund review window for this protected payment has closed. Contact Aspire support if you believe there is an exceptional payment issue.');
    if (/REFUND_REQUEST_NOT_AVAILABLE/i.test(raw)) throw new Error('This payment is not currently eligible for a refund review request.');
    if (/duplicate|payment_refund_one_open_idx/i.test(raw)) throw new Error('You already have an open refund request for this payment.');
    throw error;
  }
  return data as RefundRequest;
}
