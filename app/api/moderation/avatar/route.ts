import { NextResponse } from 'next/server';
import { getAuthenticatedUser, getSupabaseServiceClient, requireEnv } from '../../../../lib/server/aspireServer';

export const runtime = 'nodejs';

const moderationModel = 'omni-moderation-latest';
const signedSeconds = 10 * 60;
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

type ModerationResult = {
  flagged?: boolean;
  categories?: Record<string, boolean>;
  category_scores?: Record<string, number>;
};

type ModerationPayload = {
  model?: string;
  results?: ModerationResult[];
  error?: { message?: string };
};

function extensionForMime(mimeType: string) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

function assess(result: ModerationResult) {
  const scores = result.category_scores ?? {};
  const maxScore = Object.values(scores).reduce((max, value) => Number.isFinite(value) ? Math.max(max, Number(value)) : max, 0);
  const riskScore = Math.round(Math.min(1, maxScore) * 100);
  const flagged = Boolean(result.flagged);
  const needsHuman = flagged || maxScore >= 0.25;
  const riskLevel: 'low' | 'medium' | 'high' = flagged ? 'high' : maxScore >= 0.25 ? 'medium' : 'low';
  const flaggedCategories = Object.entries(result.categories ?? {}).filter(([, value]) => value).map(([key]) => key);
  const summary = needsHuman
    ? `Aspire Safety Intelligence found ${flaggedCategories.length ? flaggedCategories.join(', ') : 'an elevated image-safety signal'}. The photo stays private until a human reviews it.`
    : 'Aspire Safety Intelligence found no elevated image-safety signals. The profile photo can be published.';
  return { flagged, needsHuman, riskLevel, riskScore, summary };
}

async function callModeration(imageUrl: string) {
  const apiKey = requireEnv('OPENAI_API_KEY');
  const response = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: moderationModel,
      input: [
        { type: 'text', text: 'Profile photo submitted to Aspire 101 for safety moderation.' },
        { type: 'image_url', image_url: { url: imageUrl } }
      ]
    }),
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({})) as ModerationPayload;
  if (!response.ok) throw new Error(`OPENAI_MODERATION:${payload.error?.message || `HTTP ${response.status}`}`);
  const result = payload.results?.[0];
  if (!result) throw new Error('OPENAI_MODERATION:No moderation result returned.');
  return { payload, result };
}

async function publishApprovedAvatar(
  userId: string,
  reviewId: string,
  storagePath: string,
  mimeType: string,
  summary: string,
  supabase: ReturnType<typeof getSupabaseServiceClient>
) {
  const { data: downloaded, error: downloadError } = await supabase.storage.from('avatar-review').download(storagePath);
  if (downloadError || !downloaded) throw downloadError || new Error('Could not read the staged profile photo.');

  const bytes = new Uint8Array(await downloaded.arrayBuffer());
  const approvedPath = `${userId}/avatar-${Date.now()}.${extensionForMime(mimeType)}`;
  const { error: uploadError } = await supabase.storage.from('avatars').upload(approvedPath, bytes, {
    upsert: false,
    contentType: mimeType,
    cacheControl: '3600'
  });
  if (uploadError) throw uploadError;

  const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(approvedPath);
  const publicUrl = publicData.publicUrl;
  const now = new Date().toISOString();

  const { error: profileError } = await supabase.from('profiles').update({
    avatar_url: publicUrl,
    image_url: publicUrl,
    avatar_moderation_status: 'approved',
    avatar_pending_path: null,
    avatar_moderation_review_id: reviewId,
    avatar_moderation_summary: summary,
    avatar_moderation_updated_at: now
  }).eq('id', userId);
  if (profileError) throw profileError;

  await supabase.from('avatar_moderation_reviews').update({
    status: 'approved',
    approved_avatar_url: publicUrl,
    ai_summary: summary,
    reviewed_at: now,
    updated_at: now
  }).eq('id', reviewId);

  await supabase.storage.from('avatar-review').remove([storagePath]);
  return publicUrl;
}

