import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  getAuthenticatedUser,
  getSupabaseServiceClient,
  requireAal2,
  stripeFileUpload,
  stripeFormRequest
} from '../../../../../lib/server/aspireServer';
import { DISPUTE_EVIDENCE_BUCKET } from '../../../../../lib/server/marketDisputeProtection';

export const runtime = 'nodejs';

type StripeFile = { id: string };
type StripeDispute = { id: string; status?: string | null; evidence_details?: { due_by?: number | null } | null };

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedUser(request);
    await requireAal2(auth.accessToken);
    const supabase = getSupabaseServiceClient();
    const { data: role, error: roleError } = await supabase.from('user_roles').select('role').eq('user_id', auth.user.id).maybeSingle();
    if (roleError) throw roleError;
    if (role?.role !== 'admin') throw new Error('ADMIN_REQUIRED');

    const body = await request.json().catch(() => ({})) as { disputeId?: string; statement?: string; attachmentId?: string | null; submit?: boolean };
    const disputeId = String(body.disputeId || '').trim();
    const statement = String(body.statement || '').trim();
    const attachmentId = String(body.attachmentId || '').trim();
    const submit = body.submit === true;
    if (!validUuid(disputeId)) return NextResponse.json({ error: 'Valid dispute id required.' }, { status: 400 });
    if (statement.length < 20 || statement.length > 5000) {
      return NextResponse.json({ error: 'Stripe evidence statement must be between 20 and 5,000 characters.' }, { status: 400 });
    }

    const { data: dispute, error: disputeError } = await supabase
      .from('market_disputes')
      .select('id,market_order_id,source,stripe_case_id,status,evidence')
      .eq('id', disputeId)
      .maybeSingle();
    if (disputeError) throw disputeError;
    const stripeDisputeId = String(dispute?.stripe_case_id || '').replace(/^stripe_dispute:/, '');
    if (!dispute || dispute.source !== 'stripe_dispute' || !/^dp_[A-Za-z0-9]+$/.test(stripeDisputeId)) {
      return NextResponse.json({ error: 'This case is not an actionable Stripe card dispute.' }, { status: 409 });
    }
    if (!['open', 'under_review'].includes(dispute.status)) {
      return NextResponse.json({ error: 'This dispute is already closed.' }, { status: 409 });
    }

    let stripeFileId: string | null = null;
    if (attachmentId) {
      if (!validUuid(attachmentId)) return NextResponse.json({ error: 'Choose a valid evidence attachment.' }, { status: 400 });
      const { data: attachment, error: attachmentError } = await supabase
        .from('market_dispute_attachments')
        .select('id,dispute_id,storage_path,file_name,mime_type,size_bytes')
        .eq('id', attachmentId)
        .eq('dispute_id', disputeId)
        .maybeSingle();
      if (attachmentError) throw attachmentError;
      if (!attachment) return NextResponse.json({ error: 'Evidence attachment not found.' }, { status: 404 });
      if (attachment.size_bytes > 5 * 1024 * 1024 || attachment.mime_type === 'image/webp') {
        return NextResponse.json({ error: 'For Stripe, choose a JPG, PNG, or PDF no larger than 5 MB.' }, { status: 400 });
      }
      const { data: stored, error: downloadError } = await supabase.storage.from(DISPUTE_EVIDENCE_BUCKET).download(attachment.storage_path);
      if (downloadError) throw downloadError;
      const uploaded = await stripeFileUpload<StripeFile>(stored, attachment.file_name);
      stripeFileId = uploaded.id;
    }

    const params: Record<string, string> = {
      'evidence[uncategorized_text]': statement,
      submit: submit ? 'true' : 'false'
    };
    if (stripeFileId) params['evidence[uncategorized_file]'] = stripeFileId;
    const evidenceHash = createHash('sha256').update(`${statement}\n${attachmentId}\n${submit}`).digest('hex').slice(0, 32);
    const stripeDispute = await stripeFormRequest<StripeDispute>(
      `/v1/disputes/${encodeURIComponent(stripeDisputeId)}`,
      params,
      { idempotencyKey: `aspire_dispute_evidence_${disputeId}_${evidenceHash}` }
    );

    const now = new Date().toISOString();
    const existingEvidence = Array.isArray(dispute.evidence) ? dispute.evidence : [];
    const auditEvidence = existingEvidence.concat({
      source: 'aspire_admin',
      action: submit ? 'submitted_to_stripe' : 'saved_to_stripe',
      actor_id: auth.user.id,
      stripe_file_id: stripeFileId,
      created_at: now
    });
    const dueBy = stripeDispute.evidence_details?.due_by
      ? new Date(stripeDispute.evidence_details.due_by * 1000).toISOString()
      : undefined;
    const { error: updateError } = await supabase.from('market_disputes').update({
      evidence: auditEvidence,
      stripe_status: stripeDispute.status || 'under_review',
      ...(dueBy ? { evidence_due_by: dueBy } : {}),
      assigned_to: auth.user.id,
      reviewed_by: auth.user.id,
      review_started_at: now,
      last_staff_response_at: now,
      next_action_due_at: submit ? null : new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      updated_at: now
    }).eq('id', disputeId);
    if (updateError) throw updateError;
    const { error: logError } = await supabase.from('market_dispute_messages').insert({
      dispute_id: disputeId,
      author_id: auth.user.id,
      audience: 'staff',
      message_type: 'internal_note',
      body: `${submit ? 'Submitted' : 'Saved'} evidence ${stripeFileId ? 'with one attachment ' : ''}to Stripe. Statement: ${statement}`.slice(0, 2000)
    });
    if (logError) throw logError;

    return NextResponse.json({ ok: true, submitted: submit, stripeStatus: stripeDispute.status || null, attachmentIncluded: Boolean(stripeFileId) });
  } catch (error) {
    const raw = error instanceof Error ? error.message : '';
    if (raw === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });
    if (raw === 'MFA_REQUIRED') return NextResponse.json({ error: 'Complete two-step verification before handling Stripe evidence.', code: 'MFA_REQUIRED' }, { status: 403 });
    if (raw === 'ADMIN_REQUIRED') return NextResponse.json({ error: 'Admin access is required.' }, { status: 403 });
    if (/STRIPE:/i.test(raw)) return NextResponse.json({ error: raw.replace(/^STRIPE:/, '') }, { status: 502 });
    console.error('Stripe dispute evidence error', error);
    return NextResponse.json({ error: 'Could not save this evidence package to Stripe.' }, { status: 500 });
  }
}
