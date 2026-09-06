import { NextResponse } from 'next/server';
import { apiError, getSupabaseServiceClient, verifyStripeWebhookSignature } from '../../../../lib/server/aspireServer';

type StripeEvent = {
  id: string;
  type: string;
  livemode: boolean;
  data: { object: Record<string, any> };
};

function objectId(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') return (value as { id: string }).id;
  return null;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  let verified = false;
  let parsedEvent: StripeEvent | null = null;

  try {
    verifyStripeWebhookSignature(rawBody, request.headers.get('stripe-signature'));
    verified = true;
    const event = JSON.parse(rawBody) as StripeEvent;
    parsedEvent = event;

    if (!event?.id || !event?.type || !event?.data?.object) {
      return NextResponse.json({ error: 'Invalid Stripe event.' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { data: existing } = await supabase
      .from('stripe_webhook_events')
      .select('status')
      .eq('event_id', event.id)
      .maybeSingle();

    if (existing?.status === 'processed') return NextResponse.json({ received: true, duplicate: true });

    await supabase.from('stripe_webhook_events').upsert({
      event_id: event.id,
      event_type: event.type,
      livemode: Boolean(event.livemode),
      status: 'received',
      received_at: new Date().toISOString(),
      processing_error: null
    }, { onConflict: 'event_id' });

    const object = event.data.object;

    if (event.type === 'checkout.session.completed') {
      const paymentId = object.metadata?.aspire_payment_id;
      if (paymentId) {
        await supabase.from('connection_payments').update({
          status: 'processing',
          stripe_checkout_session_id: object.id || null,
          stripe_payment_intent_id: objectId(object.payment_intent),
          updated_at: new Date().toISOString()
        })
          .eq('id', paymentId)
          .in('status', ['not_started', 'checkout_created', 'failed', 'processing']);
      }
    }

    if (event.type === 'checkout.session.async_payment_failed') {
      const paymentId = object.metadata?.aspire_payment_id;
      if (paymentId) {
        await supabase.from('connection_payments').update({
          status: 'failed',
          failure_reason: 'Stripe reported that the asynchronous payment failed.',
          updated_at: new Date().toISOString()
        })
          .eq('id', paymentId)
          .in('status', ['checkout_created', 'processing']);
      }
    }

    if (event.type === 'payment_intent.succeeded') {
      const paymentId = object.metadata?.aspire_payment_id;
      if (paymentId) {
        const { data: payment } = await supabase
          .from('connection_payments')
          .select('id,status,customer_total_cents,gross_amount_cents,currency')
          .eq('id', paymentId)
          .maybeSingle();

        if (!payment) throw new Error('STRIPE:Aspire payment record was not found for the completed PaymentIntent.');
        const expectedAmount = Number(payment.customer_total_cents ?? payment.gross_amount_cents ?? 0);
        const receivedAmount = Number(object.amount_received ?? object.amount ?? 0);
        const expectedCurrency = String(payment.currency || 'USD').toLowerCase();
        const receivedCurrency = String(object.currency || '').toLowerCase();
        if (expectedAmount <= 0 || receivedAmount !== expectedAmount || receivedCurrency !== expectedCurrency) {
          throw new Error('STRIPE:Stripe payment amount or currency did not match the Aspire fee snapshot.');
        }

        await supabase.from('connection_payments').update({
          status: 'secured',
          stripe_payment_intent_id: object.id || null,
          stripe_charge_id: objectId(object.latest_charge),
          failure_reason: null,
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
          .eq('id', paymentId)
          .in('status', ['not_started', 'checkout_created', 'processing', 'failed', 'secured']);
      }
    }

    if (event.type === 'payment_intent.payment_failed') {
      const paymentId = object.metadata?.aspire_payment_id;
      if (paymentId) {
        await supabase.from('connection_payments').update({
          status: 'failed',
          stripe_payment_intent_id: object.id || null,
          failure_reason: object.last_payment_error?.message || 'Stripe reported that the payment failed.',
          updated_at: new Date().toISOString()
        })
          .eq('id', paymentId)
          .in('status', ['not_started', 'checkout_created', 'processing', 'failed']);
      }
    }

    if (event.type === 'charge.dispute.created') {
      const chargeId = objectId(object.charge);
      if (chargeId) {
        await supabase.from('connection_payments').update({
          status: 'disputed',
          disputed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).eq('stripe_charge_id', chargeId).neq('status', 'refunded');
      }
    }

    if (event.type === 'charge.refunded' && object.id && Number(object.amount_refunded || 0) >= Number(object.amount || 0)) {
      await supabase.from('connection_payments').update({
        status: 'refunded',
        refunded_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq('stripe_charge_id', object.id).neq('status', 'released');
    }

    await supabase.from('stripe_webhook_events').update({
      status: 'processed',
      processed_at: new Date().toISOString(),
      processing_error: null
    }).eq('event_id', event.id);

    return NextResponse.json({ received: true });
  } catch (error) {
    // Only a payload with a valid Stripe signature is allowed to create/update event records.
    if (verified && parsedEvent?.id) {
      try {
        const supabase = getSupabaseServiceClient();
        await supabase.from('stripe_webhook_events').upsert({
          event_id: parsedEvent.id,
          event_type: parsedEvent.type || 'unknown',
          livemode: Boolean(parsedEvent.livemode),
          status: 'failed',
          processing_error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown webhook error'
        }, { onConflict: 'event_id' });
      } catch {
        // Avoid masking the original processing error.
      }
    }
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
