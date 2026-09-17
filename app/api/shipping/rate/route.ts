import { NextResponse } from 'next/server';
import { apiError, getAuthenticatedUser, getSupabaseServiceClient } from '../../../../lib/server/aspireServer';
import { getShippoShipment } from '../../../../lib/server/shippo';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function allowedCarrierSet() {
  return new Set((process.env.SHIPPING_ALLOWED_CARRIERS || 'fedex,ups,usps')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean));
}

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
    const rateId = typeof body?.rateId === 'string' ? body.rateId.trim() : '';
    if (!uuidPattern.test(orderId) || !rateId || rateId.length > 100) {
      return NextResponse.json({ error: 'Choose a shipping rate.' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { data: order, error } = await supabase.from('market_orders').select('*').eq('id', orderId).maybeSingle();
    if (error) throw error;
    if (!order) return NextResponse.json({ error: 'Marketplace order not found.' }, { status: 404 });
    if (user.id !== order.buyer_id) return NextResponse.json({ error: 'Only the buyer can choose the carrier rate.', code: 'NOT_BUYER' }, { status: 403 });
    if (order.fulfillment_method !== 'shipping') return NextResponse.json({ error: 'This order is not using carrier shipping.', code: 'NOT_SHIPPING_ORDER' }, { status: 409 });
    if (!order.shipping_shipment_id) return NextResponse.json({ error: 'The seller must calculate shipping rates first.', code: 'SHIPPING_RATES_REQUIRED' }, { status: 409 });
    if (!['awaiting_payment', 'payment_processing'].includes(String(order.status))) {
      return NextResponse.json({ error: 'The carrier rate is locked after payment.', code: 'SHIPPING_RATE_LOCKED' }, { status: 409 });
    }

    const { data: payment, error: paymentError } = await supabase
      .from('connection_payments')
      .select('status,stripe_checkout_session_id')
      .eq('connection_id', order.connection_id)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (payment && !['not_started', 'failed', 'cancelled'].includes(String(payment.status))) {
      return NextResponse.json({ error: 'A checkout is already open or submitted. Finish or cancel it before changing the shipping rate.', code: 'SHIPPING_RATE_LOCKED' }, { status: 409 });
    }

    const shipment = await getShippoShipment(order.shipping_shipment_id);
    if (!String(shipment.metadata || '').includes(order.id)) {
      return NextResponse.json({ error: 'This shipping quote does not belong to this order.', code: 'SHIPPING_QUOTE_MISMATCH' }, { status: 409 });
    }

    const rate = (shipment.rates || []).find((candidate) => candidate.object_id === rateId);
    const provider = String(rate?.provider || '').toLowerCase();
    const compact = provider.replace(/[^a-z0-9]/g, '');
    const allowedCarriers = allowedCarrierSet();
    if (!rate || String(rate.object_status || 'VALID').toUpperCase() !== 'VALID' || (!allowedCarriers.has(provider) && !allowedCarriers.has(compact))) {
      return NextResponse.json({ error: 'That carrier rate is no longer available. Ask the seller to refresh the rates.', code: 'SHIPPING_RATE_EXPIRED' }, { status: 409 });
    }

    const amountCents = Math.round(Number(rate.amount || 0) * 100);
    if (!Number.isInteger(amountCents) || amountCents < 0) {
      return NextResponse.json({ error: 'That carrier returned an invalid rate.', code: 'INVALID_SHIPPING_RATE' }, { status: 502 });
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase.from('market_orders').update({
      shipping_rate_id: rate.object_id,
      shipping_rate_cents: amountCents,
      shipping_currency: rate.currency || 'USD',
      shipping_carrier: rate.provider || 'Carrier',
      shipping_service: rate.servicelevel?.name || rate.servicelevel?.token || 'Standard',
      shipping_status: 'rates_ready',
      shipping_last_event_at: now,
      updated_at: now
    }).eq('id', order.id).select('*').single();
    if (updateError) throw updateError;

    await supabase.from('market_order_events').insert({
      market_order_id: order.id,
      actor_id: user.id,
      event_type: 'shipping_rate_selected',
      payload: {
        rate_id: rate.object_id,
        carrier: rate.provider || 'Carrier',
        service: rate.servicelevel?.name || rate.servicelevel?.token || 'Standard',
        amount_cents: amountCents,
        currency: rate.currency || 'USD',
        shipping_paid_by: order.shipping_paid_by || 'buyer'
      }
    });

    return NextResponse.json({
      orderId: updated.id,
      rate: {
        id: rate.object_id,
        carrier: rate.provider || 'Carrier',
        service: rate.servicelevel?.name || rate.servicelevel?.token || 'Standard',
        amountCents,
        currency: rate.currency || 'USD',
        estimatedDays: rate.estimated_days ?? null,
        durationTerms: rate.duration_terms ?? null
      },
      shippingPaidBy: updated.shipping_paid_by || 'buyer'
    });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
