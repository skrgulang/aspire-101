import { NextResponse } from 'next/server';
import { enforceAiRateLimit, getAuthenticatedUser, getSupabaseServiceClient, requireEnv } from '../../../../lib/server/aspireServer';

export const runtime = 'nodejs';

const moderationModel = 'omni-moderation-latest';
const visionModel = process.env.ASPIRE_AI_MODEL || 'gpt-5.6-terra';
const signedSeconds = 10 * 60;
const allowedMimeTypes = new Set(['image/jpeg','image/png','image/webp']);

type ModerationPayload = {
  model?: string;
  results?: Array<{
    flagged?: boolean;
    categories?: Record<string, boolean>;
    category_scores?: Record<string, number>;
  }>;
  error?: { message?: string };
};

type PolicyDecision = {
  classification: 'allowed' | 'political' | 'uncertain';
  political_person_primary_subject: boolean;
  campaign_or_party_material: boolean;
  summary: string;
};

type ResponsesPayload = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  error?: { message?: string };
};

function outputText(payload: ResponsesPayload) {
  if (payload.output_text) return payload.output_text;
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) return content.text;
    }
  }
  return '';
}

function extensionFor(mime: string) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

function harmfulBlock(result: NonNullable<ModerationPayload['results']>[number]) {
  const categories = result.categories || {};
  const scores = result.category_scores || {};
  const hard = ['sexual/minors','violence/graphic','self-harm/instructions','self-harm/intent','hate/threatening','illicit/violent'];
  if (hard.some((key) => categories[key])) return true;
  if (hard.some((key) => Number(scores[key] || 0) >= 0.35)) return true;
  if (categories.sexual || Number(scores.sexual || 0) >= 0.55) return true;
  return Boolean(result.flagged);
}

async function scanHarmful(imageUrl: string) {
  const apiKey = requireEnv('OPENAI_API_KEY');
  const response = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: moderationModel,
      input: [{ type: 'image_url', image_url: { url: imageUrl } }]
    }),
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({})) as ModerationPayload;
  if (!response.ok) throw new Error(`OPENAI_MODERATION:${payload.error?.message || response.status}`);
  const result = payload.results?.[0];
  if (!result) throw new Error('OPENAI_MODERATION:No moderation result.');
  return { payload, result };
}

const policySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['classification','political_person_primary_subject','campaign_or_party_material','summary'],
  properties: {
    classification: { type: 'string', enum: ['allowed','political','uncertain'] },
    political_person_primary_subject: { type: 'boolean' },
    campaign_or_party_material: { type: 'boolean' },
    summary: { type: 'string', maxLength: 240 }
  }
};

async function scanAspirePolicy(imageUrl: string): Promise<PolicyDecision> {
  const apiKey = requireEnv('OPENAI_API_KEY');
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: visionModel,
      store: false,
      max_output_tokens: 220,
      instructions: `You are a narrow content-policy classifier for Aspire 101 profile photos. Do not identify or name any real person. Apply the same rule regardless of country, party, ideology, viewpoint, or whether the image supports or criticizes the subject. A profile photo is POLITICAL when its primary subject is a political candidate, elected official, head of state/government, party leader, or when it primarily displays campaign/party propaganda, campaign logos, campaign slogans, or political recruitment material. Incidental civic context that is not the main subject is not enough. If you cannot confidently decide, return UNCERTAIN. This is a content-category classification only; never evaluate the merits of any political position.`,
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: 'Classify this proposed Aspire 101 profile photo under the policy.' },
          { type: 'input_image', image_url: imageUrl }
        ]
      }],
      text: { format: { type: 'json_schema', name: 'avatar_policy', strict: true, schema: policySchema } }
    }),
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({})) as ResponsesPayload;
  if (!response.ok) throw new Error(`OPENAI_POLICY:${payload.error?.message || response.status}`);
  const raw = outputText(payload);
  if (!raw) throw new Error('OPENAI_POLICY:Empty policy result.');
  return JSON.parse(raw) as PolicyDecision;
}

