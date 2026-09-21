import { requireEnv } from './aspireServer';

export type PublicPoliticalDecision = 'allow' | 'review' | 'block';
export type PublicPoliticalReason =
  | 'political_figure_primary_subject'
  | 'campaign_or_party_material'
  | 'political_advocacy_or_opposition'
  | 'political_merchandise'
  | 'partisan_meme_or_propaganda'
  | 'neutral_academic_or_civic_reference'
  | 'none'
  | 'uncertain';

export type PublicPoliticalAssessment = {
  decision: PublicPoliticalDecision;
  reasonCode: PublicPoliticalReason;
  summary: string;
  model: string;
};

type ResponsePayload = {
  model?: string;
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  error?: { message?: string };
};

function responseText(payload: ResponsePayload) {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  for (const item of payload.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === 'output_text' && typeof part.text === 'string' && part.text.trim()) return part.text.trim();
    }
  }
  return '';
}

export async function classifyPublicPoliticalContent(input: {
  surface: 'avatar' | 'post' | 'marketplace';
  text?: string;
  imageUrls?: string[];
}): Promise<PublicPoliticalAssessment> {
  const apiKey = requireEnv('OPENAI_API_KEY');
  const model = process.env.ASPIRE_POLICY_MODEL || 'gpt-5.6-luna';
  const images = (input.imageUrls ?? []).slice(0, 5);

  const content: Array<Record<string, unknown>> = [{
    type: 'input_text',
    text: [
      'Apply Aspire 101 public-space policy neutrally and consistently across every country, party, candidate, officeholder, and viewpoint.',
      'Do not identify or name any person in an image. Do not infer ideology, party preference, motive, truthfulness, or political fitness.',
      'BLOCK public-facing content when:',
      '- an image is primarily centered on a current or former national leader, head of state/government, elected official, political candidate, or party leader;',
      '- it contains campaign signs, campaign slogans, party logos, political fundraising, political merchandise, or election/ballot persuasion;',
      '- it advocates for or against a candidate, officeholder, political party, or ballot campaign;',
      '- it is a partisan political meme or propaganda-style public post.',
      'REVIEW when the political nature or context is genuinely ambiguous.',
      'ALLOW ordinary campus utility content and neutral course/civic references that are not advocacy or campaign material. A national flag by itself is not enough to block.',
      input.surface === 'avatar'
        ? 'For profile photos, any political leader/candidate/officeholder/party leader as the primary subject must be blocked.'
        : 'For posts/listings, neutral text-only academic references may be allowed, but images centered on political figures or campaign material must be blocked.',
      `Surface: ${input.surface}`,
      `User text: ${(input.text || '').slice(0, 12000) || '(none)'}`
    ].join('\n')
  }];

  for (const imageUrl of images) {
    content.push({ type: 'input_image', image_url: imageUrl, detail: 'low' });
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: 'none' },
      max_output_tokens: 220,
      input: [{ role: 'user', content }],
      text: {
        format: {
          type: 'json_schema',
          name: 'aspire_public_political_policy',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              decision: { type: 'string', enum: ['allow', 'review', 'block'] },
              reason_code: {
                type: 'string',
                enum: [
                  'political_figure_primary_subject',
                  'campaign_or_party_material',
                  'political_advocacy_or_opposition',
                  'political_merchandise',
                  'partisan_meme_or_propaganda',
                  'neutral_academic_or_civic_reference',
                  'none',
                  'uncertain'
                ]
              },
              summary: { type: 'string', maxLength: 240 }
            },
            required: ['decision', 'reason_code', 'summary']
          }
        }
      }
    }),
    cache: 'no-store'
  });

  const payload = await response.json().catch(() => ({})) as ResponsePayload;
  if (!response.ok) throw new Error(`OPENAI_PUBLIC_POLICY:${payload.error?.message || `HTTP ${response.status}`}`);
  const raw = responseText(payload);
  if (!raw) throw new Error('OPENAI_PUBLIC_POLICY:No policy result returned.');

  let parsed: { decision?: string; reason_code?: string; summary?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('OPENAI_PUBLIC_POLICY:Invalid policy result.');
  }

  const decisions = new Set(['allow', 'review', 'block']);
  const reasons = new Set([
    'political_figure_primary_subject',
    'campaign_or_party_material',
    'political_advocacy_or_opposition',
    'political_merchandise',
    'partisan_meme_or_propaganda',
    'neutral_academic_or_civic_reference',
    'none',
    'uncertain'
  ]);
  if (!decisions.has(String(parsed.decision)) || !reasons.has(String(parsed.reason_code))) {
    throw new Error('OPENAI_PUBLIC_POLICY:Unexpected policy result.');
  }

  return {
    decision: parsed.decision as PublicPoliticalDecision,
    reasonCode: parsed.reason_code as PublicPoliticalReason,
    summary: String(parsed.summary || '').slice(0, 240),
    model: payload.model || model
  };
}

export function publicPoliticalFlag(assessment: PublicPoliticalAssessment) {
  if (assessment.decision === 'allow') return null;
  return `public_political_policy:${assessment.decision}:${assessment.reasonCode}`;
}
