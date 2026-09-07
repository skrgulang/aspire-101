import { NextResponse } from 'next/server';
import {
  apiError,
  getAuthenticatedUser,
  getSupabaseServiceClient,
  stripeFormRequest
} from '../../../../../lib/server/aspireServer';

type StripeRefund = { id: string; status?: string | null };
type StripeReversal = { id: string };

async function requireReviewer(request: Request) {
  const auth = await getAuthenticatedUser(request);
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', auth.user.id).maybeSingle();
  if (!['admin','moderator'].includes(String(data?.role || ''))) throw new Error('REVIEWER_REQUIRED');
  return { ...auth, supabase };
}

export async function GET(request: Request) {
  try {
    const { supabase } = await requireReviewer(request);
    const { data: refunds, error } = await supabase
      .from('payment_refund_requests')
      .select('*')
      .in('status', ['open','under_review'])
      .order('created_at', { ascending: true })
      .limit(60);
    if (error) throw error;

    const paymentIds = [...new Set((refunds ?? []).map((item) => item.payment_id))];
    const { data: payments } = paymentIds.length
      ? await supabase.from('connection_payments').select('*').in('id', paymentIds)
      : { data: [] as any[] };
    const paymentMap = new Map((payments ?? []).map((item: any) => [item.id, item]));
    const requestIds = [...new Set((payments ?? []).map((item: any) => item.request_id))];
    const { data: requests } = requestIds.length
      ? await supabase.from('requests').select('id,title,category,kind,campus').in('id', requestIds)
      : { data: [] as any[] };
    const requestMap = new Map((requests ?? []).map((item: any) => [item.id, item]));

    const queue = (refunds ?? []).map((refund: any) => {
      const payment: any = paymentMap.get(refund.payment_id) || {};
      const requestRow: any = requestMap.get(payment.request_id) || {};
      return {
        ...refund,
        payment_status: payment.status || null,
        customer_total_cents: payment.customer_total_cents ?? payment.gross_amount_cents ?? null,
        provider_net_cents: payment.provider_net_cents ?? payment.provider_amount_cents ?? null,
        currency: payment.currency || 'USD',
        payout_released: Boolean(payment.stripe_transfer_id || payment.status === 'released'),
        title: requestRow.title || 'Aspire transaction',
        category: requestRow.category || 'Connection',
        kind: requestRow.kind || null,
        campus: requestRow.campus || null
      };
    });

    return NextResponse.json({ ok: true, refunds: queue });
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'UNKNOWN';
    if (raw === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });
    if (raw === 'REVIEWER_REQUIRED') return NextResponse.json({ error: 'Moderator access is required.' }, { status: 403 });
    return NextResponse.json({ error: 'Could not load refund review queue.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let refundRequestId = '';
  try {
    const { user, supabase } = await requireReviewer(request);
    const body = await request.json().catch(() => ({})) as { refundRequestId?: string; action?: 'approve' | 'deny'; note?: string };
    refundRequestId = String(body.refundRequestId || '').trim();
    const action = body.action;
    const note = String(body.note || '').trim();
    if (!refundRequestId || !['approve','deny'].includes(String(action || ''))) {
      return NextResponse.json({ error: 'Choose a refund request and review action.' }, { status: 400 });
    }
    if (note.length < 4) return NextResponse.json({ error: 'Add a short reviewer note.' }, { status: 400 });

    const { data: refundRequest } = await supabase.from('payment_refund_requests').select('*').eq('id', refundRequestId).maybeSingle();
    if (!refundRequest) return NextResponse.json({ error: 'Refund request not found.' }, { status: 404 });
    if (['processed','denied'].includes(refundRequest.status)) return NextResponse.json({ ok: true, status: refundRequest.status, duplicate: true });
    if (!['open','under_review','approved'].includes(refundRequest.status)) return NextResponse.json({ error: 'This refund request is no longer reviewable.' }, { status: 409 });

    if (action === 'deny') {
      const now = new Date().toISOString();
      await supabase.from('payment_refund_requests').update({
        status: 'denied', resolution_note: note, reviewed_by: user.id, reviewed_at: now, updated_at: now
      }).eq('id', refundRequest.id).in('status', ['open','under_review','approved']);
      return NextResponse.json({ ok: true, status: 'denied' });
    }

    const { data: payment } = await supabase.from('connection_payments').select('*').eq('id', refundRequest.payment_id).maybeSingle();
    if (!payment) return NextResponse.json({ error: 'Payment record not found.' }, { status: 404 });
    if (payment.status === 'refunded') {
      const now = new Date().toISOString();
      await supabase.from('payment_refund_requests').update({ status: 'processed', resolution_note: note, reviewed_by: user.id, reviewed_at: now, updated_at: now }).eq('id', refundRequest.id);
      return NextResponse.json({ ok: true, status: 'processed', duplicate: true });
    }
    if (payment.status === 'disputed') {
      return NextResponse.json({ error: 'This payment has a card-network dispute. Resolve the Stripe dispute before creating a separate Aspire refund.', code: 'STRIPE_DISPUTE_ACTIVE' }, { status: 409 });
    }
    if (!['secured','released'].includes(payment.status) || !payment.stripe_payment_intent_id) {
      return NextResponse.json({ error: 'This protected payment is not in a refundable state.', code: 'PAYMENT_NOT_REFUNDABLE' }, { status: 409 });
    }

    await supabase.from('payment_refund_requests').update({ status: 'under_review', reviewed_by: user.id, updated_at: new Date().toISOString() }).eq('id', refundRequest.id).in('status', ['open','approved','under_review']);

    // Separate Charges and Transfers do not automatically pull money back from the connected account.
    // Recover the seller/provider transfer first so a full customer refund does not silently create an uncovered platform loss.
    let reversalId: string | null = null;
    if (payment.stripe_transfer_id) {
      const reversalAmount = Number(payment.provider_net_cents ?? payment.provider_amount_cents ?? 0);
      if (!Number.isInteger(reversalAmount) || reversalAmount <= 0) throw new Error('STRIPE:Could not determine the released seller/provider amount to reverse.');
      const reversal = await stripeFormRequest<StripeReversal>(
        `/v1/transfers/${encodeURIComponent(payment.stripe_transfer_id)}/reversals`,
        {
          amount: reversalAmount,
          'metadata[aspire_payment_id]': payment.id,
          'metadata[refund_request_id]': refundRequest.id,
          'metadata[reviewed_by]': user.id
        },
        { idempotencyKey: `aspire_refund_reversal_${refundRequest.id}` }
      );
      reversalId = reversal.id;
    }

    const stripeRefund = await stripeFormRequest<StripeRefund>('/v1/refunds', {
      payment_intent: payment.stripe_payment_intent_id,
      reason: 'requested_by_customer',
      'metadata[aspire_payment_id]': payment.id,
      'metadata[refund_request_id]': refundRequest.id,
      'metadata[reviewed_by]': user.id
    }, { idempotencyKey: `aspire_reviewed_refund_${refundRequest.id}` });

    const now = new Date().toISOString();
    await Promise.all([
      supabase.from('connection_payments').update({
        status: 'refunded',
        stripe_refund_id: stripeRefund.id,
        refunded_at: now,
        failure_reason: null,
        updated_at: now
      }).eq('id', payment.id).in('status', ['secured','released']),
      supabase.from('payment_refund_requests').update({
        status: 'processed',
        resolution_note: note,
        reviewed_by: user.id,
        reviewed_at: now,
        updated_at: now
      }).eq('id', refundRequest.id),
      supabase.from('market_orders').update({ status: 'refunded', refunded_at: now, updated_at: now }).eq('connection_id', payment.connection_id).in('status', ['paid','handoff_confirmed','release_ready','released','disputed'])
    ]);

    const { data: marketOrder } = await supabase.from('market_orders').select('id').eq('connection_id', payment.connection_id).maybeSingle();
    if (marketOrder) {
      await Promise.all([
        supabase.from('market_order_events').insert({
          market_order_id: marketOrder.id,
          actor_id: user.id,
          event_type: 'reviewed_refund',
          payload: { refund_request_id: refundRequest.id, stripe_refund_id: stripeRefund.id, stripe_reversal_id: reversalId }
        }),
        supabase.from('market_disputes').update({
          status: 'resolved_buyer', resolution_note: note, resolved_at: now, updated_at: now
        }).eq('market_order_id', marketOrder.id).in('status', ['open','under_review'])
      ]);
    }

    return NextResponse.json({ ok: true, status: 'processed', stripeRefundId: stripeRefund.id, stripeReversalId: reversalId });
  } catch (error) {
    if (refundRequestId) {
      try {
        const supabase = getSupabaseServiceClient();
        await supabase.from('payment_refund_requests').update({ status: 'open', updated_at: new Date().toISOString() }).eq('id', refundRequestId).eq('status', 'under_review');
      } catch {
        // Preserve the original Stripe or database error.
      }
    }
    const raw = error instanceof Error ? error.message : 'UNKNOWN';
    if (raw === 'REVIEWER_REQUIRED') return NextResponse.json({ error: 'Moderator access is required.' }, { status: 403 });
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
