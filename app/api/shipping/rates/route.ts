import { NextResponse } from 'next/server';
import { apiError, getAuthenticatedUser, getSupabaseServiceClient } from '../../../../lib/server/aspireServer';
import { createShippoShipment, type ShippoAddress, type ShippoParcel } from '../../../../lib/server/shippo';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function address(value: unknown): ShippoAddress | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const fields = ['name', 'street1', 'city', 'state', 'zip', 'country'];
  if (fields.some((field) => typeof item[field] !== 'string' || !String(item[field]).trim())) return null;
  const result: ShippoAddress = {
    name: String(item.name).trim().slice(0, 80),
    street1: String(item.street1).trim().slice(0, 120),
    city: String(item.city).trim().slice(0, 80),
    state: String(item.state).trim().slice(0, 40),
    zip: String(item.zip).trim().slice(0, 20),
    country: String(item.country).trim().toUpperCase().slice(0, 2)
  };
  if (typeof item.street2 === 'string' && item.street2.trim()) result.street2 = item.street2.trim().slice(0, 120);
  if (typeof item.email === 'string' && item.email.trim()) result.email = item.email.trim().slice(0, 160);
  if (typeof item.phone === 'string' && item.phone.trim()) result.phone = item.phone.trim().slice(0, 40);
  return result.country.length === 2 ? result : null;
}

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
    if (!uuidPattern.test(orderId)) return NextResponse.json({ error: 'Missing marketplace order.' }, { status: 400 });
    const addressFrom = address(body?.addressFrom);
    const addressTo = address(body?.addressTo);
    const packageData = parcel(body?.parcel);
    if (!addressFrom || !addressTo || !packageData) {
      return NextResponse.json({ error: 'Enter complete sender, destination, and package details.' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { data: order, error } = await supabase.from('market_orders').select('*').eq('id', orderId).maybeSingle();
    if (error) throw error;
    if (!order) return NextResponse.json({ error: 'Marketplace order not found.' }, { status: 404 });
    if (user.id !== order.buyer_id && user.id !== order.seller_id) return NextResponse.json({ error: 'You are not part of this order.' }, { status: 403 });
    if (order.fulfillment_method !== 'shipping') return NextResponse.json({ error: 'This order is not configured for carrier shipping.', code: 'NOT_SHIPPING_ORDER' }, { status: 409 });
    if (['released', 'refunded', 'cancelled', 'disputed'].includes(order.status)) return NextResponse.json({ error: 'Shipping cannot be changed after this order is closed or disputed.', code: 'ORDER_CLOSED' }, { status: 409 });

    const shipment = await createShippoShipment({
      addressFrom,
      addressTo,
      parcel: packageData,
      metadata: JSON.stringify({ aspire_market_order_id: order.id, request_id: order.request_id })
    });
    // Shippo only returns carriers enabled for the connected account. The env var can
    // narrow this list in production; otherwise Aspire accepts the three core carriers.
    const allowedCarriers = new Set((process.env.SHIPPING_ALLOWED_CARRIERS || 'usps,ups,fedex').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean));
    const rates = (shipment.rates || []).filter((rate) => {
      const provider = String(rate.provider || '').toLowerCase();
      return allowedCarriers.has(provider) || allowedCarriers.has(provider.replace(/[^a-z0-9]/g, ''));
    }).filter((rate) => rate.object_id && Number.isFinite(Number(rate.amount)));
    if (!rates.length) return NextResponse.json({ error: 'No configured shipping rates were found. Make sure USPS, UPS, or FedEx is enabled in Shippo, or update SHIPPING_ALLOWED_CARRIERS.', code: 'NO_SHIPPING_RATES' }, { status: 502 });

    const { error: updateError } = await supabase.from('market_orders').update({
      shipping_provider: 'shippo',
      shipping_shipment_id: shipment.object_id,
      shipping_status: 'rates_ready',
      shipping_last_event_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq('id', order.id);
    if (updateError) throw updateError;

    return NextResponse.json({
      shipmentId: shipment.object_id,
      rates: rates.map((rate) => ({
        id: rate.object_id,
        carrier: rate.provider || 'Carrier',
        service: rate.servicelevel?.name || rate.servicelevel?.token || 'Standard',
        amountCents: Math.round(Number(rate.amount) * 100),
        currency: rate.currency || 'USD',
        estimatedDays: rate.estimated_days ?? null,
        durationTerms: rate.duration_terms ?? null
      }))
    });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
