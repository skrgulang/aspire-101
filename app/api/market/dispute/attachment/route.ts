import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAuthenticatedUser, getSupabaseServiceClient } from '../../../../../lib/server/aspireServer';
import {
  DISPUTE_EVIDENCE_BUCKET,
  DISPUTE_EVIDENCE_MAX_PER_USER,
  evidenceSignatureMatches,
  safeEvidenceFile
} from '../../../../../lib/server/marketDisputeProtection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const attachmentSelect = 'id,dispute_id,uploaded_by,file_name,mime_type,size_bytes,audience,created_at';

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function participantDisputes(userId: string, disputeIds: string[]) {
  const supabase = getSupabaseServiceClient();
  const { data: disputes, error } = await supabase
    .from('market_disputes')
    .select('id,status,market_order_id')
    .in('id', disputeIds);
  if (error) throw error;
  if (!disputes?.length) return [];
  const { data: orders, error: orderError } = await supabase
    .from('market_orders')
    .select('id,buyer_id,seller_id')
    .in('id', [...new Set(disputes.map((item) => item.market_order_id))]);
  if (orderError) throw orderError;
  const allowed = new Set((orders ?? [])
    .filter((order) => order.buyer_id === userId || order.seller_id === userId)
    .map((order) => order.id));
  return disputes.filter((item) => allowed.has(item.market_order_id));
}

