import type { AspireEntities } from './entities';
import type { AspireIntent } from './intent';
import { locationSearchTerms } from './campusKnowledge';

export type BrainCandidate = {
  id: string;
  poster_id: string;
  title: string;
  details: string | null;
  category: string;
  kind: string;
  amount_cents: number | null;
  market_intent: string | null;
  item_condition: string | null;
  price_negotiable: boolean | null;
  fulfillment_method: string | null;
  created_at: string;
};

export type BrainMatch = {
  id: string;
  reason: string;
  strength: 'strong' | 'possible';
  score: number;
};

const stopWords = new Set([
  'the','a','an','to','from','for','with','and','or','i','me','my','we','our','you','your','is','are','am','be','need','want','looking','find','get','someone','anyone','can','help','tomorrow','today','tonight'
]);

function tokens(value: string) {
  return Array.from(new Set(value.toLowerCase().match(/[a-z0-9]+/g) ?? []))
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function includesAny(haystack: string, terms: string[]) {
  const value = haystack.toLowerCase();
  return terms.some((term) => value.includes(term.toLowerCase()));
}

function marketCompatible(intent: AspireIntent, candidate: BrainCandidate) {
  if (intent.category !== 'Buy & sell') return true;
  if (intent.marketIntent === 'sell') return candidate.market_intent === 'wanted';
  if (intent.marketIntent === 'wanted') return candidate.market_intent === 'sell';
  return true;
}

export function rankAspireCandidates(
  message: string,
  intent: AspireIntent,
  entities: AspireEntities,
  candidates: BrainCandidate[]
): BrainMatch[] {
  const messageTokens = tokens(message);

  const ranked = candidates.map((candidate) => {
    let score = 0;
    const reasons: string[] = [];
    const text = `${candidate.title} ${candidate.details || ''}`.toLowerCase();

    if (candidate.category === intent.category) {
      score += 32;
      reasons.push(`same ${intent.category.toLowerCase()} category`);
    } else {
      return null;
    }

    if (!marketCompatible(intent, candidate)) return null;
    if (intent.category === 'Buy & sell' && intent.marketIntent) {
      score += 18;
      reasons.push(intent.marketIntent === 'sell' ? 'someone is looking for an item' : 'an item is being offered');
    }

    for (const location of entities.locations) {
      if (includesAny(text, locationSearchTerms(location))) {
        score += 30;
        reasons.push(`matches ${location.label}`);
        break;
      }
    }

    if (entities.dateText && text.includes(entities.dateText.toLowerCase())) {
      score += 20;
      reasons.push(`matches ${entities.dateText}`);
    }

    if (entities.course && text.includes(entities.course.toLowerCase())) {
      score += 28;
      reasons.push(`matches ${entities.course}`);
    }

    if (entities.item) {
      const itemTokens = tokens(entities.item);
      const overlap = itemTokens.filter((token) => text.includes(token)).length;
      if (overlap > 0) {
        score += Math.min(30, overlap * 12);
        reasons.push('matches the item');
      }
    }

    const lexicalOverlap = messageTokens.filter((token) => text.includes(token)).length;
    if (lexicalOverlap > 0) {
      score += Math.min(18, lexicalOverlap * 4);
      reasons.push('similar wording');
    }

    const created = Date.parse(candidate.created_at);
    if (Number.isFinite(created) && Date.now() - created < 14 * 24 * 60 * 60 * 1000) score += 5;

    if (score < 45) return null;
    return {
      id: candidate.id,
      score,
      strength: score >= 75 ? 'strong' as const : 'possible' as const,
      reason: reasons.slice(0, 3).join(' · ')
    };
  }).filter((item): item is BrainMatch => Boolean(item));

  return ranked.sort((a, b) => b.score - a.score).slice(0, 5);
}
