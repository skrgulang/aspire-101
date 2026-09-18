import { NextResponse } from 'next/server';
import { apiError, getAuthenticatedUser, getSupabaseServiceClient } from '../../../../lib/server/aspireServer';
import { buyShippoLabel, getShippoShipment, normalizeShippingStatus, shippoShipmentMatchesOrder } from '../../../../lib/server/shippo';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
    const rateId = typeof body?.rateId === 'string' ? body.rateId : '';
    if (!uuidPattern.test(orderId) || !rateId || rateId.length > 100) return NextResponse.json({ error: 'Missing shipping order or rate.' }, { status: 400 });

    const supabase = getSupabaseServiceClient();
    const { data: order, error } = await supabase.from('market_orders').select('*').eq('id', orderId).maybeSingle();
    if (error) throw error;
    if (!order) return NextResponse.json({ error: 'Marketplace order not found.' }, { status: 404 });
    if (user.id !== order.seller_id) return NextResponse.json({ error: 'Only the seller can purchase the shipping label.' }, { status: 403 });
    if (order.fulfillment_method !== 'shipping') return NextResponse.json({ error: 'This order is set up for campus pickup.', code: 'NOT_SHIPPING_ORDER' }, { status: 409 });
    if (!order.shipping_shipment_id) return NextResponse.json({ error: 'Get a shipping quote before buying a label.', code: 'SHIPPING_RATES_REQUIRED' }, { status: 409 });
    if (!['paid', 'handoff_confirmed'].includes(order.status)) return NextResponse.json({ error: 'The buyer payment must be secured before purchasing a label.', code: 'PAYMENT_NOT_SECURED' }, { status: 409 });
    if (order.shipping_status === 'label_purchased' && order.shipping_label_url) {
      return NextResponse.json({ status: 'label_purchased', transactionId: order.shipping_transaction_id, labelUrl: order.shipping_label_url, trackingNumber: order.shipping_tracking_number, trackingUrl: order.shipping_tracking_url, duplicate: true });
    }

    const shipment = await getShippoShipment(order.shipping_shipment_id);
    if (!shippoShipmentMatchesOrder(shipment.metadata, order.id)) return NextResponse.json({ error: 'This shipping quote does not belong to this order.', code: 'SHIPPING_QUOTE_MISMATCH' }, { status: 409 });
    const rate = (shipment.rates || []).find((candidate) => candidate.object_id === rateId);
    if (!rate || String(rate.object_status || '').toUpperCase() !== 'VALID') return NextResponse.json({ error: 'That shipping rate expired. Request a fresh quote.', code: 'SHIPPING_RATE_EXPIRED' }, { status: 409 });

    const claimTime = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabase.from('market_orders').update({
      shipping_status: 'label_purchasing', shipping_rate_id: rate.object_id,
      shipping_rate_cents: Math.round(Number(rate.amount || 0) * 100), shipping_currency: rate.currency || 'USD',
      shipping_carrier: rate.provider || 'FedEx', shipping_service: rate.servicelevel?.name || rate.servicelevel?.token || 'Standard',
      shipping_last_event_at: claimTime, updated_at: claimTime
    }).eq('id', order.id).in('shipping_status', ['rates_ready', 'label_failed']).select('*').maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return NextResponse.json({ error: 'A shipping label is already being purchased. Refresh in a moment.', code: 'LABEL_IN_PROGRESS' }, { status: 409 });

    let transaction;
    try {
      transaction = await buyShippoLabel({ rateId: rate.object_id, metadata: JSON.stringify({ aspire_market_order_id: order.id, request_id: order.request_id }) });
    } catch (purchaseError) {
      await supabase.from('market_orders').update({ shipping_status: 'label_failed', updated_at: new Date().toISOString() }).eq('id', order.id).eq('shipping_status', 'label_purchasing');
      throw purchaseError;
    }
    if (String(transaction.status).toUpperCase() !== 'SUCCESS' || !transaction.label_url || !transaction.tracking_number) {
      await supabase.from('market_orders').update({ shipping_status: 'label_failed', updated_at: new Date().toISOString() }).eq('id', order.id).eq('shipping_status', 'label_purchasing');
      const message = transaction.messages?.map((item) => item.text).filter(Boolean).join(' ') || 'Shippo could not purchase this label.';
      return NextResponse.json({ error: message, code: 'SHIPPING_LABEL_FAILED' }, { status: 502 });
    }

    const nextStatus = normalizeShippingStatus(transaction.tracking_status?.status);
    const { error: finalizeError } = await supabase.from('market_orders').update({
      shipping_transaction_id: transaction.object_id,
      shipping_label_url: transaction.label_url,
      shipping_tracking_number: transaction.tracking_number,
      shipping_tracking_url: transaction.tracking_url_provider || null,
      shipping_status: nextStatus,
      shipping_last_event_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }).eq('id', order.id).eq('shipping_status', 'label_purchasing');
    if (finalizeError) throw finalizeError;
    await supabase.from('market_order_events').insert({ market_order_id: order.id, actor_id: user.id, event_type: 'shipping_label_purchased', payload: { carrier: transaction.rate?.provider || rate.provider || 'FedEx', service: transaction.rate?.servicelevel?.name || rate.servicelevel?.name || null, tracking_number: transaction.tracking_number } });

    return NextResponse.json({ status: nextStatus, transactionId: transaction.object_id, labelUrl: transaction.label_url, trackingNumber: transaction.tracking_number, trackingUrl: transaction.tracking_url_provider || null });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
