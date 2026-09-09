import { createHash } from 'node:crypto';
import { requireEnv } from './aspireServer';

export type AspireSafetyContext =
  | 'signup_name'
  | 'profile_name'
  | 'avatar'
  | 'request'
  | 'response'
  | 'message'
  | 'review';

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

export type AspireSafetyDecision = {
  allowed: boolean;
  decision: 'allow' | 'block';
  context: AspireSafetyContext;
  model: string;
  modelFlagged: boolean;
  maxScore: number;
  categories: Record<string, boolean>;
  categoryScores: Record<string, number>;
  policyFlags: string[];
  reason: string;
  contentHash: string;
};

const moderationModel = 'omni-moderation-latest';

function hashContent(text: string, imageUrls: string[]) {
  return createHash('sha256').update(`${text}\n${imageUrls.join('\n')}`).digest('hex');
}

function platformFlags(text: string, context: AspireSafetyContext) {
  const flags = new Set<string>();
  const normalized = text.trim();

  if (/https?:\/\/|www\.|(?:^|\s)@[a-z0-9_.-]{2,}/i.test(normalized)) flags.add('external_contact_or_link');
  if (/\b\d{3}[-.\s)]*\d{3}[-.\s]*\d{4}\b/.test(normalized)) flags.add('phone_number');
  if (/(social security|\bssn\b|credit card number|bank account number|routing number|passport number|driver'?s? license number)/i.test(normalized)) flags.add('sensitive_personal_data');
  if (/(password|login credentials?|verification code|one[- ]time code|\botp\b|2fa code)/i.test(normalized)) flags.add('credential_request');
  if (/(zelle|venmo|cash\s?app|paypal friends|friends and family|bitcoin|crypto|wire transfer|gift[ -]?card).{0,60}(pay|send|transfer|deposit)/i.test(normalized)) flags.add('high_risk_payment_language');

  if (context === 'signup_name' || context === 'profile_name') {
    if (normalized.length < 1 || normalized.length > 80) flags.add('invalid_name_length');
    if (/https?:\/\/|www\.|@|\b(?:telegram|whatsapp|wechat|discord|snapchat|instagram|venmo|zelle|cash\s?app)\b/i.test(normalized)) flags.add('name_as_contact_or_ad');
    if (/\b\d{7,}\b/.test(normalized)) flags.add('name_contains_long_number');
  }

  return [...flags];
}

export async function moderateAspireContent(input: {
  context: AspireSafetyContext;
  text?: string | null;
  imageUrls?: string[];
}): Promise<AspireSafetyDecision> {
  const text = String(input.text || '').trim().slice(0, 30000);
  const imageUrls = (input.imageUrls || []).filter(Boolean).slice(0, 5);
  if (!text && !imageUrls.length) throw new Error('SAFETY_EMPTY');

  const apiKey = requireEnv('OPENAI_API_KEY');
  const moderationInput: Array<Record<string, unknown>> = [];
  if (text) moderationInput.push({ type: 'text', text: `[Aspire context: ${input.context}]\n${text}` });
  imageUrls.forEach((url) => moderationInput.push({ type: 'image_url', image_url: { url } }));

  const response = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: moderationModel, input: moderationInput }),
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({})) as ModerationPayload;
  if (!response.ok) throw new Error(`OPENAI_MODERATION:${payload.error?.message || `HTTP ${response.status}`}`);

  const result = payload.results?.[0];
  if (!result) throw new Error('OPENAI_MODERATION:No moderation result returned.');

  const categories = result.categories || {};
  const categoryScores = result.category_scores || {};
  const scores = Object.values(categoryScores).filter((score) => Number.isFinite(score));
  const maxScore = scores.length ? Math.max(...scores) : 0;
  const policyFlags = platformFlags(text, input.context);

  const severeKeys = new Set([
    'sexual/minors',
    'hate/threatening',
    'self-harm/instructions',
    'self-harm/intent',
    'violence/graphic',
    'illicit/violent'
  ]);
  const severeScore = Object.entries(categoryScores)
    .filter(([key]) => severeKeys.has(key))
    .reduce((max, [, score]) => Math.max(max, Number(score) || 0), 0);

  const hardPolicy = policyFlags.some((flag) => [
    'sensitive_personal_data',
    'credential_request',
    'high_risk_payment_language',
    'name_as_contact_or_ad',
    'name_contains_long_number',
    'invalid_name_length'
  ].includes(flag));

  // Automatic decision: no routine human-review queue. If the model or a high-confidence
  // Aspire policy signal says the content is unsafe, the write is blocked before publication.
  const blocked = Boolean(result.flagged) || severeScore >= 0.25 || maxScore >= 0.8 || hardPolicy;
  const contextLabel = input.context.replace(/_/g, ' ');

  return {
    allowed: !blocked,
    decision: blocked ? 'block' : 'allow',
    context: input.context,
    model: payload.model || moderationModel,
    modelFlagged: Boolean(result.flagged),
    maxScore,
    categories,
    categoryScores,
    policyFlags,
    reason: blocked
      ? `Aspire automatically blocked this ${contextLabel} because its safety check found content that should not be published.`
      : `Aspire automatically approved this ${contextLabel}.`,
    contentHash: hashContent(text, imageUrls)
  };
}
