import { NextResponse } from 'next/server';
import {
  apiError,
  calculatePlatformFee,
  getAuthenticatedUser,
  getSupabaseServiceClient,
  publicOrigin,
  stripeFormRequest
} from '../../../../../lib/server/aspireServer';

type CheckoutSession = {
  id: string;
  url: string | null;
};

type PaymentRow = {
  id: string;
  status: string;
  transfer_group: string;
  checkout_attempt: number;
};

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    if (!user.phone_confirmed_at) throw new Error('PHONE_REQUIRED');

    const body = await request.json().catch(() => ({}));
    const connectionId = typeof body?.connectionId === 'string' ? body.connectionId : '';
    if (!connectionId) return NextResponse.json({ error: 'Missing connection.' }, { status: 400 });

    const supabase = getSupabaseServiceClient();
    const [{ data: verification }, { data: connection }] = await Promise.all([
      supabase.from('school_verifications').select('status').eq('user_id', user.id).maybeSingle(),
      supabase.from('connections').select('*').eq('id', connectionId).maybeSingle()
    ]);

    if (verification?.status !== 'verified') throw new Error('SCHOOL_REQUIRED');
    if (!connection) return NextResponse.json({ error: 'Connection not found.' }, { status: 404 });
    if (connection.requester_id !== user.id) throw new Error('NOT_REQUESTER');
    if (!['confirmed', 'active'].includes(connection.status)) throw new Error('CONNECTION_NOT_READY');

    const [{ data: aspireRequest }, { data: payoutAccount }, { data: existingPayment }] = await Promise.all([
      supabase.from('requests').select('id,title,kind,amount_cents,currency,payment_method').eq('id', connection.request_id).maybeSingle(),
      supabase.from('payment_accounts').select('stripe_account_id,status,transfers_enabled').eq('user_id', connection.responder_id).maybeSingle(),
      supabase.from('connection_payments').select('*').eq('connection_id', connection.id).maybeSingle()
    ]);

    if (!aspireRequest) return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
    if (aspireRequest.payment_method !== 'aspire') throw new Error('PAYMENT_NOT_REQUIRED');
    if (!payoutAccount?.stripe_account_id || payoutAccount.status !== 'READY' || payoutAccount.transfers_enabled !== true) {
      throw new Error('PAYOUT_NOT_READY');
    }
    if (existingPayment && ['secured', 'released'].includes(existingPayment.status)) throw new Error('PAYMENT_ALREADY_SECURED');

    const grossAmount = Number(connection.agreed_amount_cents ?? aspireRequest.amount_cents ?? 0);
    if (!Number.isInteger(grossAmount) || grossAmount <= 0) {
      return NextResponse.json({ error: 'This connection does not have a valid agreed amount yet.' }, { status: 409 });
    }

    const platformFee = calculatePlatformFee(grossAmount);
    const providerAmount = grossAmount - platformFee;
    const currency = String(aspireRequest.currency || 'USD').toUpperCase();
    const transferGroup = existingPayment?.transfer_group || `aspire_${connection.id.replace(/-/g, '')}`;

    let payment = existingPayment as PaymentRow | null;
    if (!payment) {
      const { data, error } = await supabase.from('connection_payments').insert({
        connection_id: connection.id,
        request_id: aspireRequest.id,
        payer_id: connection.requester_id,
        payee_id: connection.responder_id,
        currency,
        gross_amount_cents: grossAmount,
        platform_fee_cents: platformFee,
        provider_amount_cents: providerAmount,
        status: 'not_started',
        transfer_group: transferGroup
      }).select('id,status,transfer_group,checkout_attempt').single();
      if (error) throw error;
      payment = data as PaymentRow;
    } else {
      const { error } = await supabase.from('connection_payments').update({
        currency,
        gross_amount_cents: grossAmount,
        platform_fee_cents: platformFee,
        provider_amount_cents: providerAmount,
        updated_at: new Date().toISOString()
      }).eq('id', payment.id);
      if (error) throw error;
    }

    const attempt = Number(payment.checkout_attempt || 0) + 1;
    const origin = publicOrigin(request);
    if (!origin.startsWith('https://')) throw new Error('MISSING_ENV:NEXT_PUBLIC_SITE_URL');

    const session = await stripeFormRequest<CheckoutSession>('/v1/checkout/sessions', {
      mode: 'payment',
      customer_email: user.email || undefined,
      'line_items[0][price_data][currency]': currency.toLowerCase(),
      'line_items[0][price_data][product_data][name]': `Aspire 101 · ${String(aspireRequest.title).slice(0, 90)}`,
      'line_items[0][price_data][unit_amount]': grossAmount,
      'line_items[0][quantity]': 1,
      'payment_intent_data[transfer_group]': transferGroup,
      'payment_intent_data[metadata][aspire_payment_id]': payment.id,
      'payment_intent_data[metadata][connection_id]': connection.id,
      'payment_intent_data[metadata][request_id]': aspireRequest.id,
      'payment_intent_data[metadata][payer_id]': connection.requester_id,
      'payment_intent_data[metadata][payee_id]': connection.responder_id,
      'metadata[aspire_payment_id]': payment.id,
      'metadata[connection_id]': connection.id,
      success_url: `${origin}/connections?payment=success&connection=${encodeURIComponent(connection.id)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/connections?payment=cancelled&connection=${encodeURIComponent(connection.id)}`
    }, { idempotencyKey: `aspire_checkout_${payment.id}_${attempt}` });

    if (!session.url) throw new Error('STRIPE:Checkout did not return a redirect URL.');

    const { error: saveError } = await supabase.from('connection_payments').update({
      status: 'checkout_created',
      checkout_attempt: attempt,
      stripe_checkout_session_id: session.id,
      failure_reason: null,
      updated_at: new Date().toISOString()
    }).eq('id', payment.id);
    if (saveError) throw saveError;

    return NextResponse.json({
      url: session.url,
      paymentId: payment.id,
      status: 'checkout_created',
      amountCents: grossAmount,
      platformFeeCents: platformFee,
      providerAmountCents: providerAmount
    });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
