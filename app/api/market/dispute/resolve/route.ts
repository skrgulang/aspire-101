import { NextResponse } from 'next/server';
import {
  getAuthenticatedUser,
  getSupabaseServiceClient,
  requireAal2,
  stripeFormRequest
} from '../../../../../lib/server/aspireServer';

export const runtime = 'nodejs';

type StripeRefund = { id: string; status?: string | null; amount?: number | null };
type Action = 'refund_buyer' | 'resume_seller';

async function requireAdmin(request: Request) {
  const auth = await getAuthenticatedUser(request);
  const supabase = getSupabaseServiceClient();
  const { data: roleRow, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (error) throw error;
  if (roleRow?.role !== 'admin') throw new Error('ADMIN_REQUIRED');
  await requireAal2(auth.accessToken);
  return { ...auth, supabase };
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireAdmin(request);
    const body = await request.json().catch(() => ({})) as { disputeId?: string; action?: Action; note?: string };
    const disputeId = String(body.disputeId || '').trim();
    const action = body.action;
    const note = String(body.note || '').trim().slice(0, 2000);

    if (!disputeId || !['refund_buyer','resume_seller'].includes(String(action))) {
      return NextResponse.json({ error: 'Choose a valid dispute resolution.' }, { status: 400 });
    }
    if (note.length < 8) {
      return NextResponse.json({ error: 'Add a short reviewer note explaining the decision.' }, { status: 400 });
    }

    if (action === 'resume_seller') {
      const { data, error } = await supabase.rpc('resolve_market_dispute_for_seller', {
        p_dispute_id: disputeId,
        p_actor_id: user.id,
        p_note: note
      });
      if (error) throw error;
      return NextResponse.json({ ok: true, action, result: data });
    }

    const { data: claim, error: claimError } = await supabase.rpc('claim_market_dispute_refund', {
      p_dispute_id: disputeId,
      p_actor_id: user.id
    });
    if (claimError) throw claimError;

    const claimed = (claim || {}) as Record<string, unknown>;
    if (claimed.status === 'already_refunded') {
      return NextResponse.json({ ok: true, action, duplicate: true });
    }

    const paymentId = String(claimed.payment_id || '');
    const paymentIntentId = String(claimed.stripe_payment_intent_id || '');
    const chargeId = String(claimed.stripe_charge_id || '');
    const claimedAt = String(claimed.claimed_at || '');
    if (!paymentId || (!paymentIntentId && !chargeId)) {
      throw new Error('REFUND_PAYMENT_REFERENCE_MISSING');
    }

    const params: Record<string,string> = {
      reason: 'requested_by_customer',
      'metadata[aspire_market_dispute_id]': disputeId,
      'metadata[aspire_payment_id]': paymentId,
      'metadata[resolved_by]': user.id
    };
    if (paymentIntentId) params.payment_intent = paymentIntentId;
    else params.charge = chargeId;

    let refund: StripeRefund;
    try {
      refund = await stripeFormRequest<StripeRefund>('/v1/refunds', params, {
        idempotencyKey: `aspire_market_dispute_refund_${disputeId}`
      });
    } catch (error) {
      if (claimedAt) {
        try {
          await supabase.rpc('clear_connection_payment_refund_claim', {
            p_payment_id: paymentId,
            p_claimed_at: claimedAt
          });
        } catch {
          // Keep the original Stripe error; a stale claim expires and is recoverable.
        }
      }
      throw error;
    }

    const { data: finalized, error: finalizeError } = await supabase.rpc('finalize_market_dispute_refund', {
      p_dispute_id: disputeId,
      p_payment_id: paymentId,
      p_refund_id: refund.id,
      p_amount_cents: Number(refund.amount ?? claimed.customer_total_cents ?? 0),
      p_actor_id: user.id,
      p_note: note,
      p_stripe_status: refund.status || null
    });
    if (finalizeError) throw finalizeError;

    return NextResponse.json({ ok: true, action, refundId: refund.id, result: finalized });
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'UNKNOWN';
    if (raw === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });
    if (raw === 'ADMIN_REQUIRED') return NextResponse.json({ error: 'Admin access is required for a financial dispute decision.' }, { status: 403 });
    if (raw === 'MFA_REQUIRED') return NextResponse.json({ error: 'Complete two-step verification before resolving a financial dispute.', code: 'MFA_REQUIRED' }, { status: 403 });
    if (/DISPUTE_NOT_OPEN|DISPUTE_NOT_FOUND/i.test(raw)) return NextResponse.json({ error: 'This marketplace dispute is already closed or unavailable.' }, { status: 409 });
    if (/PAYMENT_NOT_SECURED/i.test(raw)) return NextResponse.json({ error: 'This dispute does not have a secured, unreleased Aspire payment to resolve automatically.' }, { status: 409 });
    if (/PAYOUT_ALREADY_RELEASED|PAYOUT_RELEASE_IN_PROGRESS/i.test(raw)) return NextResponse.json({ error: 'Seller payout is already releasing or released. This case requires manual Stripe reconciliation.' }, { status: 409 });
    if (/REFUND_IN_PROGRESS/i.test(raw)) return NextResponse.json({ error: 'A refund is already being processed for this payment.' }, { status: 409 });
    if (/RESOLUTION_CASE_OPEN/i.test(raw)) return NextResponse.json({ error: 'A Resolution Center case is also open for this payment. Resolve that hold before this marketplace dispute.' }, { status: 409 });
    if (/STRIPE:/i.test(raw)) return NextResponse.json({ error: raw.replace(/^STRIPE:/,'') }, { status: 502 });
    return NextResponse.json({ error: 'Could not safely resolve this marketplace dispute.' }, { status: 500 });
  }
}
