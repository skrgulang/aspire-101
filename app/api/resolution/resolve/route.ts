import { NextResponse } from 'next/server';
import {
  apiError,
  getAuthenticatedUser,
  getSupabaseServiceClient,
  stripeFormRequest,
  stripeLivemode
} from '../../../../lib/server/aspireServer';

type StripeRefund = { id: string; status?: string | null; amount?: number | null };
type ResolutionAction = 'refund_full' | 'dismiss';

function claimFailure(message: string) {
  if (/PAYOUT_RELEASE_IN_PROGRESS|PAYOUT_ALREADY_RELEASED/i.test(message)) {
    return NextResponse.json({
      error: 'Provider payout is already releasing or released. This case needs manual reconciliation.',
      code: 'PAYOUT_ALREADY_RELEASED'
    }, { status: 409 });
  }
  if (/MARKET_DISPUTE_OPEN/i.test(message)) {
    return NextResponse.json({
      error: 'A marketplace dispute is already open for this payment. Resolve that financial review first.',
      code: 'MARKET_DISPUTE_OPEN'
    }, { status: 409 });
  }
  if (/RESOLUTION_CASE_NOT_OPEN/i.test(message)) {
    return NextResponse.json({ error: 'This Resolution Center case is no longer open.', code: 'CASE_CLOSED' }, { status: 409 });
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    const caseId = typeof body?.caseId === 'string' ? body.caseId : '';
    const action = body?.action as ResolutionAction;
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 2000) : '';
    if (!caseId || !['refund_full', 'dismiss'].includes(action)) {
      return NextResponse.json({ error: 'Invalid resolution request.' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const livemode = stripeLivemode();
    const { data: roleRow, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();
    if (roleError) throw roleError;
    const role = String(roleRow?.role || 'member');
    if (!['moderator', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Trust & Safety access required.' }, { status: 403 });
    }
    if (action === 'refund_full' && role !== 'admin') {
      return NextResponse.json({ error: 'Only an Aspire admin can issue a financial refund.' }, { status: 403 });
    }

    const { data: resolutionCase, error: caseError } = await supabase
      .from('connection_resolution_cases')
      .select('*')
      .eq('id', caseId)
      .maybeSingle();
    if (caseError) throw caseError;
    if (!resolutionCase) return NextResponse.json({ error: 'Resolution case not found.' }, { status: 404 });

    if (resolutionCase.status === 'resolved_refund' && action === 'refund_full') {
      return NextResponse.json({
        ok: true,
        status: 'resolved_refund',
        refundCents: resolutionCase.refund_cents || 0,
        duplicate: true
      });
    }
    if (resolutionCase.status === 'dismissed' && action === 'dismiss') {
      return NextResponse.json({ ok: true, status: 'dismissed', duplicate: true });
    }
    if (!['submitted', 'under_review'].includes(resolutionCase.status)) {
      return NextResponse.json({ error: 'This case is already closed.' }, { status: 409 });
    }

    if (action === 'dismiss') {
      const { data: dismissed, error: dismissError } = await supabase.rpc('dismiss_connection_resolution_case', {
        p_case_id: caseId,
        p_reviewer_id: user.id,
        p_note: note || null
      });
      if (dismissError) throw dismissError;
      return NextResponse.json({ ok: true, status: 'dismissed', duplicate: Boolean(dismissed?.duplicate) });
    }

    const { data: payment, error: paymentError } = await supabase
      .from('connection_payments')
      .select('id,payer_id,payee_id,status,currency,gross_amount_cents,customer_total_cents,stripe_payment_intent_id,stripe_charge_id,stripe_transfer_id,stripe_refund_id,stripe_livemode')
      .eq('connection_id', resolutionCase.connection_id)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment) return NextResponse.json({ error: 'No Aspire payment exists for this connection.' }, { status: 409 });
    if (payment.stripe_livemode !== livemode) {
      return NextResponse.json({
        error: 'This payment belongs to a different Stripe environment and cannot be resolved financially here.',
        code: 'PAYMENT_MODE_MISMATCH'
      }, { status: 409 });
    }

    if (payment.status === 'refunded') {
      if (!payment.stripe_refund_id) {
        return NextResponse.json({
          error: 'Stripe already reports this payment as refunded, but its refund reference needs manual reconciliation.',
          code: 'REFUND_RECONCILIATION_REQUIRED'
        }, { status: 409 });
      }
      const amount = Number(payment.customer_total_cents ?? payment.gross_amount_cents ?? 0);
      const { error: finalizeExistingError } = await supabase.rpc('finalize_connection_payment_refund', {
        p_payment_id: payment.id,
        p_refund_id: payment.stripe_refund_id,
        p_amount_cents: amount,
        p_actor_id: user.id,
        p_resolution_case_id: caseId,
        p_note: note || 'Full Aspire payment refunded.',
        p_stripe_status: 'succeeded'
      });
      if (finalizeExistingError) throw finalizeExistingError;
      return NextResponse.json({ ok: true, status: 'resolved_refund', refundCents: amount, duplicate: true });
    }
    if (payment.status !== 'secured') {
      return NextResponse.json({ error: 'Only a secured, unreleased Aspire payment can be refunded from this case.' }, { status: 409 });
    }
    if (payment.stripe_transfer_id) {
      return NextResponse.json({ error: 'Seller/provider funds were already transferred. This case needs manual reconciliation instead of an automatic refund.' }, { status: 409 });
    }

    const evidence = resolutionCase.evidence_snapshot && typeof resolutionCase.evidence_snapshot === 'object'
      ? resolutionCase.evidence_snapshot as Record<string, unknown>
      : {};
    const cancellationActorId = typeof evidence.cancellation_actor_id === 'string' ? evidence.cancellation_actor_id : '';
    const providerSelfCancelled = resolutionCase.reason === 'cancellation'
      && resolutionCase.opened_by === payment.payee_id
      && cancellationActorId === payment.payee_id
      && evidence.voluntary_cancellation === true;

    if (resolutionCase.opened_by !== payment.payer_id && !providerSelfCancelled) {
      return NextResponse.json({ error: 'This case is not eligible for an automatic customer refund. Review compensation manually.' }, { status: 409 });
    }
    if (resolutionCase.reason === 'no_show' && resolutionCase.against_user_id !== payment.payee_id) {
      return NextResponse.json({ error: 'This no-show case is not eligible for an automatic full refund. Review compensation manually.' }, { status: 409 });
    }
    if (!payment.stripe_payment_intent_id && !payment.stripe_charge_id) {
      return NextResponse.json({ error: 'Stripe payment identifiers are not ready for refund.' }, { status: 409 });
    }

    const { data: claimedAtValue, error: claimError } = await supabase.rpc('claim_connection_payment_refund', {
      p_payment_id: payment.id,
      p_resolution_case_id: caseId
    });
    if (claimError) {
      const response = claimFailure(`${claimError.message || ''} ${claimError.details || ''}`);
      if (response) return response;
      throw claimError;
    }

    const refundParams: Record<string, string> = {
      reason: 'requested_by_customer',
      'metadata[aspire_resolution_case_id]': caseId,
      'metadata[connection_id]': resolutionCase.connection_id,
      'metadata[aspire_payment_id]': payment.id
    };
    if (payment.stripe_payment_intent_id) refundParams.payment_intent = payment.stripe_payment_intent_id;
    else refundParams.charge = payment.stripe_charge_id;

    const claimedAt = typeof claimedAtValue === 'string' ? claimedAtValue : String(claimedAtValue || '');
    let refund: StripeRefund;
    try {
      refund = await stripeFormRequest<StripeRefund>('/v1/refunds', refundParams, {
        idempotencyKey: `aspire_resolution_refund_${caseId}`
      });
    } catch (error) {
      if (claimedAt) {
        const { error: clearClaimError } = await supabase.rpc('clear_connection_payment_refund_claim', {
          p_payment_id: payment.id,
          p_claimed_at: claimedAt
        });
        if (clearClaimError) console.error('Could not clear failed Resolution Center refund claim', clearClaimError);
      }
      throw error;
    }

    const amount = Number(refund.amount ?? payment.customer_total_cents ?? payment.gross_amount_cents ?? 0);
    const { data: finalized, error: finalizeError } = await supabase.rpc('finalize_connection_payment_refund', {
      p_payment_id: payment.id,
      p_refund_id: refund.id,
      p_amount_cents: amount,
      p_actor_id: user.id,
      p_resolution_case_id: caseId,
      p_note: note || 'Full Aspire payment refunded after Resolution Center review.',
      p_stripe_status: refund.status || null
    });
    if (finalizeError) throw finalizeError;

    return NextResponse.json({
      ok: true,
      status: 'resolved_refund',
      refundCents: amount,
      duplicate: Boolean(finalized?.duplicate)
    });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
