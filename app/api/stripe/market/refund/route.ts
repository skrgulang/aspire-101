import { NextResponse } from 'next/server';
import {
  apiError,
  getAuthenticatedUser,
  getSupabaseServiceClient,
  stripeFormRequest
} from '../../../../../lib/server/aspireServer';

type StripeRefund = { id: string; status?: string | null };

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    const connectionId = typeof body?.connectionId === 'string' ? body.connectionId : '';
    if (!connectionId) return NextResponse.json({ error: 'Missing marketplace connection.' }, { status: 400 });

    const supabase = getSupabaseServiceClient();
    const { data: order } = await supabase
      .from('market_orders')
      .select('*')
      .eq('connection_id', connectionId)
      .maybeSingle();

    if (!order) return NextResponse.json({ error: 'Marketplace order not found.' }, { status: 404 });
    if (user.id !== order.buyer_id && user.id !== order.seller_id) {
      return NextResponse.json({ error: 'You are not part of this marketplace order.' }, { status: 403 });
    }
    if (order.seller_handed_off_at) {
      return NextResponse.json({ error: 'The seller already marked handoff. Open a problem report instead of using instant cancellation.', code: 'HANDOFF_ALREADY_STARTED' }, { status: 409 });
    }
    if (['released', 'refunded', 'cancelled'].includes(order.status)) {
      return NextResponse.json({ error: 'This marketplace order is already closed.', code: 'ORDER_CLOSED' }, { status: 409 });
    }
    if (order.status === 'disputed') {
      return NextResponse.json({ error: 'This order is already under review.', code: 'ORDER_DISPUTED' }, { status: 409 });
    }

    const { data: payment } = await supabase
      .from('connection_payments')
      .select('*')
      .eq('connection_id', connectionId)
      .maybeSingle();

    if (!payment || payment.status !== 'secured' || !payment.stripe_payment_intent_id) {
      return NextResponse.json({ error: 'There is no secured Aspire payment to refund.', code: 'PAYMENT_NOT_SECURED' }, { status: 409 });
    }
    if (payment.stripe_transfer_id || payment.status === 'released') {
      return NextResponse.json({ error: 'Seller payout has already been released. This requires a reviewed dispute.', code: 'PAYOUT_ALREADY_RELEASED' }, { status: 409 });
    }

    const refund = await stripeFormRequest<StripeRefund>('/v1/refunds', {
      payment_intent: payment.stripe_payment_intent_id,
      reason: 'requested_by_customer',
      'metadata[aspire_payment_id]': payment.id,
      'metadata[connection_id]': connectionId,
      'metadata[market_order_id]': order.id,
      'metadata[requested_by]': user.id
    }, { idempotencyKey: `aspire_market_refund_${payment.id}` });

    const now = new Date().toISOString();
    await Promise.all([
      supabase.from('connection_payments').update({
        status: 'refunded',
        stripe_refund_id: refund.id,
        refunded_at: now,
        failure_reason: null,
        updated_at: now
      }).eq('id', payment.id).eq('status', 'secured'),
      supabase.from('market_orders').update({
        status: 'refunded',
        refunded_at: now,
        updated_at: now
      }).eq('id', order.id),
      supabase.from('market_order_events').insert({
        market_order_id: order.id,
        actor_id: user.id,
        event_type: 'refund_created',
        payload: { stripe_refund_id: refund.id, stripe_status: refund.status || null }
      })
    ]);

    return NextResponse.json({ status: 'refunded', refundId: refund.id });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