export async function POST(request: Request) {
  const supabase = getSupabaseServiceClient();
  let pendingPath = '';
  try {
    const { user } = await getAuthenticatedUser(request);
    await enforceAiRateLimit(supabase, user.id, 'avatar_moderation', 8);
    const body = await request.json().catch(() => ({})) as { storagePath?: string; mimeType?: string };
    pendingPath = String(body.storagePath || '').trim();
    const mimeType = String(body.mimeType || '').toLowerCase();

    if (!pendingPath || !pendingPath.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: 'Invalid profile photo upload.' }, { status: 400 });
    }
    if (!allowedMimeTypes.has(mimeType)) {
      return NextResponse.json({ error: 'Profile photos must be JPG, PNG, or WebP so Aspire can review them safely.' }, { status: 400 });
    }

    const { data: objectRow } = await supabase
      .schema('storage')
      .from('objects')
      .select('name,owner_id')
      .eq('bucket_id', 'avatar-pending')
      .eq('name', pendingPath)
      .maybeSingle();
    if (!objectRow || objectRow.owner_id !== user.id) {
      return NextResponse.json({ error: 'Profile photo upload was not found.' }, { status: 404 });
    }

    const { data: signed, error: signedError } = await supabase.storage.from('avatar-pending').createSignedUrl(pendingPath, signedSeconds);
    if (signedError || !signed?.signedUrl) throw signedError || new Error('Could not prepare the image for review.');

    await supabase.from('profiles').update({
      avatar_moderation_status: 'scanning',
      avatar_pending_path: pendingPath,
      avatar_moderation_summary: 'Aspire is checking this profile photo before it can appear publicly.'
    }).eq('id', user.id);

    const harmful = await scanHarmful(signed.signedUrl);
    const policy = await scanAspirePolicy(signed.signedUrl);

    const reviewBase = {
      user_id: user.id,
      storage_path: pendingPath,
      mime_type: mimeType,
      provider: 'openai',
      model: visionModel,
      model_flagged: Boolean(harmful.result.flagged),
      categories: harmful.result.categories || {},
      category_scores: harmful.result.category_scores || {}
    };

    if (harmfulBlock(harmful.result) || policy.classification === 'political') {
      const reason = harmfulBlock(harmful.result)
        ? 'Profile photo was blocked by Aspire harmful-content policy.'
        : 'Aspire profile photos cannot primarily feature political candidates, elected officials, heads of state/government, party leaders, or campaign/party material.';
      const { data: review } = await supabase.from('avatar_moderation_reviews').insert({
        ...reviewBase,
        status: 'rejected',
        risk_level: harmfulBlock(harmful.result) ? 'high' : 'policy',
        risk_score: harmfulBlock(harmful.result) ? 90 : 80,
        ai_summary: reason,
        reviewed_at: new Date().toISOString()
      }).select('id').single();
      await supabase.from('profiles').update({
        avatar_moderation_status: 'rejected',
        avatar_pending_path: null,
        avatar_moderation_review_id: review?.id || null,
        avatar_moderation_summary: reason
      }).eq('id', user.id);
      await supabase.storage.from('avatar-pending').remove([pendingPath]);
      return NextResponse.json({ ok: true, status: 'rejected', message: reason });
    }

    if (policy.classification === 'uncertain') {
      const { data: review } = await supabase.from('avatar_moderation_reviews').insert({
        ...reviewBase,
        status: 'pending',
        risk_level: 'review',
        risk_score: 50,
        ai_summary: 'Automated review was uncertain. The photo stays private until a moderator reviews it.'
      }).select('id').single();
      await supabase.from('profiles').update({
        avatar_moderation_status: 'pending',
        avatar_pending_path: pendingPath,
        avatar_moderation_review_id: review?.id || null,
        avatar_moderation_summary: 'Photo is pending moderator review and is not public.'
      }).eq('id', user.id);
      return NextResponse.json({ ok: true, status: 'pending', message: 'Photo sent for moderator review. Your current profile photo stays visible until it is approved.' });
    }

    const { data: bytes, error: downloadError } = await supabase.storage.from('avatar-pending').download(pendingPath);
    if (downloadError || !bytes) throw downloadError || new Error('Could not finalize the approved photo.');
    const finalPath = `${user.id}/avatar-${Date.now()}.${extensionFor(mimeType)}`;
    const { error: publicUploadError } = await supabase.storage.from('avatars').upload(finalPath, bytes, {
      contentType: mimeType,
      cacheControl: '3600',
      upsert: false
    });
    if (publicUploadError) throw publicUploadError;
    const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(finalPath);

    const { data: profile } = await supabase.from('profiles').select('avatar_url').eq('id', user.id).maybeSingle();
    const oldUrl = String(profile?.avatar_url || '');
    const prefix = 'https://ikxjemnugoodfuxjaqoe.supabase.co/storage/v1/object/public/avatars/';
    const oldPath = oldUrl.startsWith(prefix) ? decodeURIComponent(oldUrl.slice(prefix.length)) : null;

    const { data: review } = await supabase.from('avatar_moderation_reviews').insert({
      ...reviewBase,
      status: 'approved',
      risk_level: 'low',
      risk_score: 0,
      ai_summary: 'Profile photo passed harmful-content and Aspire political-content checks.',
      approved_avatar_url: publicData.publicUrl,
      reviewed_at: new Date().toISOString()
    }).select('id').single();

    await supabase.from('profiles').update({
      avatar_url: publicData.publicUrl,
      image_url: publicData.publicUrl,
      avatar_moderation_status: 'approved',
      avatar_pending_path: null,
      avatar_moderation_review_id: review?.id || null,
      avatar_moderation_summary: 'Profile photo approved.',
      updated_at: new Date().toISOString()
    }).eq('id', user.id);

    await supabase.storage.from('avatar-pending').remove([pendingPath]);
    if (oldPath && oldPath !== finalPath && oldPath.startsWith(`${user.id}/`)) {
      await supabase.storage.from('avatars').remove([oldPath]).catch(() => undefined);
    }
    return NextResponse.json({ ok: true, status: 'approved', avatarUrl: publicData.publicUrl, message: 'Profile photo updated.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    if (pendingPath) {
      try {
        const auth = await getAuthenticatedUser(request);
        await supabase.from('profiles').update({
          avatar_moderation_status: 'pending',
          avatar_pending_path: pendingPath,
          avatar_moderation_summary: 'Automated review could not finish. The photo remains private for moderator review.'
        }).eq('id', auth.user.id);
      } catch { /* keep fail-closed */ }
    }
    if (message === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Sign in again before changing your photo.' }, { status: 401 });
    if (message === 'AI_RATE_LIMIT') return NextResponse.json({ error: 'Too many profile-photo checks. Try again later.' }, { status: 429 });
    return NextResponse.json({ error: 'Aspire could not finish reviewing this photo. It has not been published.' }, { status: 502 });
  }
}
