import { NextResponse } from 'next/server';
import { getAuthenticatedUser, getSupabaseServiceClient } from '../../../../../lib/server/aspireServer';

export const runtime = 'nodejs';

function extensionForMime(mimeType: string) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

async function requireModerator(userId: string, supabase: ReturnType<typeof getSupabaseServiceClient>) {
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle();
  if (data?.role !== 'moderator' && data?.role !== 'admin') throw new Error('MODERATOR_REQUIRED');
}

async function publishAvatar(userId: string, reviewId: string, storagePath: string, mimeType: string, supabase: ReturnType<typeof getSupabaseServiceClient>) {
  const { data: profile } = await supabase.from('profiles').select('avatar_moderation_review_id').eq('id', userId).maybeSingle();
  if (profile?.avatar_moderation_review_id !== reviewId) throw new Error('REVIEW_SUPERSEDED');

  const { data: downloaded, error: downloadError } = await supabase.storage.from('avatar-review').download(storagePath);
  if (downloadError || !downloaded) throw downloadError || new Error('Could not read staged avatar.');
  const bytes = new Uint8Array(await downloaded.arrayBuffer());
  const approvedPath = `${userId}/avatar-${Date.now()}.${extensionForMime(mimeType)}`;
  const { error: uploadError } = await supabase.storage.from('avatars').upload(approvedPath, bytes, {
    upsert: false,
    contentType: mimeType,
    cacheControl: '3600'
  });
  if (uploadError) throw uploadError;
  const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(approvedPath);
  return publicData.publicUrl;
}

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const supabase = getSupabaseServiceClient();
    await requireModerator(user.id, supabase);

    const body = await request.json().catch(() => ({})) as { reviewId?: string; decision?: 'approved' | 'rejected'; note?: string };
    const reviewId = String(body.reviewId || '').trim();
    const decision = body.decision;
    const note = String(body.note || '').trim();
    if (!reviewId || !['approved', 'rejected'].includes(String(decision))) {
      return NextResponse.json({ error: 'Review id and decision are required.' }, { status: 400 });
    }

    const { data: review, error } = await supabase
      .from('avatar_moderation_reviews')
      .select('id,user_id,storage_path,mime_type,status')
      .eq('id', reviewId)
      .maybeSingle();
    if (error) throw error;
    if (!review) return NextResponse.json({ error: 'Avatar review not found.' }, { status: 404 });
    if (!['review', 'scanning'].includes(review.status)) return NextResponse.json({ error: 'This avatar review is already closed.' }, { status: 409 });

    const now = new Date().toISOString();
    if (decision === 'approved') {
      const avatarUrl = await publishAvatar(review.user_id, review.id, review.storage_path, review.mime_type, supabase);
      const { error: profileError } = await supabase.from('profiles').update({
        avatar_url: avatarUrl,
        image_url: avatarUrl,
        avatar_moderation_status: 'approved',
        avatar_pending_path: null,
        avatar_moderation_review_id: review.id,
        avatar_moderation_summary: note || 'Profile photo approved after human safety review.',
        avatar_moderation_updated_at: now
      }).eq('id', review.user_id).eq('avatar_moderation_review_id', review.id);
      if (profileError) throw profileError;

      await supabase.from('avatar_moderation_reviews').update({
        status: 'approved',
        moderator_note: note || null,
        reviewed_by: user.id,
        reviewed_at: now,
        approved_avatar_url: avatarUrl,
        updated_at: now
      }).eq('id', review.id);
      await supabase.storage.from('avatar-review').remove([review.storage_path]);
      return NextResponse.json({ ok: true, status: 'approved', avatarUrl });
    }

    await supabase.from('avatar_moderation_reviews').update({
      status: 'rejected',
      moderator_note: note || 'Does not meet Aspire profile-photo guidelines.',
      reviewed_by: user.id,
      reviewed_at: now,
      updated_at: now
    }).eq('id', review.id);
    await supabase.from('profiles').update({
      avatar_moderation_status: 'rejected',
      avatar_pending_path: null,
      avatar_moderation_summary: note || 'This profile photo was not approved.',
      avatar_moderation_updated_at: now
    }).eq('id', review.user_id).eq('avatar_moderation_review_id', review.id);
    await supabase.storage.from('avatar-review').remove([review.storage_path]);
    return NextResponse.json({ ok: true, status: 'rejected' });
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'UNKNOWN';
    if (raw === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });
    if (raw === 'MODERATOR_REQUIRED') return NextResponse.json({ error: 'Moderator access required.' }, { status: 403 });
    if (raw === 'REVIEW_SUPERSEDED') return NextResponse.json({ error: 'This photo was replaced by a newer submission.' }, { status: 409 });
    return NextResponse.json({ error: raw }, { status: 500 });
  }
}
