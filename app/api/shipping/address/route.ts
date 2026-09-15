import { NextResponse } from 'next/server';
import { apiError, getAuthenticatedUser, getSupabaseServiceClient } from '../../../../lib/server/aspireServer';
import { createShippoAddress, type ShippoAddress } from '../../../../lib/server/shippo';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseAddress(value: unknown): ShippoAddress | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const required = ['name', 'street1', 'city', 'state', 'zip', 'country'];
  if (required.some((field) => typeof item[field] !== 'string' || !String(item[field]).trim())) return null;
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

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
    const role = body?.role === 'from' || body?.role === 'to' ? body.role : '';
    const shippingAddress = parseAddress(body?.address);
    if (!uuidPattern.test(orderId) || !role || !shippingAddress) {
      return NextResponse.json({ error: 'Enter a complete shipping address.' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { data: order, error } = await supabase.from('market_orders').select('*').eq('id', orderId).maybeSingle();
    if (error) throw error;
    if (!order) return NextResponse.json({ error: 'Marketplace order not found.' }, { status: 404 });
    if (order.fulfillment_method !== 'shipping') return NextResponse.json({ error: 'This order is not configured for carrier shipping.', code: 'NOT_SHIPPING_ORDER' }, { status: 409 });
    if (['released', 'refunded', 'cancelled', 'disputed'].includes(order.status)) return NextResponse.json({ error: 'Shipping cannot be changed after this order is closed or disputed.', code: 'ORDER_CLOSED' }, { status: 409 });

    const ownsRole = role === 'from' ? user.id === order.seller_id : user.id === order.buyer_id;
    if (!ownsRole) {
      return NextResponse.json({
        error: role === 'from' ? 'Only the seller can set the sender address.' : 'Only the buyer can set the delivery address.',
        code: role === 'from' ? 'NOT_SELLER' : 'NOT_BUYER'
      }, { status: 403 });
    }

    const { data: payment, error: paymentError } = await supabase.from('connection_payments')
      .select('status').eq('connection_id', order.connection_id).maybeSingle();
    if (paymentError) throw paymentError;
    if (payment && !['not_started', 'failed'].includes(String(payment.status))) {
      return NextResponse.json({ error: 'Shipping details are locked because checkout has already started.', code: 'PAYMENT_TERMS_LOCKED' }, { status: 409 });
    }

    const shippoAddress = await createShippoAddress(shippingAddress);
    if (!shippoAddress.object_id) throw new Error('SHIPPO:Address creation did not return an object id.');
    if (shippoAddress.validation_results && shippoAddress.validation_results.is_valid === false) {
      const detail = shippoAddress.validation_results.messages?.map((item) => item.text).filter(Boolean).join(' ');
      return NextResponse.json({ error: detail || 'Shippo could not validate this address.', code: 'ADDRESS_INVALID' }, { status: 409 });
    }

    const now = new Date().toISOString();
    const patch = role === 'from'
      ? { shipping_from_address_id: shippoAddress.object_id, shipping_from_address_ready_at: now }
      : { shipping_to_address_id: shippoAddress.object_id, shipping_to_address_ready_at: now };

    // Any address change invalidates earlier rates and prevents stale quotes from being paid.
    const { data: updated, error: updateError } = await supabase.from('market_orders').update({
      ...patch,
      shipping_shipment_id: null,
      shipping_rate_id: null,
      shipping_rate_cents: null,
      shipping_currency: null,
      shipping_carrier: null,
      shipping_service: null,
      shipping_status: 'not_started',
      shipping_last_event_at: now,
      updated_at: now
    }).eq('id', order.id).select('id,shipping_from_address_id,shipping_to_address_id,shipping_from_address_ready_at,shipping_to_address_ready_at').single();
    if (updateError) throw updateError;

    await supabase.from('market_order_events').insert({
      market_order_id: order.id,
      actor_id: user.id,
      event_type: role === 'from' ? 'shipping_origin_ready' : 'shipping_destination_ready',
      payload: { provider: 'shippo' }
    });

    return NextResponse.json({
      role,
      ready: true,
      fromReady: Boolean(updated.shipping_from_address_id),
      toReady: Boolean(updated.shipping_to_address_id)
    });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
