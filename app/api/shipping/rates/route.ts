import { NextResponse } from 'next/server';
import { apiError, getAuthenticatedUser, getSupabaseServiceClient } from '../../../../lib/server/aspireServer';
import { createShippoShipment, type ShippoParcel } from '../../../../lib/server/shippo';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parcel(value: unknown): ShippoParcel | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const numbers = ['length', 'width', 'height', 'weight'];
  if (numbers.some((field) => typeof item[field] !== 'string' || !/^\d+(\.\d+)?$/.test(String(item[field])))) return null;
  const result = {
    length: String(item.length), width: String(item.width), height: String(item.height),
    distance_unit: 'in' as const, weight: String(item.weight), mass_unit: 'lb' as const
  };
  return Number(result.length) > 0 && Number(result.width) > 0 && Number(result.height) > 0 && Number(result.weight) > 0 ? result : null;
}

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
    const packageData = parcel(body?.parcel);
    if (!uuidPattern.test(orderId) || !packageData) {
      return NextResponse.json({ error: 'Enter valid package dimensions and weight.' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { data: order, error } = await supabase.from('market_orders').select('*').eq('id', orderId).maybeSingle();
    if (error) throw error;
    if (!order) return NextResponse.json({ error: 'Marketplace order not found.' }, { status: 404 });
    if (user.id !== order.seller_id) return NextResponse.json({ error: 'Only the seller can enter package details and request carrier rates.', code: 'NOT_SELLER' }, { status: 403 });
    if (order.fulfillment_method !== 'shipping') return NextResponse.json({ error: 'This order is not configured for carrier shipping.', code: 'NOT_SHIPPING_ORDER' }, { status: 409 });
    if (['released', 'refunded', 'cancelled', 'disputed'].includes(order.status)) return NextResponse.json({ error: 'Shipping cannot be changed after this order is closed or disputed.', code: 'ORDER_CLOSED' }, { status: 409 });
    if (!order.shipping_from_address_id || !order.shipping_to_address_id) {
      return NextResponse.json({ error: 'Both seller origin and buyer delivery address must be ready before requesting rates.', code: 'SHIPPING_ADDRESSES_REQUIRED' }, { status: 409 });
    }

    const { data: payment, error: paymentError } = await supabase
      .from('connection_payments')
      .select('status')
      .eq('connection_id', order.connection_id)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (payment && !['not_started', 'failed'].includes(String(payment.status))) {
      return NextResponse.json({ error: 'Shipping details are locked because checkout has already started.', code: 'PAYMENT_TERMS_LOCKED' }, { status: 409 });
    }

    const shipment = await createShippoShipment({
      addressFrom: order.shipping_from_address_id,
      addressTo: order.shipping_to_address_id,
      parcel: packageData,
      metadata: JSON.stringify({ aspire_market_order_id: order.id, request_id: order.request_id })
    });

    const allowedCarriers = new Set((process.env.SHIPPING_ALLOWED_CARRIERS || 'usps,ups,fedex').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean));
    const rates = (shipment.rates || []).filter((rate) => {
      const provider = String(rate.provider || '').toLowerCase();
      return allowedCarriers.has(provider) || allowedCarriers.has(provider.replace(/[^a-z0-9]/g, ''));
    }).filter((rate) => rate.object_id && Number.isFinite(Number(rate.amount)) && Number(rate.amount) > 0);
    if (!rates.length) return NextResponse.json({ error: 'No configured shipping rates were found. Make sure USPS, UPS, or FedEx is enabled in Shippo, or update SHIPPING_ALLOWED_CARRIERS.', code: 'NO_SHIPPING_RATES' }, { status: 502 });

    const rateOptions = rates.map((rate) => ({
      id: rate.object_id,
      carrier: rate.provider || 'Carrier',
      service: rate.servicelevel?.name || rate.servicelevel?.token || 'Standard',
      amountCents: Math.round(Number(rate.amount) * 100),
      currency: String(rate.currency || order.currency || 'USD').toUpperCase(),
      estimatedDays: rate.estimated_days ?? null,
      durationTerms: rate.duration_terms ?? null
    }));

    const now = new Date().toISOString();
    const { error: updateError } = await supabase.from('market_orders').update({
      shipping_provider: 'shippo',
      shipping_shipment_id: shipment.object_id,
      shipping_rate_id: null,
      shipping_rate_cents: null,
      shipping_currency: null,
      shipping_carrier: null,
      shipping_service: null,
      shipping_rate_options: rateOptions,
      shipping_status: 'rates_ready',
      shipping_last_event_at: now,
      updated_at: now
    }).eq('id', order.id);
    if (updateError) throw updateError;

    await supabase.from('market_order_events').insert({
      market_order_id: order.id,
      actor_id: user.id,
      event_type: 'shipping_rates_ready',
      payload: { provider: 'shippo', option_count: rateOptions.length }
    });

    return NextResponse.json({ shipmentId: shipment.object_id, rates: rateOptions });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
