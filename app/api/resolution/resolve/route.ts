import { NextResponse } from 'next/server';
import {
  apiError,
  getAuthenticatedUser,
  getSupabaseServiceClient,
  stripeFormRequest
} from '../../../../lib/server/aspireServer';

type StripeRefund = { id: string; status?: string | null; amount?: number | null };

type ResolutionAction = 'refund_full' | 'dismiss';

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
    const { data: roleRow } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
    const role = String(roleRow?.role || 'member');
    if (!['moderator', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Trust & Safety access required.' }, { status: 403 });
    }
    if (action === 'refund_full' && role !== 'admin') {
      return NextResponse.json({ error: 'Only an Aspire admin can issue a financial refund.' }, { status: 403 });
    }

    const { data: resolutionCase } = await supabase
      .from('connection_resolution_cases')
      .select('*')
      .eq('id', caseId)
      .maybeSingle();
    if (!resolutionCase) return NextResponse.json({ error: 'Resolution case not found.' }, { status: 404 });

    if (resolutionCase.status === 'resolved_refund' && action === 'refund_full') {
      return NextResponse.json({ ok: true, status: 'resolved_refund', refundCents: resolutionCase.refund_cents || 0, duplicate: true });
    }
    if (!['submitted', 'under_review'].includes(resolutionCase.status)) {
      return NextResponse.json({ error: 'This case is already closed.' }, { status: 409 });
    }

    if (action === 'dismiss') {
      const now = new Date().toISOString();
      await supabase.from('connection_resolution_cases').update({
        status: 'dismissed',
        resolution_note: note || 'Case closed after Aspire review.',
        reviewed_by: user.id,
        reviewed_at: now,
        updated_at: now
      }).eq('id', caseId).in('status', ['submitted', 'under_review']);
      await supabase.from('connection_events').insert({
        connection_id: resolutionCase.connection_id,
        actor_id: user.id,
        event_type: 'issue_resolved',
        body: 'Aspire reviewed the issue and closed the case. Payment release is no longer paused by this case.',
        metadata: { case_id: caseId, status: 'dismissed' }
      });
      return NextResponse.json({ ok: true, status: 'dismissed' });
    }

    const { data: payment } = await supabase
      .from('connection_payments')
      .select('id,payer_id,payee_id,status,currency,gross_amount_cents,customer_total_cents,stripe_payment_intent_id,stripe_charge_id,stripe_transfer_id')
      .eq('connection_id', resolutionCase.connection_id)
      .maybeSingle();
    if (!payment) return NextResponse.json({ error: 'No Aspire payment exists for this connection.' }, { status: 409 });
    if (payment.status === 'refunded') {
      const amount = Number(payment.customer_total_cents ?? payment.gross_amount_cents ?? 0);
      const now = new Date().toISOString();
      await supabase.from('connection_resolution_cases').update({
        status: 'resolved_refund', refund_cents: amount, resolution_note: note || 'Full Aspire payment refunded.', reviewed_by: user.id, reviewed_at: now, updated_at: now
      }).eq('id', caseId);
      return NextResponse.json({ ok: true, status: 'resolved_refund', refundCents: amount, duplicate: true });
    }
    if (payment.status !== 'secured') {
      return NextResponse.json({ error: 'Only a secured, unreleased Aspire payment can be refunded from this case.' }, { status: 409 });
    }
    if (payment.stripe_transfer_id) {
      return NextResponse.json({ error: 'Seller/provider funds were already transferred. This case needs manual reconciliation instead of an automatic refund.' }, { status: 409 });
    }

    // Automatic refunds always return money to Stripe's original payer. Require the
    // case itself to have been opened by that payer so a provider-side compensation
    // claim cannot accidentally trigger a customer refund from the admin console.
    if (resolutionCase.opened_by !== payment.payer_id) {
      return NextResponse.json({ error: 'This case was not opened by the payer, so it is not eligible for an automatic customer refund. Review compensation manually.' }, { status: 409 });
    }

    // A payer asking for a full no-show refund must also have reported the actual payee.
    // Other no-show shapes stay review-only so Aspire never returns money based on the
    // wrong side of a no-show claim.
    if (resolutionCase.reason === 'no_show' && resolutionCase.against_user_id !== payment.payee_id) {
      return NextResponse.json({ error: 'This no-show case is not eligible for an automatic full refund. Review compensation manually.' }, { status: 409 });
    }

    const refundParams: Record<string, string> = {
      reason: 'requested_by_customer',
      'metadata[aspire_resolution_case_id]': caseId,
      'metadata[connection_id]': resolutionCase.connection_id,
      'metadata[aspire_payment_id]': payment.id
    };
    if (payment.stripe_payment_intent_id) refundParams.payment_intent = payment.stripe_payment_intent_id;
    else if (payment.stripe_charge_id) refundParams.charge = payment.stripe_charge_id;
    else return NextResponse.json({ error: 'Stripe payment identifiers are not ready for refund.' }, { status: 409 });

    const refund = await stripeFormRequest<StripeRefund>('/v1/refunds', refundParams, {
      idempotencyKey: `aspire_resolution_refund_${caseId}`
    });

    const now = new Date().toISOString();
    const amount = Number(refund.amount ?? payment.customer_total_cents ?? payment.gross_amount_cents ?? 0);
    await supabase.from('connection_payments').update({
      status: 'refunded',
      refunded_at: now,
      failure_reason: null,
      updated_at: now
    }).eq('id', payment.id).eq('status', 'secured');

    await supabase.from('connection_resolution_cases').update({
      status: 'resolved_refund',
      resolution_note: note || 'Full Aspire payment refunded after Resolution Center review.',
      refund_cents: amount,
      reviewed_by: user.id,
      reviewed_at: now,
      updated_at: now
    }).eq('id', caseId).in('status', ['submitted', 'under_review']);

    await supabase.from('connections').update({ status: 'cancelled', updated_at: now }).eq('id', resolutionCase.connection_id).in('status', ['confirmed', 'active']);

    if (resolutionCase.reason === 'no_show' && resolutionCase.against_user_id) {
      await supabase.from('connection_no_show_incidents').upsert({
        case_id: caseId,
        connection_id: resolutionCase.connection_id,
        user_id: resolutionCase.against_user_id,
        confirmed_by: user.id,
        note: note || 'Confirmed no-show after Resolution Center review.'
      }, { onConflict: 'case_id' });
    }

    await supabase.from('connection_events').insert({
      connection_id: resolutionCase.connection_id,
      actor_id: user.id,
      event_type: 'issue_resolved',
      body: 'Aspire resolved the issue with a full refund. No provider payout will be released for this payment.',
      metadata: { case_id: caseId, status: 'resolved_refund', refund_id: refund.id, refund_cents: amount }
    });

    return NextResponse.json({ ok: true, status: 'resolved_refund', refundCents: amount });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
