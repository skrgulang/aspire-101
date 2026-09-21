import { NextResponse } from 'next/server';
import { getAuthenticatedUser, getSupabaseServiceClient, requireAal2 } from '../../../../lib/server/aspireServer';

export const runtime = 'nodejs';

async function requireStaff(request: Request) {
  const auth = await getAuthenticatedUser(request);
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', auth.user.id).maybeSingle();
  if (error) throw error;
  if (data?.role !== 'moderator' && data?.role !== 'admin') throw new Error('STAFF_REQUIRED');
  await requireAal2(auth.accessToken);
  return { auth, supabase };
}

function extensionForMime(mime: string) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

export async function GET(request: Request) {
  try {
    const { supabase } = await requireStaff(request);
    const { data: reviews, error } = await supabase
      .from('avatar_moderation_reviews')
      .select('id,user_id,storage_path,storage_bucket,mime_type,status,risk_level,risk_score,ai_summary,public_policy_decision,public_policy_reason_code,public_policy_summary,created_at,updated_at')
      .in('status', ['review', 'rejected'])
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    const userIds = [...new Set((reviews ?? []).map((item) => item.user_id))];
    const { data: profiles } = userIds.length
      ? await supabase.from('profiles').select('id,display_name,full_name,name,school').in('id', userIds)
      : { data: [] as Array<{ id: string; display_name?: string | null; full_name?: string | null; name?: string | null; school?: string | null }> };
    const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

    const items = await Promise.all((reviews ?? []).map(async (item) => {
      let signedUrl: string | null = null;
      if (item.storage_bucket === 'avatar-review') {
        const { data } = await supabase.storage.from('avatar-review').createSignedUrl(item.storage_path, 10 * 60);
        signedUrl = data?.signedUrl || null;
      } else if (item.storage_bucket === 'avatars') {
        signedUrl = supabase.storage.from('avatars').getPublicUrl(item.storage_path).data.publicUrl;
      }
      const profile = profileMap.get(item.user_id);
      return {
        ...item,
        signed_url: signedUrl,
        display_name: profile?.display_name || profile?.full_name || profile?.name || 'Student',
        school: profile?.school || null
      };
    }));

    return NextResponse.json({ ok: true, items });
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'UNKNOWN';
    if (raw === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });
    if (raw === 'MFA_REQUIRED') return NextResponse.json({ error: 'Complete two-step verification to review profile photos.', code: 'MFA_REQUIRED' }, { status: 403 });
    if (raw === 'STAFF_REQUIRED') return NextResponse.json({ error: 'Moderator access required.' }, { status: 403 });
    return NextResponse.json({ error: 'Could not load profile photo reviews.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { auth, supabase } = await requireStaff(request);
    const body = await request.json().catch(() => ({})) as { reviewId?: string; decision?: 'approved' | 'rejected'; note?: string };
    const reviewId = String(body.reviewId || '').trim();
    const decision = body.decision;
    const note = String(body.note || '').trim().slice(0, 800);
    if (!reviewId || !['approved', 'rejected'].includes(String(decision))) {
      return NextResponse.json({ error: 'Review id and decision are required.' }, { status: 400 });
    }

    const { data: review, error: reviewError } = await supabase
      .from('avatar_moderation_reviews')
      .select('id,user_id,storage_path,storage_bucket,mime_type,status')
      .eq('id', reviewId)
      .maybeSingle();
    if (reviewError) throw reviewError;
    if (!review) return NextResponse.json({ error: 'Photo review not found.' }, { status: 404 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('avatar_moderation_review_id,avatar_url')
      .eq('id', review.user_id)
      .maybeSingle();
    if (profile?.avatar_moderation_review_id !== reviewId) {
      await supabase.from('avatar_moderation_reviews').update({
        status: 'superseded',
        moderator_note: note || 'Superseded by a newer profile photo submission.',
        reviewed_by: auth.user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq('id', reviewId);
      return NextResponse.json({ error: 'A newer profile photo has already replaced this review.', code: 'SUPERSEDED' }, { status: 409 });
    }

    if (decision === 'rejected') {
      await supabase.from('avatar_moderation_reviews').update({
        status: 'rejected',
        moderator_note: note || 'Rejected after human review.',
        reviewed_by: auth.user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq('id', reviewId);
      await supabase.from('profiles').update({
        avatar_moderation_status: 'rejected',
        avatar_pending_path: null,
        avatar_moderation_summary: 'Profile photo rejected after review. Your previous photo remains visible.',
        avatar_moderation_updated_at: new Date().toISOString()
      }).eq('id', review.user_id);
      if (review.storage_bucket === 'avatar-review') {
        await supabase.storage.from('avatar-review').remove([review.storage_path]).catch(() => undefined);
      }
      return NextResponse.json({ ok: true, status: 'rejected' });
    }

    if (review.storage_bucket !== 'avatar-review') {
      return NextResponse.json({ error: 'This photo is no longer available for approval.' }, { status: 409 });
    }
    const { data: blob, error: downloadError } = await supabase.storage.from('avatar-review').download(review.storage_path);
    if (downloadError || !blob) throw downloadError || new Error('AVATAR_FILE_MISSING');
    const bytes = Buffer.from(await blob.arrayBuffer());
    const publicPath = `${review.user_id}/avatar-${reviewId}.${extensionForMime(review.mime_type)}`;
    const { error: uploadError } = await supabase.storage.from('avatars').upload(publicPath, bytes, {
      upsert: false,
      contentType: review.mime_type,
      cacheControl: '3600'
    });
    if (uploadError) throw uploadError;
    const publicUrl = supabase.storage.from('avatars').getPublicUrl(publicPath).data.publicUrl;

    await supabase.from('profiles').update({
      avatar_url: publicUrl,
      image_url: publicUrl,
      avatar_moderation_status: 'approved',
      avatar_pending_path: null,
      avatar_moderation_summary: 'Profile photo approved after human review.',
      avatar_moderation_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq('id', review.user_id).eq('avatar_moderation_review_id', reviewId);

    await supabase.from('avatar_moderation_reviews').update({
      status: 'approved',
      storage_path: publicPath,
      storage_bucket: 'avatars',
      approved_avatar_url: publicUrl,
      moderator_note: note || 'Approved after human review.',
      reviewed_by: auth.user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq('id', reviewId);

    await supabase.storage.from('avatar-review').remove([review.storage_path]).catch(() => undefined);
    return NextResponse.json({ ok: true, status: 'approved', avatarUrl: publicUrl });
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'UNKNOWN';
    if (raw === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });
    if (raw === 'MFA_REQUIRED') return NextResponse.json({ error: 'Complete two-step verification to review profile photos.', code: 'MFA_REQUIRED' }, { status: 403 });
    if (raw === 'STAFF_REQUIRED') return NextResponse.json({ error: 'Moderator access required.' }, { status: 403 });
    return NextResponse.json({ error: 'Could not save this profile photo review.' }, { status: 500 });
  }
}
