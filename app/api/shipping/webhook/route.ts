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

function shouldApplyShippingStatus(current: string | null | undefined, next: string) {
  const previous = current || 'not_started';
  if (previous === next) return false;
  if (previous === 'cancelled') return false;

  // Carrier webhooks can arrive out of order. A stale pre-transit scan must never move a
  // package backwards after real carrier movement, and a delivered package is terminal.
  if (previous === 'delivered') return false;
  if (previous === 'in_transit' && next === 'label_purchased') return false;
  if (previous === 'exception' && next === 'label_purchased') return false;

  // Exception is intentionally recoverable: carriers can resume transit after a temporary
  // delay/exception, so exception -> in_transit/delivered is allowed.
  return true;
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
    let query = supabase
      .from('market_orders')
      .select('id,status,fulfillment_method,shipping_status,shipping_tracking_number,seller_handed_off_at,buyer_received_at')
      .limit(1);
    if (orderId) query = query.eq('id', orderId);
    else query = query.eq('shipping_tracking_number', trackingNumber);
    const { data: order, error } = await query.maybeSingle();
    if (error) throw error;
    if (!order) return NextResponse.json({ received: true, ignored: true });
    if (order.fulfillment_method !== 'shipping') return NextResponse.json({ received: true, ignored: true });

    const nextStatus = normalizeShippingStatus(statusValue);
    const now = new Date().toISOString();
    const applyStatus = shouldApplyShippingStatus(order.shipping_status, nextStatus);

    if (applyStatus || (trackingNumber && !order.shipping_tracking_number)) {
      const update: Record<string, unknown> = {
        shipping_tracking_number: order.shipping_tracking_number || trackingNumber || null,
        shipping_last_event_at: now,
        updated_at: now
      };
      if (applyStatus) update.shipping_status = nextStatus;

      const { error: updateError } = await supabase.from('market_orders').update(update).eq('id', order.id);
      if (updateError) throw updateError;

      if (applyStatus) {
        await supabase.from('market_order_events').insert({
          market_order_id: order.id,
          actor_id: null,
          event_type: 'shipping_status_changed',
          payload: { status: nextStatus, tracking_number: trackingNumber || order.shipping_tracking_number || null }
        });
      }
    } else if (order.shipping_status !== nextStatus) {
      await supabase.from('market_order_events').insert({
        market_order_id: order.id,
        actor_id: null,
        event_type: 'shipping_status_regression_ignored',
        payload: {
          current_status: order.shipping_status || 'not_started',
          incoming_status: nextStatus,
          tracking_number: trackingNumber || order.shipping_tracking_number || null
        }
      });
    }

    // Carrier movement is authoritative evidence that the seller handed the package to
    // the carrier. Advance only a still-paid order; never overwrite a dispute, refund,
    // cancellation, release-ready state, or any later lifecycle decision.
    if (
      !order.seller_handed_off_at
      && order.status === 'paid'
      && ['in_transit', 'delivered'].includes(nextStatus)
    ) {
      const { data: advanced, error: handoffError } = await supabase.from('market_orders').update({
        seller_handed_off_at: now,
        status: order.buyer_received_at ? 'release_ready' : 'handoff_confirmed',
        updated_at: now
      })
        .eq('id', order.id)
        .eq('status', 'paid')
        .is('seller_handed_off_at', null)
        .select('id')
        .maybeSingle();
      if (handoffError) throw handoffError;
      if (advanced) {
        await supabase.from('market_order_events').insert({
          market_order_id: order.id,
          actor_id: null,
          event_type: 'carrier_handoff_confirmed',
          payload: { shipping_status: nextStatus, tracking_number: trackingNumber || order.shipping_tracking_number || null }
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook failed.';
    if (message.startsWith('MISSING_ENV:')) return NextResponse.json({ error: 'Shipping is not configured.' }, { status: 503 });
    return NextResponse.json({ error: 'Could not process shipping webhook.' }, { status: 500 });
  }
}
