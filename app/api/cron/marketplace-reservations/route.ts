import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  getSupabaseServiceClient,
  stripeFormRequest,
  stripeGet,
  stripeLivemode
} from '../../../../lib/server/aspireServer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ExpiredReservation = {
  id: string;
  connection_id: string;
  reservation_expires_at: string;
};

type Payment = {
  status: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  stripe_livemode: boolean;
};

type CheckoutSession = {
  id: string;
  status?: 'open' | 'complete' | 'expired' | null;
  payment_status?: 'paid' | 'unpaid' | 'no_payment_required' | null;
};

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const received = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  if (!authorized(request)) {
    return NextResponse.json(
      { error: 'Unauthorized.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const supabase = getSupabaseServiceClient();
  const now = new Date().toISOString();
  const currentStripeMode = stripeLivemode();
  const errors: string[] = [];
  let released = 0;
  let skippedPaymentInFlight = 0;
  let skippedStripeMode = 0;

  const { data, error } = await supabase
    .from('market_orders')
    .select('id,connection_id,reservation_expires_at')
    .eq('status', 'awaiting_payment')
    .lte('reservation_expires_at', now)
    .order('reservation_expires_at', { ascending: true })
    .limit(50);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  for (const reservation of (data ?? []) as ExpiredReservation[]) {
    try {
      const { data: payment, error: paymentError } = await supabase
        .from('connection_payments')
        .select('status,stripe_checkout_session_id,stripe_payment_intent_id,stripe_charge_id,stripe_livemode')
        .eq('connection_id', reservation.connection_id)
        .maybeSingle();
      if (paymentError) throw paymentError;

      const candidate = payment as Payment | null;
      if (candidate && (
        !['not_started', 'checkout_created', 'failed', 'cancelled'].includes(candidate.status) ||
        candidate.stripe_payment_intent_id ||
        candidate.stripe_charge_id
      )) {
        skippedPaymentInFlight += 1;
        continue;
      }

      const sessionId = candidate?.stripe_checkout_session_id || null;
      if (sessionId) {
        if (candidate?.stripe_livemode !== currentStripeMode) {
          skippedStripeMode += 1;
          continue;
        }

        let session = await stripeGet<CheckoutSession>(
          `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`
        );
        if (session.payment_status === 'paid' || session.status === 'complete') {
          skippedPaymentInFlight += 1;
          continue;
        }
        if (session.status === 'open') {
          session = await stripeFormRequest<CheckoutSession>(
            `/v1/checkout/sessions/${encodeURIComponent(sessionId)}/expire`,
            {}
          );
        }
        if (session.status !== 'expired') {
          skippedPaymentInFlight += 1;
          continue;
        }
      }

      const { data: didRelease, error: releaseError } = await supabase.rpc(
        'expire_unpaid_marketplace_reservation',
        {
          p_market_order_id: reservation.id,
          p_expected_checkout_session_id: sessionId
        }
      );
      if (releaseError) throw releaseError;
      if (didRelease) released += 1;
    } catch (reservationError) {
      const message = reservationError instanceof Error ? reservationError.message : String(reservationError);
      errors.push(`${reservation.id}: ${message}`);
    }
  }

  return NextResponse.json(
    {
      ok: errors.length === 0,
      checked: data?.length ?? 0,
      released,
      skippedPaymentInFlight,
      skippedStripeMode,
      errors: errors.slice(0, 10)
    },
    {
      status: errors.length ? 500 : 200,
      headers: { 'Cache-Control': 'no-store' }
    }
  );
}

