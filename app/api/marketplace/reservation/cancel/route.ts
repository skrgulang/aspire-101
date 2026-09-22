import { NextResponse } from 'next/server';
import {
  apiError,
  getAuthenticatedUser,
  getSupabaseServiceClient,
  stripeFormRequest,
  stripeGet,
  stripeLivemode
} from '../../../../../lib/server/aspireServer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Payment = {
  status: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  stripe_livemode: boolean;
};

type CheckoutSession = {
  id: string;
  status?: 'open' | 'complete' | 'expired' | null;
  payment_status?: 'paid' | 'unpaid' | 'no_payment_required' | null;
};

function conflict(error: string, code: string) {
  return NextResponse.json({ error, code }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    const connectionId = typeof body?.connectionId === 'string' ? body.connectionId : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(connectionId)) {
      return NextResponse.json({ error: 'Missing or invalid connection.' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { data: order, error: orderError } = await supabase
      .from('market_orders')
      .select('id,buyer_id,status')
      .eq('connection_id', connectionId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return NextResponse.json({ error: 'Reservation not found.' }, { status: 404 });
    if (order.buyer_id !== user.id) {
      return NextResponse.json({ error: 'Only the buyer can cancel this reservation.' }, { status: 403 });
    }
    if (order.status !== 'awaiting_payment') {
      return conflict('This reservation can no longer be cancelled because payment or fulfillment has started.', 'RESERVATION_NOT_CANCELLABLE');
    }

    const { data: payment, error: paymentError } = await supabase
      .from('connection_payments')
      .select('status,stripe_checkout_session_id,stripe_payment_intent_id,stripe_charge_id,stripe_livemode')
      .eq('connection_id', connectionId)
      .maybeSingle();
    if (paymentError) throw paymentError;

    const candidate = payment as Payment | null;
    if (candidate && (
      !['not_started', 'checkout_created', 'failed', 'cancelled'].includes(candidate.status) ||
      candidate.stripe_payment_intent_id ||
      candidate.stripe_charge_id
    )) {
      return conflict('Payment has already started, so this reservation cannot be cancelled.', 'PAYMENT_IN_FLIGHT');
    }

    const sessionId = candidate?.stripe_checkout_session_id || null;
    if (sessionId) {
      if (candidate?.stripe_livemode !== stripeLivemode()) {
        return conflict('This Checkout Session belongs to a different Stripe mode and cannot be cancelled here.', 'PAYMENT_MODE_MISMATCH');
      }

      let session = await stripeGet<CheckoutSession>(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
      if (session.payment_status === 'paid' || session.status === 'complete') {
        return conflict('Payment completed before the cancellation. Refresh the order to see its latest status.', 'PAYMENT_COMPLETED');
      }
      if (session.status === 'open') {
        try {
          session = await stripeFormRequest<CheckoutSession>(
            `/v1/checkout/sessions/${encodeURIComponent(sessionId)}/expire`,
            {}
          );
        } catch (error) {
          // Resolve a payment/cancellation race against Stripe's current state.
          session = await stripeGet<CheckoutSession>(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
          if (session.payment_status !== 'paid' && session.status !== 'complete' && session.status !== 'expired') throw error;
        }
      }
      if (session.payment_status === 'paid' || session.status === 'complete') {
        return conflict('Payment completed before the cancellation. Refresh the order to see its latest status.', 'PAYMENT_COMPLETED');
      }
      if (session.status !== 'expired') {
        return conflict('Stripe Checkout could not be closed safely. Try again in a moment.', 'CHECKOUT_NOT_EXPIRED');
      }
    }

    const { data: cancelled, error: cancelError } = await supabase.rpc(
      'cancel_unpaid_marketplace_reservation_server',
      {
        p_market_order_id: order.id,
        p_buyer_id: user.id,
        p_expected_checkout_session_id: sessionId
      }
    );
    if (cancelError) throw cancelError;
    if (!cancelled) {
      return conflict('The reservation changed before it could be cancelled. Refresh the order and try again.', 'RESERVATION_CHANGED');
    }

    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const mapped = apiError(error);
    return NextResponse.json(mapped.body, { status: mapped.status, headers: { 'Cache-Control': 'no-store' } });
  }
}
