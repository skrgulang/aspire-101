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
    const { data: order, error: orderError } = await supabase
      .from('market_orders')
      .select('*')
      .eq('connection_id', connectionId)
      .maybeSingle();
    if (orderError) throw orderError;

    if (!order) return NextResponse.json({ error: 'Marketplace order not found.' }, { status: 404 });
    if (user.id !== order.buyer_id && user.id !== order.seller_id) {
      return NextResponse.json({ error: 'You are not part of this marketplace order.' }, { status: 403 });
    }
    if (['released', 'cancelled'].includes(order.status)) {
      return NextResponse.json({ error: 'This marketplace order is already closed.', code: 'ORDER_CLOSED' }, { status: 409 });
    }
    if (order.status === 'disputed') {
      return NextResponse.json({ error: 'This order is already under review.', code: 'ORDER_DISPUTED' }, { status: 409 });
    }

    const { data: payment, error: paymentError } = await supabase
      .from('connection_payments')
      .select('*')
      .eq('connection_id', connectionId)
      .maybeSingle();
    if (paymentError) throw paymentError;

    if (order.status === 'refunded' && payment?.status === 'refunded' && payment.stripe_refund_id) {
      return NextResponse.json({ status: 'refunded', refundId: payment.stripe_refund_id, duplicate: true });
    }
    if (order.seller_handed_off_at) {
      return NextResponse.json({ error: 'The seller already marked handoff. Open a problem report instead of using instant cancellation.', code: 'HANDOFF_ALREADY_STARTED' }, { status: 409 });
    }

    const shippingCommitted = order.fulfillment_method === 'shipping'
      && Boolean(order.shipping_transaction_id || order.shipping_label_url || order.shipping_tracking_number)
      && ['label_purchased', 'in_transit', 'delivered', 'exception'].includes(String(order.shipping_status || ''));
    if (shippingCommitted) {
      return NextResponse.json({
        error: 'A carrier label has already been purchased for this order. Use Report a problem / Resolution Center so the shipping cost and protected payment can be reconciled together instead of issuing an instant refund.',
        code: 'SHIPPING_LABEL_ALREADY_PURCHASED'
      }, { status: 409 });
    }

    if (!payment || payment.status !== 'secured' || !payment.stripe_payment_intent_id) {
      return NextResponse.json({ error: 'There is no secured Aspire payment to refund.', code: 'PAYMENT_NOT_SECURED' }, { status: 409 });
    }
    if (payment.stripe_transfer_id || payment.status === 'released') {
      return NextResponse.json({ error: 'Seller payout has already been released. This requires a reviewed dispute.', code: 'PAYOUT_ALREADY_RELEASED' }, { status: 409 });
    }

    const { data: claimedAtValue, error: claimError } = await supabase.rpc('claim_connection_payment_refund', {
      p_payment_id: payment.id,
      p_resolution_case_id: null
    });
    if (claimError) {
      const claimText = `${claimError.message || ''} ${claimError.details || ''}`;
      if (/PAYOUT_RELEASE_IN_PROGRESS|PAYOUT_ALREADY_RELEASED/i.test(claimText)) {
        return NextResponse.json({ error: 'Seller payout is already releasing or released. This refund needs reviewed reconciliation.', code: 'PAYOUT_ALREADY_RELEASED' }, { status: 409 });
      }
      if (/RESOLUTION_CASE_OPEN|MARKET_DISPUTE_OPEN/i.test(claimText)) {
        return NextResponse.json({ error: 'This order already has an open review. Resolve that case instead of using instant cancellation.', code: 'ORDER_UNDER_REVIEW' }, { status: 409 });
      }
      throw claimError;
    }

    const claimedAt = typeof claimedAtValue === 'string' ? claimedAtValue : String(claimedAtValue || '');
    let refund: StripeRefund;
    try {
      refund = await stripeFormRequest<StripeRefund>('/v1/refunds', {
        payment_intent: payment.stripe_payment_intent_id,
        reason: 'requested_by_customer',
        'metadata[aspire_payment_id]': payment.id,
        'metadata[connection_id]': connectionId,
        'metadata[market_order_id]': order.id,
        'metadata[requested_by]': user.id
      }, { idempotencyKey: `aspire_market_refund_${payment.id}` });
    } catch (error) {
      if (claimedAt) {
        const { error: clearClaimError } = await supabase.rpc('clear_connection_payment_refund_claim', {
          p_payment_id: payment.id,
          p_claimed_at: claimedAt
        });
        if (clearClaimError) console.error('Could not clear failed marketplace refund claim', clearClaimError);
      }
      throw error;
    }

    const { data: finalized, error: finalizeError } = await supabase.rpc('finalize_connection_payment_refund', {
      p_payment_id: payment.id,
      p_refund_id: refund.id,
      p_amount_cents: Number(payment.customer_total_cents ?? payment.gross_amount_cents ?? 0),
      p_actor_id: user.id,
      p_resolution_case_id: null,
      p_note: 'Marketplace order cancelled before handoff and refunded.',
      p_stripe_status: refund.status || null
    });
    if (finalizeError) throw finalizeError;

    return NextResponse.json({
      status: 'refunded',
      refundId: refund.id,
      duplicate: Boolean(finalized?.duplicate)
    });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
