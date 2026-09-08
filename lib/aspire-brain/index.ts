import { extractAspireEntities } from './entities';
import { parseAspireIntent } from './intent';
import { rankAspireCandidates, type BrainCandidate } from './matcher';
import { buildAspirePlan } from './planner';

export function runAspireBrain(message: string, campusName: string, candidates: BrainCandidate[]) {
  const intent = parseAspireIntent(message);
  const entities = extractAspireEntities(message, intent.intent);

  if (intent.intent === 'UNKNOWN' || intent.confidence === 'low') {
    return {
      handled: false as const,
      intent,
      entities,
      plan: null,
      matches: []
    };
  }

  const plan = buildAspirePlan(message, intent, entities, campusName);
  const matches = rankAspireCandidates(message, intent, entities, candidates);

  if (matches.length > 0) {
    plan.next_action = 'join_existing';
    plan.assistant_message = `Aspire found ${matches.length === 1 ? 'a possible match' : `${matches.length} possible matches`} on campus and also prepared a draft in case you want your own request.`;
  }

  plan.matches = matches.map((match) => ({
    id: match.id,
    reason: match.reason,
    strength: match.strength
  }));

  return {
    handled: true as const,
    intent,
    entities,
    plan,
    matches
  };
}

export { looksLikeAspireAction, parseAspireIntent } from './intent';
export type { AspireIntent, AspireIntentName } from './intent';
export type { BrainCandidate, BrainMatch } from './matcher';
export type { BrainPlan } from './planner';