export async function POST(request: Request) {
  const supabase = getSupabaseServiceClient();
  let reviewId = '';
  let storagePath = '';

  try {
    const { user } = await getAuthenticatedUser(request);
    const body = await request.json().catch(() => ({})) as { storagePath?: string; mimeType?: string };
    storagePath = String(body.storagePath || '').trim();
    const mimeType = String(body.mimeType || '').trim().toLowerCase();

    if (!storagePath || storagePath.includes('..') || storagePath.split('/')[0] !== user.id) {
      return NextResponse.json({ error: 'That staged profile photo is not available to this account.' }, { status: 403 });
    }
    if (!allowedMimeTypes.has(mimeType)) {
      return NextResponse.json({ error: 'Profile photo moderation currently supports JPG, PNG, or WebP.' }, { status: 400 });
    }

    const { data: previous } = await supabase
      .from('avatar_moderation_reviews')
      .select('id,storage_path')
      .eq('user_id', user.id)
      .in('status', ['scanning', 'review']);
    if (previous?.length) {
      await supabase.from('avatar_moderation_reviews').update({ status: 'superseded', updated_at: new Date().toISOString() }).in('id', previous.map((item) => item.id));
      const oldPaths = previous.map((item) => item.storage_path).filter((path) => path && path !== storagePath);
      if (oldPaths.length) await supabase.storage.from('avatar-review').remove(oldPaths);
    }

    const { data: review, error: reviewError } = await supabase.from('avatar_moderation_reviews').insert({
      user_id: user.id,
      storage_path: storagePath,
      mime_type: mimeType,
      status: 'scanning',
      provider: 'openai',
      risk_level: 'unknown',
      ai_summary: 'Aspire Safety Intelligence is checking this profile photo.'
    }).select('id').single();
    if (reviewError || !review) throw reviewError || new Error('Could not create the profile photo review.');
    reviewId = review.id;

    await supabase.from('profiles').update({
      avatar_moderation_status: 'scanning',
      avatar_pending_path: storagePath,
      avatar_moderation_review_id: reviewId,
      avatar_moderation_summary: 'Aspire Safety Intelligence is checking this profile photo.',
      avatar_moderation_updated_at: new Date().toISOString()
    }).eq('id', user.id);

    const { data: signed, error: signedError } = await supabase.storage.from('avatar-review').createSignedUrl(storagePath, signedSeconds);
    if (signedError || !signed?.signedUrl) throw signedError || new Error('Could not prepare the profile photo for moderation.');

    let moderation: Awaited<ReturnType<typeof callModeration>>;
    try {
      moderation = await callModeration(signed.signedUrl);
    } catch (error) {
      const raw = error instanceof Error ? error.message : 'AI moderation unavailable';
      const summary = raw.startsWith('MISSING_ENV:OPENAI_API_KEY')
        ? 'Automated profile-photo review is temporarily unavailable. Your photo remains private for human review.'
        : 'Automated profile-photo review could not finish. Your photo remains private for human review.';
      const now = new Date().toISOString();
      await supabase.from('avatar_moderation_reviews').update({ status: 'review', risk_level: 'unknown', ai_summary: summary, updated_at: now }).eq('id', reviewId);
      await supabase.from('profiles').update({ avatar_moderation_status: 'review', avatar_moderation_summary: summary, avatar_moderation_updated_at: now }).eq('id', user.id);
      return NextResponse.json({ ok: true, status: 'review', reviewId, summary, aiAvailable: false });
    }

    const assessment = assess(moderation.result);
    const now = new Date().toISOString();
    await supabase.from('avatar_moderation_reviews').update({
      model: moderation.payload.model || moderationModel,
      model_flagged: assessment.flagged,
      risk_level: assessment.riskLevel,
      risk_score: assessment.riskScore,
      categories: moderation.result.categories ?? {},
      category_scores: moderation.result.category_scores ?? {},
      ai_summary: assessment.summary,
      status: assessment.needsHuman ? 'review' : 'scanning',
      updated_at: now
    }).eq('id', reviewId);

    if (assessment.needsHuman) {
      await supabase.from('profiles').update({
        avatar_moderation_status: 'review',
        avatar_moderation_summary: assessment.summary,
        avatar_moderation_updated_at: now
      }).eq('id', user.id);
      return NextResponse.json({
        ok: true,
        status: 'review',
        reviewId,
        riskLevel: assessment.riskLevel,
        riskScore: assessment.riskScore,
        summary: assessment.summary,
        aiAvailable: true
      });
    }

    const avatarUrl = await publishApprovedAvatar(user.id, reviewId, storagePath, mimeType, assessment.summary, supabase);
    return NextResponse.json({
      ok: true,
      status: 'approved',
      reviewId,
      avatarUrl,
      riskLevel: assessment.riskLevel,
      riskScore: assessment.riskScore,
      summary: assessment.summary,
      aiAvailable: true
    });
  } catch (error) {
    const summary = 'Profile photo review could not finish. Your current approved photo remains unchanged.';
    if (reviewId) {
      await supabase.from('avatar_moderation_reviews').update({ status: 'review', ai_summary: summary, updated_at: new Date().toISOString() }).eq('id', reviewId);
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : summary }, { status: 500 });
  }
}
