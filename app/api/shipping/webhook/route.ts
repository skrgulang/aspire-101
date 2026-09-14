import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '../../../../lib/server/aspireServer';
import { normalizeShippingStatus } from '../../../../lib/server/shippo';

function webhookAuthorized(request: Request) {
  const token = process.env.SHIPPO_WEBHOOK_TOKEN;
  if (!token) return false;
  const header = request.headers.get('x-shippo-webhook-token') || request.headers.get('x-webhook-token');
  const urlToken = new URL(request.url).searchParams.get('token');
  return header === token || urlToken === token;
}

function metadataOrderId(value: unknown) {
  if (typeof value !== 'string') return '';
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return typeof parsed.aspire_market_order_id === 'string' ? parsed.aspire_market_order_id : '';
  } catch { return ''; }
}

export async function POST(request: Request) {
  try {
    if (!webhookAuthorized(request)) return NextResponse.json({ error: 'Invalid webhook token.' }, { status: 401 });
    const payload = await request.json().catch(() => ({}));
    const data = payload?.data || payload;
    const tracking = data?.tracking_status || data?.trackingStatus || {};
    const statusValue = tracking?.status || data?.status;
    const orderId = metadataOrderId(data?.metadata) || metadataOrderId(payload?.metadata);
    const trackingNumber = typeof data?.tracking_number === 'string' ? data.tracking_number : '';
    if (!orderId && !trackingNumber) return NextResponse.json({ received: true, ignored: true });

    const supabase = getSupabaseServiceClient();
    let query = supabase.from('market_orders').select('id,shipping_status').limit(1);
    if (orderId) query = query.eq('id', orderId);
    else query = query.eq('shipping_tracking_number', trackingNumber);
    const { data: order, error } = await query.maybeSingle();
    if (error) throw error;
    if (!order) return NextResponse.json({ received: true, ignored: true });

    const nextStatus = normalizeShippingStatus(statusValue);
    const now = new Date().toISOString();
    if (order.shipping_status !== nextStatus) {
      const { error: updateError } = await supabase.from('market_orders').update({ shipping_status: nextStatus, shipping_last_event_at: now, updated_at: now }).eq('id', order.id);
      if (updateError) throw updateError;
      await supabase.from('market_order_events').insert({ market_order_id: order.id, actor_id: null, event_type: 'shipping_status_changed', payload: { status: nextStatus, tracking_number: trackingNumber || null } });
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook failed.';
    if (message.startsWith('MISSING_ENV:')) return NextResponse.json({ error: 'Shipping is not configured.' }, { status: 503 });
    return NextResponse.json({ error: 'Could not process shipping webhook.' }, { status: 500 });
  }
}
