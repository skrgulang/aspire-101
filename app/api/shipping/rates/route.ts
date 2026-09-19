import { NextResponse } from 'next/server';
import { apiError, getAuthenticatedUser, getSupabaseServiceClient } from '../../../../lib/server/aspireServer';
import { createShippoShipment, getShippoShipment, type ShippoAddress, type ShippoParcel, type ShippoShipment, shippoShipmentMatchesOrder } from '../../../../lib/server/shippo';

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

function allowedCarrierSet() {
  return new Set((process.env.SHIPPING_ALLOWED_CARRIERS || 'fedex,ups,usps')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean));
}

function filteredRates(shipment: ShippoShipment) {
  const allowedCarriers = allowedCarrierSet();
  return (shipment.rates || [])
    .filter((rate) => {
      const provider = String(rate.provider || '').toLowerCase();
      const compact = provider.replace(/[^a-z0-9]/g, '');
      return allowedCarriers.has(provider) || allowedCarriers.has(compact);
    })
    .filter((rate) => rate.object_id && String(rate.object_status || 'VALID').toUpperCase() === 'VALID' && Number.isFinite(Number(rate.amount)))
    .map((rate) => ({
      id: rate.object_id,
      carrier: rate.provider || 'Carrier',
      service: rate.servicelevel?.name || rate.servicelevel?.token || 'Standard',
      amountCents: Math.round(Number(rate.amount) * 100),
      currency: rate.currency || 'USD',
      estimatedDays: rate.estimated_days ?? null,
      durationTerms: rate.duration_terms ?? null
    }))
    .sort((a, b) => a.amountCents - b.amountCents);
}

async function participantOrder(orderId: string, userId: string) {
  const supabase = getSupabaseServiceClient();
  const { data: order, error } = await supabase.from('market_orders').select('*').eq('id', orderId).maybeSingle();
  if (error) throw error;
  if (!order) return { response: NextResponse.json({ error: 'Marketplace order not found.' }, { status: 404 }) } as const;
  if (userId !== order.buyer_id && userId !== order.seller_id) return { response: NextResponse.json({ error: 'You are not part of this order.' }, { status: 403 }) } as const;
  if (order.fulfillment_method !== 'shipping') return { response: NextResponse.json({ error: 'This order is not using carrier shipping.', code: 'NOT_SHIPPING_ORDER' }, { status: 409 }) } as const;
  return { order, supabase } as const;
}

export async function GET(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const orderId = new URL(request.url).searchParams.get('orderId') || '';
    if (!uuidPattern.test(orderId)) return NextResponse.json({ error: 'Missing marketplace order.' }, { status: 400 });

    const found = await participantOrder(orderId, user.id);
    if ('response' in found) return found.response;
    const { order } = found;
    if (!order.shipping_shipment_id) return NextResponse.json({ shipmentId: null, rates: [], selectedRateId: order.shipping_rate_id || null });

    const shipment = await getShippoShipment(order.shipping_shipment_id);
    if (!shippoShipmentMatchesOrder(shipment.metadata, order.id)) {
      return NextResponse.json({ error: 'This shipping quote does not belong to this order.', code: 'SHIPPING_QUOTE_MISMATCH' }, { status: 409 });
    }
    return NextResponse.json({ shipmentId: shipment.object_id, rates: filteredRates(shipment), selectedRateId: order.shipping_rate_id || null });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
    if (!uuidPattern.test(orderId)) return NextResponse.json({ error: 'Missing marketplace order.' }, { status: 400 });

    const found = await participantOrder(orderId, user.id);
    if ('response' in found) return found.response;
    const { order, supabase } = found;
    if (user.id !== order.seller_id) return NextResponse.json({ error: 'Only the seller can enter package and ship-from details.', code: 'SELLER_SHIPPING_SETUP_REQUIRED' }, { status: 403 });
    if (['released', 'refunded', 'cancelled', 'disputed'].includes(order.status)) return NextResponse.json({ error: 'Shipping cannot be changed after this order is closed or disputed.', code: 'ORDER_CLOSED' }, { status: 409 });
    if (order.payment_id || ['paid', 'handoff_confirmed', 'release_ready'].includes(order.status)) {
      return NextResponse.json({ error: 'The shipping rate is locked after buyer payment. Contact support if the label rate needs to be refreshed.', code: 'SHIPPING_RATE_LOCKED' }, { status: 409 });
    }

    const { data: payment, error: paymentError } = await supabase
      .from('connection_payments')
      .select('status')
      .eq('connection_id', order.connection_id)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (payment && !['not_started', 'failed', 'cancelled'].includes(String(payment.status))) {
      return NextResponse.json({
        error: 'A checkout is already open or submitted. Finish or cancel it before refreshing carrier rates.',
        code: 'SHIPPING_RATE_LOCKED'
      }, { status: 409 });
    }

    const addressFrom = address(body?.addressFrom);
    const storedAddressTo = address(order.delivery_address);
    const legacyAddressTo = address(body?.addressTo);
    const addressTo = storedAddressTo || legacyAddressTo;
    const packageData = parcel(body?.parcel);
    if (!addressFrom || !addressTo || !packageData) {
      return NextResponse.json({ error: !addressTo ? 'The buyer must add a complete delivery address before shipping can be quoted.' : 'Enter complete ship-from and package details.' }, { status: 400 });
    }

    const shipment = await createShippoShipment({
      addressFrom,
      addressTo,
      parcel: packageData,
      metadata: JSON.stringify({ aspire_market_order_id: order.id, request_id: order.request_id })
    });
    const rates = filteredRates(shipment);
    if (!rates.length) return NextResponse.json({ error: 'No configured carrier rates were found. Check the Shippo carrier connections and addresses.', code: 'NO_SHIPPING_RATES' }, { status: 502 });

    const now = new Date().toISOString();
    const { error: updateError } = await supabase.from('market_orders').update({
      shipping_provider: 'shippo',
      shipping_shipment_id: shipment.object_id,
      shipping_rate_id: null,
      shipping_rate_cents: null,
      shipping_currency: null,
      shipping_carrier: null,
      shipping_service: null,
      shipping_status: 'rates_ready',
      shipping_last_event_at: now,
      updated_at: now
    }).eq('id', order.id);
    if (updateError) throw updateError;

    return NextResponse.json({ shipmentId: shipment.object_id, rates, selectedRateId: null });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
