import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { enforceAiRateLimit, getAuthenticatedUser, getSupabaseServiceClient, requireEnv } from '../../../../lib/server/aspireServer';
import { classifyPublicPoliticalContent } from '../../../../lib/server/publicContentPolicy';

export const runtime = 'nodejs';

const moderationModel = 'omni-moderation-latest';
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxBytes = 5 * 1024 * 1024;

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

function extensionForMime(mime: string) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

function currentAvatarPath(publicUrl: string | null | undefined, userId: string) {
  if (!publicUrl) return null;
  try {
    const parsed = new URL(publicUrl);
    const prefix = '/storage/v1/object/public/avatars/';
    if (!parsed.pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(parsed.pathname.slice(prefix.length));
    return path.startsWith(`${userId}/`) ? path : null;
  } catch {
    return null;
  }
}

function harmfulRisk(result: ModerationResult) {
  const scores = result.category_scores ?? {};
  const severeKeys = new Set(['sexual/minors', 'hate/threatening', 'self-harm/instructions', 'self-harm/intent', 'violence/graphic', 'illicit/violent']);
  const severe = Object.entries(scores)
    .filter(([key]) => severeKeys.has(key))
    .reduce((max, [, score]) => Math.max(max, Number(score) || 0), 0);
  if (severe >= 0.5 || (result.flagged && severe >= 0.25)) return { level: 'critical', score: Math.max(95, Math.round(severe * 100)) };
  const maxScore = Object.values(scores).reduce((max, score) => Math.max(max, Number(score) || 0), 0);
  if (result.flagged || maxScore >= 0.7) return { level: 'high', score: Math.max(75, Math.round(maxScore * 100)) };
  if (maxScore >= 0.25) return { level: 'medium', score: Math.max(40, Math.round(maxScore * 100)) };
  return { level: 'low', score: Math.round(maxScore * 100) };
}

async function callOpenAiModeration(dataUrl: string) {
  const apiKey = requireEnv('OPENAI_API_KEY');
  const response = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: moderationModel,
      input: [{ type: 'image_url', image_url: { url: dataUrl } }]
    }),
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({})) as ModerationPayload;
  if (!response.ok) throw new Error(`OPENAI_MODERATION:${payload.error?.message || `HTTP ${response.status}`}`);
  const result = payload.results?.[0];
  if (!result) throw new Error('OPENAI_MODERATION:No moderation result returned.');
  return { payload, result };
}

