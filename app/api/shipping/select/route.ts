import { NextResponse } from 'next/server';
import { apiError, getAuthenticatedUser, getSupabaseServiceClient } from '../../../../lib/server/aspireServer';
import { getShippoShipment } from '../../../../lib/server/shippo';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function allowedCarriers() {
  return new Set(
    (process.env.SHIPPING_ALLOWED_CARRIERS || 'usps,ups,fedex')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

function normalizedCarrier(value: unknown) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
    const rateId = typeof body?.rateId === 'string' ? body.rateId : '';
    if (!uuidPattern.test(orderId) || !rateId || rateId.length > 100) {
      return NextResponse.json({ error: 'Missing shipping order or rate.' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { data: order, error: orderError } = await supabase
      .from('market_orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return NextResponse.json({ error: 'Marketplace order not found.' }, { status: 404 });
    if (user.id !== order.buyer_id) {
      return NextResponse.json({ error: 'Only the buyer can choose the shipping rate.', code: 'NOT_BUYER' }, { status: 403 });
    }
    if (order.fulfillment_method !== 'shipping') {
      return NextResponse.json({ error: 'This order is not configured for carrier shipping.', code: 'NOT_SHIPPING_ORDER' }, { status: 409 });
    }
    if (['released', 'refunded', 'cancelled', 'disputed'].includes(order.status)) {
      return NextResponse.json({ error: 'Shipping cannot be changed after this order is closed or disputed.', code: 'ORDER_CLOSED' }, { status: 409 });
    }
    if (!order.shipping_shipment_id || order.shipping_status !== 'rates_ready') {
      return NextResponse.json({ error: 'Get fresh shipping rates before choosing a carrier.', code: 'SHIPPING_RATES_REQUIRED' }, { status: 409 });
    }

    const { data: payment, error: paymentError } = await supabase
      .from('connection_payments')
      .select('status,stripe_checkout_session_id')
      .eq('connection_id', order.connection_id)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (payment && !['not_started', 'failed'].includes(String(payment.status))) {
      return NextResponse.json({ error: 'The shipping rate is locked because checkout has already started.', code: 'PAYMENT_TERMS_LOCKED' }, { status: 409 });
    }

    const shipment = await getShippoShipment(order.shipping_shipment_id);
    const shipmentMetadata = String(shipment.metadata || '');
    if (!shipmentMetadata.includes(order.id)) {
      return NextResponse.json({ error: 'This shipping quote does not belong to this order.', code: 'SHIPPING_QUOTE_MISMATCH' }, { status: 409 });
    }

    const rate = (shipment.rates || []).find((candidate) => candidate.object_id === rateId);
    if (!rate || String(rate.object_status || '').toUpperCase() !== 'VALID') {
      return NextResponse.json({ error: 'That shipping rate expired. Request a fresh quote.', code: 'SHIPPING_RATE_EXPIRED' }, { status: 409 });
    }

    const carrier = String(rate.provider || '').trim();
    const allowlist = allowedCarriers();
    const providerKey = carrier.toLowerCase();
    const normalizedProvider = normalizedCarrier(carrier);
    if (!allowlist.has(providerKey) && !allowlist.has(normalizedProvider)) {
      return NextResponse.json({ error: 'That carrier is not enabled for Aspire shipping.', code: 'SHIPPING_CARRIER_NOT_ALLOWED' }, { status: 409 });
    }

    const amountCents = Math.round(Number(rate.amount) * 100);
    const currency = String(rate.currency || order.currency || 'USD').toUpperCase();
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return NextResponse.json({ error: 'That shipping rate is invalid. Request a fresh quote.', code: 'SHIPPING_RATE_INVALID' }, { status: 409 });
    }
    if (currency !== String(order.currency || 'USD').toUpperCase()) {
      return NextResponse.json({ error: 'Shipping currency must match the marketplace order currency.', code: 'SHIPPING_CURRENCY_MISMATCH' }, { status: 409 });
    }

    const service = rate.servicelevel?.name || rate.servicelevel?.token || 'Standard';
    const selectedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from('market_orders')
      .update({
        shipping_provider: 'shippo',
        shipping_rate_id: rate.object_id,
        shipping_rate_cents: amountCents,
        shipping_currency: currency,
        shipping_carrier: carrier || 'Carrier',
        shipping_service: service,
        shipping_last_event_at: selectedAt,
        updated_at: selectedAt
      })
      .eq('id', order.id)
      .eq('shipping_shipment_id', order.shipping_shipment_id)
      .eq('shipping_status', 'rates_ready')
      .select('id,shipping_rate_id,shipping_rate_cents,shipping_currency,shipping_carrier,shipping_service,shipping_status')
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) {
      return NextResponse.json({ error: 'Shipping changed while you were choosing a rate. Refresh and try again.', code: 'SHIPPING_RATE_RACE' }, { status: 409 });
    }

    await supabase.from('market_order_events').insert({
      market_order_id: order.id,
      actor_id: user.id,
      event_type: 'shipping_rate_selected',
      payload: {
        shipment_id: order.shipping_shipment_id,
        rate_id: rate.object_id,
        carrier: carrier || 'Carrier',
        service,
        amount_cents: amountCents,
        currency
      }
    });

    return NextResponse.json({
      rateId: updated.shipping_rate_id,
      amountCents: updated.shipping_rate_cents,
      currency: updated.shipping_currency,
      carrier: updated.shipping_carrier,
      service: updated.shipping_service,
      status: updated.shipping_status
    });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