function responseError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  if (message === 'DISPUTE_NOT_AVAILABLE') return NextResponse.json({ error: 'This dispute is unavailable.' }, { status: 404 });
  if (message === 'DISPUTE_CLOSED') return NextResponse.json({ error: 'Evidence can only be added while a case is open.' }, { status: 409 });
  if (message === 'EVIDENCE_LIMIT_REACHED') return NextResponse.json({ error: `Each participant can add up to ${DISPUTE_EVIDENCE_MAX_PER_USER} evidence files per case.` }, { status: 409 });
  if (message === 'EVIDENCE_FILE_TYPE_INVALID') return NextResponse.json({ error: 'Upload a JPG, PNG, WebP, or PDF file.' }, { status: 400 });
  if (message === 'EVIDENCE_FILE_SIZE_INVALID') return NextResponse.json({ error: 'Evidence files must be no larger than 8 MB.' }, { status: 400 });
  if (message === 'EVIDENCE_FILE_NAME_INVALID') return NextResponse.json({ error: 'Choose a valid evidence file.' }, { status: 400 });
  console.error('market dispute evidence error', error);
  return NextResponse.json({ error: 'Could not save this evidence file.' }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const raw = new URL(request.url).searchParams.get('disputeIds') || '';
    const disputeIds = [...new Set(raw.split(',').map((value) => value.trim()).filter(validUuid))].slice(0, 50);
    if (!disputeIds.length) return NextResponse.json({ attachments: [] });
    const allowed = await participantDisputes(user.id, disputeIds);
    const allowedIds = allowed.map((item) => item.id);
    if (!allowedIds.length) return NextResponse.json({ attachments: [] });
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from('market_dispute_attachments')
      .select(`${attachmentSelect},storage_path`)
      .in('dispute_id', allowedIds)
      .eq('audience', 'participants')
      .order('created_at', { ascending: true })
      .limit(400);
    if (error) throw error;
    const paths = (data ?? []).map((item) => item.storage_path);
    const signed = paths.length
      ? await supabase.storage.from(DISPUTE_EVIDENCE_BUCKET).createSignedUrls(paths, 600)
      : { data: [], error: null };
    if (signed.error) throw signed.error;
    const urlMap = new Map((signed.data ?? []).map((item) => [item.path, item.signedUrl]));
    return NextResponse.json({
      attachments: (data ?? []).map(({ storage_path, ...item }) => ({ ...item, url: urlMap.get(storage_path) || null }))
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || 'prepare');
    const disputeId = String(body.disputeId || '').trim();
    if (!validUuid(disputeId)) return NextResponse.json({ error: 'Valid dispute id required.' }, { status: 400 });
    const allowed = await participantDisputes(user.id, [disputeId]);
    const dispute = allowed[0];
    if (!dispute) throw new Error('DISPUTE_NOT_AVAILABLE');
    if (!['open', 'under_review'].includes(dispute.status)) throw new Error('DISPUTE_CLOSED');
    const supabase = getSupabaseServiceClient();

    if (action === 'prepare') {
      const file = safeEvidenceFile({
        fileName: body.fileName,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes
      });
      const { count, error: countError } = await supabase
        .from('market_dispute_attachments')
        .select('id', { count: 'exact', head: true })
        .eq('dispute_id', disputeId)
        .eq('uploaded_by', user.id);
      if (countError) throw countError;
      if ((count ?? 0) >= DISPUTE_EVIDENCE_MAX_PER_USER) throw new Error('EVIDENCE_LIMIT_REACHED');
      const folder = `${disputeId}/${user.id}`;
      const { data: existingObjects, error: listError } = await supabase.storage.from(DISPUTE_EVIDENCE_BUCKET).list(folder, { limit: DISPUTE_EVIDENCE_MAX_PER_USER + 1 });
      if (listError) throw listError;
      if ((existingObjects?.length ?? 0) >= DISPUTE_EVIDENCE_MAX_PER_USER) throw new Error('EVIDENCE_LIMIT_REACHED');
      const path = `${disputeId}/${user.id}/${randomUUID()}.${file.extension}`;
      const { data, error } = await supabase.storage.from(DISPUTE_EVIDENCE_BUCKET).createSignedUploadUrl(path);
      if (error) throw error;
      return NextResponse.json({ path, token: data.token, signedUrl: data.signedUrl, file }, { status: 201 });
    }

    if (action !== 'finalize') return NextResponse.json({ error: 'Choose a valid evidence action.' }, { status: 400 });
    const file = safeEvidenceFile({
      fileName: body.fileName,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes
    });
    const path = String(body.path || '').trim();
    const expectedPrefix = `${disputeId}/${user.id}/`;
    if (!path.startsWith(expectedPrefix) || path.includes('..')) return NextResponse.json({ error: 'Evidence path is invalid.' }, { status: 400 });
    const folder = `${disputeId}/${user.id}`;
    const objectName = path.slice(folder.length + 1);
    const { data: objects, error: listError } = await supabase.storage.from(DISPUTE_EVIDENCE_BUCKET).list(folder, { search: objectName, limit: 2 });
    if (listError) throw listError;
    const object = (objects ?? []).find((item) => item.name === objectName);
    const storedSize = Number(object?.metadata?.size ?? 0);
    const storedMime = String(object?.metadata?.mimetype || '').toLowerCase();
    if (!object || storedSize !== file.sizeBytes || storedMime !== file.mimeType) {
      await supabase.storage.from(DISPUTE_EVIDENCE_BUCKET).remove([path]);
      return NextResponse.json({ error: 'Uploaded evidence did not match the selected file.' }, { status: 409 });
    }
    const { data: stored, error: downloadError } = await supabase.storage.from(DISPUTE_EVIDENCE_BUCKET).download(path);
    if (downloadError) throw downloadError;
    const signature = new Uint8Array((await stored.slice(0, 16).arrayBuffer()));
    if (!evidenceSignatureMatches(file.mimeType, signature)) {
      await supabase.storage.from(DISPUTE_EVIDENCE_BUCKET).remove([path]);
      return NextResponse.json({ error: 'The selected file contents do not match its file type.' }, { status: 409 });
    }
    const { data: saved, error } = await supabase
      .from('market_dispute_attachments')
      .insert({
        dispute_id: disputeId,
        uploaded_by: user.id,
        storage_path: path,
        file_name: file.fileName,
        mime_type: file.mimeType,
        size_bytes: file.sizeBytes,
        audience: 'participants'
      })
      .select(`${attachmentSelect},storage_path`)
      .single();
    if (error) throw error;
    const { data: signed, error: signedError } = await supabase.storage.from(DISPUTE_EVIDENCE_BUCKET).createSignedUrl(path, 600);
    if (signedError) throw signedError;
    const { storage_path, ...attachment } = saved;
    return NextResponse.json({ attachment: { ...attachment, url: signed.signedUrl } }, { status: 201 });
  } catch (error) {
    return responseError(error);
  }
}