export async function POST(request: Request) {
  const supabase = getSupabaseServiceClient();
  let userId = '';
  let reviewId = '';
  let privatePath = '';

  try {
    const auth = await getAuthenticatedUser(request);
    userId = auth.user.id;
    await enforceAiRateLimit(supabase, userId, 'moderation', 12);

    const form = await request.formData();
    const upload = form.get('avatar');
    if (!(upload instanceof File)) return NextResponse.json({ error: 'Choose a profile photo first.' }, { status: 400 });
    if (!allowedMimeTypes.has(upload.type)) {
      return NextResponse.json({ error: 'Use a JPG, PNG, or WebP profile photo.' }, { status: 400 });
    }
    if (upload.size <= 0 || upload.size > maxBytes) {
      return NextResponse.json({ error: 'Profile photos must be 5 MB or smaller.' }, { status: 400 });
    }

    const bytes = Buffer.from(await upload.arrayBuffer());
    const dataUrl = `data:${upload.type};base64,${bytes.toString('base64')}`;
    reviewId = randomUUID();
    privatePath = `${userId}/${reviewId}.${extensionForMime(upload.type)}`;

    const { error: pendingUploadError } = await supabase.storage
      .from('avatar-review')
      .upload(privatePath, bytes, { upsert: false, contentType: upload.type, cacheControl: '0' });
    if (pendingUploadError) throw pendingUploadError;

    const { error: reviewInsertError } = await supabase.from('avatar_moderation_reviews').insert({
      id: reviewId,
      user_id: userId,
      storage_path: privatePath,
      storage_bucket: 'avatar-review',
      mime_type: upload.type,
      status: 'scanning',
      provider: 'openai'
    });
    if (reviewInsertError) throw reviewInsertError;

    const { error: profileScanError } = await supabase.from('profiles').update({
      avatar_moderation_status: 'scanning',
      avatar_pending_path: privatePath,
      avatar_moderation_review_id: reviewId,
      avatar_moderation_summary: 'Aspire is checking this profile photo before it becomes public.',
      avatar_moderation_updated_at: new Date().toISOString()
    }).eq('id', userId);
    if (profileScanError) throw profileScanError;

    let moderation: Awaited<ReturnType<typeof callOpenAiModeration>>;
    let political: Awaited<ReturnType<typeof classifyPublicPoliticalContent>>;
    try {
      [moderation, political] = await Promise.all([
        callOpenAiModeration(dataUrl),
        classifyPublicPoliticalContent({ surface: 'avatar', imageUrls: [dataUrl] })
      ]);
    } catch (scanError) {
      const summary = 'Automated checks could not finish. Your current profile photo stays visible while this image waits for review.';
      await supabase.from('avatar_moderation_reviews').update({
        status: 'review',
        risk_level: 'unknown',
        ai_summary: summary,
        public_policy_decision: 'review',
        public_policy_reason_code: 'uncertain',
        public_policy_summary: summary,
        updated_at: new Date().toISOString()
      }).eq('id', reviewId);
      await supabase.from('profiles').update({
        avatar_moderation_status: 'review',
        avatar_moderation_summary: summary,
        avatar_moderation_updated_at: new Date().toISOString()
      }).eq('id', userId);
      return NextResponse.json({ ok: true, status: 'review', message: 'Photo sent for review. Your current photo stays visible.' }, { status: 202 });
    }

    const harmful = harmfulRisk(moderation.result);
    const harmfulBlocked = Boolean(moderation.result.flagged);
    const politicalBlocked = political.decision === 'block';
    const needsReview = !harmfulBlocked && political.decision === 'review';

    if (harmfulBlocked || politicalBlocked || needsReview) {
      const status = needsReview ? 'review' : 'rejected';
      const publicSummary = politicalBlocked
        ? 'Aspire public profile photos cannot feature political leaders, candidates, officeholders, party or campaign material, or partisan propaganda.'
        : needsReview
          ? 'This photo needs a quick human review before it can become public.'
          : 'This photo does not meet Aspire public profile safety rules.';

      await supabase.from('avatar_moderation_reviews').update({
        status,
        model: moderation.payload.model || moderationModel,
        model_flagged: Boolean(moderation.result.flagged),
        risk_level: harmfulBlocked ? harmful.level : politicalBlocked ? 'medium' : harmful.level,
        risk_score: harmfulBlocked ? harmful.score : politicalBlocked ? Math.max(50, harmful.score) : harmful.score,
        categories: moderation.result.categories ?? {},
        category_scores: moderation.result.category_scores ?? {},
        ai_summary: publicSummary,
        public_policy_decision: political.decision,
        public_policy_reason_code: political.reasonCode,
        public_policy_summary: political.summary,
        public_policy_model: political.model,
        updated_at: new Date().toISOString()
      }).eq('id', reviewId);

      await supabase.from('profiles').update({
        avatar_moderation_status: status,
        avatar_moderation_summary: publicSummary,
        avatar_moderation_updated_at: new Date().toISOString()
      }).eq('id', userId);

      return NextResponse.json({
        ok: true,
        status,
        message: needsReview ? 'Photo sent for review. Your current photo stays visible.' : publicSummary
      }, { status: needsReview ? 202 : 200 });
    }

    const { data: profileRow } = await supabase.from('profiles').select('avatar_url').eq('id', userId).maybeSingle();
    const previousPath = currentAvatarPath(profileRow?.avatar_url, userId);
    const publicPath = `${userId}/avatar-${reviewId}.${extensionForMime(upload.type)}`;
    const { error: publicUploadError } = await supabase.storage
      .from('avatars')
      .upload(publicPath, bytes, { upsert: false, contentType: upload.type, cacheControl: '3600' });
    if (publicUploadError) throw publicUploadError;
    const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(publicPath);
    const publicUrl = publicData.publicUrl;

    const { error: profileApproveError } = await supabase.from('profiles').update({
      avatar_url: publicUrl,
      image_url: publicUrl,
      avatar_moderation_status: 'approved',
      avatar_pending_path: null,
      avatar_moderation_review_id: reviewId,
      avatar_moderation_summary: 'Profile photo approved by automated public-content checks.',
      avatar_moderation_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq('id', userId);
    if (profileApproveError) {
      await supabase.storage.from('avatars').remove([publicPath]).catch(() => undefined);
      throw profileApproveError;
    }

    await supabase.from('avatar_moderation_reviews').update({
      storage_path: publicPath,
      storage_bucket: 'avatars',
      status: 'approved',
      model: moderation.payload.model || moderationModel,
      model_flagged: false,
      risk_level: harmful.level,
      risk_score: harmful.score,
      categories: moderation.result.categories ?? {},
      category_scores: moderation.result.category_scores ?? {},
      ai_summary: 'Profile photo approved by automated public-content checks.',
      public_policy_decision: political.decision,
      public_policy_reason_code: political.reasonCode,
      public_policy_summary: political.summary,
      public_policy_model: political.model,
      approved_avatar_url: publicUrl,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq('id', reviewId);

    await supabase.storage.from('avatar-review').remove([privatePath]).catch(() => undefined);
    if (previousPath && previousPath !== publicPath) {
      await supabase.storage.from('avatars').remove([previousPath]).catch(() => undefined);
    }

    return NextResponse.json({ ok: true, status: 'approved', avatarUrl: publicUrl, message: 'Profile photo updated.' });
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'UNKNOWN';
    if (privatePath && reviewId) {
      try {
        await supabase.from('avatar_moderation_reviews').update({
          status: 'review',
          risk_level: 'unknown',
          ai_summary: 'The photo could not be processed automatically and is waiting for review.',
          updated_at: new Date().toISOString()
        }).eq('id', reviewId);
        if (userId) {
          await supabase.from('profiles').update({
            avatar_moderation_status: 'review',
            avatar_moderation_summary: 'The photo could not be processed automatically and is waiting for review.',
            avatar_moderation_updated_at: new Date().toISOString()
          }).eq('id', userId);
        }
      } catch {
        // Fail closed: the previous public avatar remains unchanged.
      }
    }
    if (raw === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Sign in again before changing your photo.' }, { status: 401 });
    if (raw === 'AI_RATE_LIMIT') return NextResponse.json({ error: 'Too many photo checks. Try again later.' }, { status: 429 });
    if (raw.startsWith('MISSING_ENV:OPENAI_API_KEY')) return NextResponse.json({ error: 'Photo review is temporarily unavailable. Your current photo is unchanged.' }, { status: 503 });
    return NextResponse.json({ error: 'Could not process this profile photo. Your current photo is unchanged.' }, { status: 500 });
  }
}
