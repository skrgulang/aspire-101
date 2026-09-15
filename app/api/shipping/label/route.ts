import { NextResponse } from 'next/server';
import { apiError, getAuthenticatedUser, getSupabaseServiceClient } from '../../../../lib/server/aspireServer';
import { buyShippoLabel, getShippoShipment, normalizeShippingStatus } from '../../../../lib/server/shippo';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const staleLabelPurchaseMs = 10 * 60 * 1000;

function normalizedCarrier(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function flagPaidRateProblem(input: {
  supabase: ReturnType<typeof getSupabaseServiceClient>;
  order: any;
  actorId: string;
  code: 'SHIPPING_RATE_EXPIRED_AFTER_PAYMENT' | 'SHIPPING_RATE_CHANGED_AFTER_PAYMENT';
  detail: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  await input.supabase.from('market_orders').update({
    shipping_status: 'label_failed',
    shipping_last_event_at: now,
    updated_at: now
  }).eq('id', input.order.id);

  await input.supabase.from('market_order_events').insert({
    market_order_id: input.order.id,
    actor_id: input.actorId,
    event_type: input.code === 'SHIPPING_RATE_EXPIRED_AFTER_PAYMENT'
      ? 'shipping_rate_expired_after_payment'
      : 'shipping_rate_changed_after_payment',
    payload: {
      selected_rate_id: input.order.shipping_rate_id,
      selected_rate_cents: input.order.shipping_rate_cents,
      selected_currency: input.order.shipping_currency || input.order.currency || 'USD',
      ...input.detail
    }
  });
}

function existingLabelResponse(order: any) {
  return NextResponse.json({
    status: order.shipping_status,
    transactionId: order.shipping_transaction_id,
    labelUrl: order.shipping_label_url,
    trackingNumber: order.shipping_tracking_number,
    trackingUrl: order.shipping_tracking_url,
    duplicate: true
  });
}

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
    if (order.fulfillment_method !== 'shipping') return NextResponse.json({ error: 'This order is not configured for carrier shipping.', code: 'NOT_SHIPPING_ORDER' }, { status: 409 });
    if (!order.shipping_shipment_id) return NextResponse.json({ error: 'Get a shipping quote before buying a label.', code: 'SHIPPING_RATES_REQUIRED' }, { status: 409 });
    if (!order.shipping_rate_id || !order.shipping_rate_cents) return NextResponse.json({ error: 'The buyer must choose a shipping rate before the seller can buy a label.', code: 'SHIPPING_RATE_REQUIRED' }, { status: 409 });
    if (rateId !== order.shipping_rate_id) return NextResponse.json({ error: 'The shipping label must use the rate the buyer selected before payment.', code: 'SHIPPING_RATE_MISMATCH' }, { status: 409 });
    if (!['paid', 'handoff_confirmed'].includes(order.status)) return NextResponse.json({ error: 'The buyer payment must be secured before purchasing a label.', code: 'PAYMENT_NOT_SECURED' }, { status: 409 });

    // Once a label exists, every later shipping state is idempotently the same purchase.
    // Never try to buy another label merely because tracking has advanced beyond PRE_TRANSIT.
    if (order.shipping_label_url && order.shipping_transaction_id && ['label_purchased', 'in_transit', 'delivered', 'exception'].includes(order.shipping_status)) {
      return existingLabelResponse(order);
    }

    if (order.shipping_status === 'label_purchasing') {
      const startedAt = new Date(order.shipping_last_event_at || order.updated_at || order.created_at || 0).getTime();
      const ageMs = Number.isFinite(startedAt) ? Date.now() - startedAt : 0;
      if (ageMs >= staleLabelPurchaseMs) {
        return NextResponse.json({
          error: 'The carrier label purchase has been processing unusually long. Aspire will not automatically retry because the carrier may already have charged for a label even if the final database write was interrupted. Open the Resolution Center so the existing Shippo transaction can be reconciled before any second purchase.',
          code: 'LABEL_RECONCILIATION_REQUIRED'
        }, { status: 409 });
      }
      return NextResponse.json({
        error: 'A shipping label purchase is already in progress. Wait a moment and refresh before trying again.',
        code: 'LABEL_IN_PROGRESS'
      }, { status: 409 });
    }

    // Market-order state can lag a concurrent refund/dispute update by a few milliseconds.
    // Re-read the protected payment immediately before any external Shippo purchase so a
    // stale `paid` order cannot spend shipping funds after the payment stopped being secured.
    const { data: payment, error: paymentError } = await supabase
      .from('connection_payments')
      .select('status,stripe_transfer_id')
      .eq('connection_id', order.connection_id)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment || payment.status !== 'secured' || payment.stripe_transfer_id) {
      return NextResponse.json({
        error: 'The protected buyer payment is no longer in a secured, unreleased state. Do not purchase a carrier label; review the order or Resolution Center instead.',
        code: 'PAYMENT_NOT_SECURED'
      }, { status: 409 });
    }

    const shipment = await getShippoShipment(order.shipping_shipment_id);
    const shipmentMetadata = String(shipment.metadata || '');
    if (!shipmentMetadata.includes(order.id)) return NextResponse.json({ error: 'This shipping quote does not belong to this order.', code: 'SHIPPING_QUOTE_MISMATCH' }, { status: 409 });
    const rate = (shipment.rates || []).find((candidate) => candidate.object_id === rateId);
    if (!rate || String(rate.object_status || '').toUpperCase() !== 'VALID') {
      await flagPaidRateProblem({
        supabase,
        order,
        actorId: user.id,
        code: 'SHIPPING_RATE_EXPIRED_AFTER_PAYMENT',
        detail: { shipment_id: order.shipping_shipment_id }
      });
      return NextResponse.json({
        error: 'The buyer already paid the selected shipping amount, but that Shippo rate is no longer valid. Aspire will not silently requote or charge a different amount. Use the Resolution Center to reconcile shipping before fulfillment.',
        code: 'SHIPPING_RATE_EXPIRED_AFTER_PAYMENT'
      }, { status: 409 });
    }

    const allowedCarriers = new Set((process.env.SHIPPING_ALLOWED_CARRIERS || 'usps,ups,fedex')
      .split(',')
      .map(normalizedCarrier)
      .filter(Boolean));
    const carrier = normalizedCarrier(rate.provider);
    if (!carrier || !allowedCarriers.has(carrier)) {
      return NextResponse.json({ error: 'That carrier is not enabled for Aspire shipping.', code: 'SHIPPING_CARRIER_NOT_ALLOWED' }, { status: 409 });
    }

    const rateCents = Math.round(Number(rate.amount || 0) * 100);
    const rateCurrency = String(rate.currency || 'USD').toUpperCase();
    if (rateCents !== Number(order.shipping_rate_cents) || rateCurrency !== String(order.shipping_currency || order.currency || 'USD').toUpperCase()) {
      await flagPaidRateProblem({
        supabase,
        order,
        actorId: user.id,
        code: 'SHIPPING_RATE_CHANGED_AFTER_PAYMENT',
        detail: {
          current_rate_cents: rateCents,
          current_currency: rateCurrency,
          shipment_id: order.shipping_shipment_id
        }
      });
      return NextResponse.json({
        error: 'The carrier price changed after buyer payment. Aspire will not substitute the new price or change the protected total. Use the Resolution Center to reconcile shipping before fulfillment.',
        code: 'SHIPPING_RATE_CHANGED_AFTER_PAYMENT'
      }, { status: 409 });
    }

    const claimTime = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabase.from('market_orders').update({
      shipping_status: 'label_purchasing',
      shipping_last_event_at: claimTime,
      updated_at: claimTime
    }).eq('id', order.id).eq('status', order.status).eq('shipping_rate_id', order.shipping_rate_id).in('shipping_status', ['rates_ready', 'label_failed']).select('*').maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return NextResponse.json({ error: 'The order changed or a shipping label is already being purchased. Refresh before continuing.', code: 'LABEL_IN_PROGRESS' }, { status: 409 });

    let transaction;
    try {
      transaction = await buyShippoLabel({ rateId: rate.object_id, metadata: JSON.stringify({ aspire_market_order_id: order.id, request_id: order.request_id }) });
    } catch (purchaseError) {
      await supabase.from('market_orders').update({ shipping_status: 'label_failed', shipping_last_event_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', order.id).eq('shipping_status', 'label_purchasing');
      throw purchaseError;
    }
    if (String(transaction.status).toUpperCase() !== 'SUCCESS' || !transaction.label_url || !transaction.tracking_number) {
      await supabase.from('market_orders').update({ shipping_status: 'label_failed', shipping_last_event_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', order.id).eq('shipping_status', 'label_purchasing');
      const message = transaction.messages?.map((item) => item.text).filter(Boolean).join(' ') || 'Shippo could not purchase this label.';
      return NextResponse.json({ error: message, code: 'SHIPPING_LABEL_FAILED' }, { status: 502 });
    }

    const nextStatus = normalizeShippingStatus(transaction.tracking_status?.status);
    const finalizedAt = new Date().toISOString();
    const { data: finalized, error: finalizeError } = await supabase.from('market_orders').update({
      shipping_transaction_id: transaction.object_id,
      shipping_label_url: transaction.label_url,
      shipping_tracking_number: transaction.tracking_number,
      shipping_tracking_url: transaction.tracking_url_provider || null,
      shipping_status: nextStatus,
      shipping_last_event_at: finalizedAt,
      updated_at: finalizedAt
    }).eq('id', order.id).eq('shipping_status', 'label_purchasing').select('id').maybeSingle();
    if (finalizeError) throw finalizeError;
    if (!finalized) {
      // Shippo may already have charged for this label. Failing closed here prevents a
      // second purchase if another state transition won the database race.
      return NextResponse.json({
        error: 'The carrier created a label, but Aspire could not safely attach it to the order because the order changed during purchase. Do not retry. Use the Resolution Center for reconciliation.',
        code: 'LABEL_RECONCILIATION_REQUIRED'
      }, { status: 409 });
    }

    await supabase.from('market_order_events').insert({ market_order_id: order.id, actor_id: user.id, event_type: 'shipping_label_purchased', payload: { carrier: transaction.rate?.provider || rate.provider || 'Carrier', service: transaction.rate?.servicelevel?.name || rate.servicelevel?.name || null, tracking_number: transaction.tracking_number } });

    return NextResponse.json({ status: nextStatus, transactionId: transaction.object_id, labelUrl: transaction.label_url, trackingNumber: transaction.tracking_number, trackingUrl: transaction.tracking_url_provider || null });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
