export type AspireIntentName =
  | 'FIND_OR_CREATE_RIDE'
  | 'SELL_ITEM'
  | 'FIND_ITEM'
  | 'FIND_STUDY'
  | 'FIND_PROJECT'
  | 'GET_HELP'
  | 'RUN_ERRAND'
  | 'UNKNOWN';

export type AspireIntentConfidence = 'high' | 'medium' | 'low';

export type AspireIntent = {
  intent: AspireIntentName;
  category: 'Ride' | 'Pickup / errand' | 'Moving / help' | 'Study' | 'Project / collab' | 'Buy & sell' | 'Other';
  kind: 'community' | 'paid_help' | 'split_cost' | 'buy_sell' | 'collaboration';
  marketIntent: 'sell' | 'wanted' | null;
  confidence: AspireIntentConfidence;
  score: number;
  signals: string[];
};

function hit(value: string, pattern: RegExp) {
  return pattern.test(value);
}

function candidate(
  intent: AspireIntentName,
  category: AspireIntent['category'],
  kind: AspireIntent['kind'],
  marketIntent: AspireIntent['marketIntent'],
  score: number,
  signals: string[]
): AspireIntent {
  return {
    intent,
    category,
    kind,
    marketIntent,
    score,
    signals,
    confidence: score >= 80 ? 'high' : score >= 55 ? 'medium' : 'low'
  };
}

export function looksLikeAspireAction(message: string) {
  const value = message.trim().toLowerCase();
  return /\b(ride|drive|driving|airport|ind|ord|mdw|sfo|oak|sjc|lax|pickup|pick up|errand|package|move|moving|carry|lift|study partner|study buddy|classmate|project teammate|hackathon|collab|collaboration|sell|selling|for sale|buy|buying|looking for|marketplace|campus|request|post)\b/i.test(value);
}

export function parseAspireIntent(message: string): AspireIntent {
  const value = message.trim().toLowerCase();
  const results: AspireIntent[] = [];

  {
    let score = 0;
    const signals: string[] = [];
    if (hit(value, /\b(ride|rides|driver|drive me|driving|carpool|car pool)\b/i)) { score += 70; signals.push('ride-language'); }
    if (hit(value, /\b(airport|ind|ord|mdw|sfo|oak|sjc|lax|iad|dca|bwi)\b/i)) { score += 45; signals.push('travel-destination'); }
    if (hit(value, /\b(get|go|going|head|heading|travel|return|back)\b.{0,30}\b(to|from)\b/i)) { score += 25; signals.push('travel-action'); }
    if (score > 0) results.push(candidate('FIND_OR_CREATE_RIDE', 'Ride', 'split_cost', null, score, signals));
  }

  {
    let score = 0;
    const signals: string[] = [];
    if (hit(value, /\b(sell|selling|for sale|list my|listing my|put my .* up for sale)\b/i)) { score += 85; signals.push('sell-language'); }
    if (hit(value, /\$\s*\d|\b\d+(?:\.\d{1,2})?\s*(?:dollars?|bucks?)\b/i)) { score += 15; signals.push('price'); }
    if (score > 0) results.push(candidate('SELL_ITEM', 'Buy & sell', 'buy_sell', 'sell', score, signals));
  }

  {
    let score = 0;
    const signals: string[] = [];
    if (hit(value, /\b(anyone selling|looking for|want to buy|need to buy|trying to buy|where can i get|does anyone have)\b/i)) { score += 75; signals.push('wanted-language'); }
    if (hit(value, /\b(marketplace|for sale|buy|buying)\b/i)) { score += 30; signals.push('market-language'); }
    if (score > 0) results.push(candidate('FIND_ITEM', 'Buy & sell', 'buy_sell', 'wanted', score, signals));
  }

  {
    let score = 0;
    const signals: string[] = [];
    if (hit(value, /\b(study partner|study buddy|study group|classmate|study with|study together)\b/i)) { score += 90; signals.push('study-partner'); }
    if (hit(value, /\b(study|midterm|final|exam|quiz|course|class)\b/i)) { score += 35; signals.push('study-language'); }
    if (hit(value, /\b(math|cs|data|stat|stats|econ|physics|chem|bio|ece|ee|me|mgmt)\s*[- ]?[a-z]?\d{1,3}[a-z]?\b/i)) { score += 35; signals.push('course-code'); }
    if (score > 0) results.push(candidate('FIND_STUDY', 'Study', 'community', null, score, signals));
  }

  {
    let score = 0;
    const signals: string[] = [];
    if (hit(value, /\b(project teammate|teammate|hackathon teammate|cofounder|co-founder|collaborator)\b/i)) { score += 90; signals.push('teammate-language'); }
    if (hit(value, /\b(project|hackathon|startup|build something|collab|collaboration)\b/i)) { score += 45; signals.push('project-language'); }
    if (hit(value, /\b(frontend|backend|developer|designer|engineer|coder|programmer)\b/i)) { score += 20; signals.push('role-language'); }
    if (score > 0) results.push(candidate('FIND_PROJECT', 'Project / collab', 'collaboration', null, score, signals));
  }

  {
    let score = 0;
    const signals: string[] = [];
    if (hit(value, /\b(help me move|help moving|moving help|move a|move my|carry|lift|搬|搬家)\b/i)) { score += 90; signals.push('moving-help'); }
    if (hit(value, /\b(move|moving|carry|lift|heavy|furniture|desk|couch|mini fridge)\b/i)) { score += 35; signals.push('moving-language'); }
    if (score > 0) results.push(candidate('GET_HELP', 'Moving / help', 'paid_help', null, score, signals));
  }

  {
    let score = 0;
    const signals: string[] = [];
    if (hit(value, /\b(pick up|pickup|pick-up|errand|grab my|collect my|package pickup|target order|walmart order)\b/i)) { score += 90; signals.push('errand-language'); }
    if (score > 0) results.push(candidate('RUN_ERRAND', 'Pickup / errand', 'paid_help', null, score, signals));
  }

  const best = results.sort((a, b) => b.score - a.score)[0];
  if (best) return best;

  return candidate('UNKNOWN', 'Other', 'community', null, 0, []);
}
