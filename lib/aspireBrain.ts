export const brainCategories = ['Ride','Pickup / errand','Moving / help','Study','Project / collab','Buy & sell','Other'] as const;
export const brainKinds = ['community','paid_help','split_cost','buy_sell','collaboration'] as const;

export type BrainCategory = typeof brainCategories[number];
export type BrainKind = typeof brainKinds[number];

export type BrainCandidate = {
  id: string;
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

export type BrainPlan = {
  status: 'ready' | 'needs_details';
  intent_summary: string;
  assistant_message: string;
  category: BrainCategory;
  kind: BrainKind;
  title: string;
  details: string;
  amount_cents: number | null;
  payment_method: 'none' | 'in_person' | 'aspire';
  market_intent: 'sell' | 'wanted' | null;
  item_condition: 'new' | 'like_new' | 'good' | 'fair' | 'for_parts' | null;
  price_negotiable: boolean | null;
  time_text: string;
  place_text: string;
  confidence: 'high' | 'medium';
  next_action: 'join_existing' | 'create_request' | 'explore' | 'need_details';
  questions: string[];
  matches: Array<{ id: string; reason: string; strength: 'strong' | 'possible' }>;
};

type Classification = {
  category: BrainCategory;
  kind: BrainKind;
  marketIntent: 'sell' | 'wanted' | null;
  confidence: number;
};

const stop = new Set(['the','a','an','to','for','of','and','or','i','im','i’m','me','my','we','our','you','your','is','are','need','want','looking','can','someone','anyone','please','help','with','on','at','in','this','that','today','tomorrow']);

function normalize(value: string) {
  return value.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9$+:/.-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(value: string) {
  return normalize(value).split(' ').filter((token) => token.length > 1 && !stop.has(token));
}

function containsAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function classify(message: string): Classification | null {
  const value = normalize(message);

  const sell = /\b(sell|selling|for sale|listing|list my)\b/.test(value);
  const wanted = /\b(wtb|want to buy|looking to buy|buying|need to buy|searching for)\b/.test(value);
  const marketplaceItem = /\b(chair|desk|table|sofa|couch|bed|mattress|lamp|fridge|refrigerator|microwave|monitor|tv|television|bike|bicycle|scooter|keyboard|mouse|headphones|textbook|book|calculator|dresser|shelf|shelves|fan|printer|camera|laptop|ipad|phone)\b/.test(value);
  if (sell || wanted || (marketplaceItem && /\b(buy|price|condition|pickup|negotiable|obo|used|new)\b/.test(value))) {
    return { category: 'Buy & sell', kind: 'buy_sell', marketIntent: sell ? 'sell' : 'wanted', confidence: sell || wanted ? 0.98 : 0.88 };
  }

  const ride = /\b(ride|carpool|drive|driving|airport|indy airport|ind|ord|o'hare|ohare|midway|sfo|oak|sjc)\b/.test(value);
  if (ride) {
    const split = /\b(split|gas|fuel|share cost|share the cost|chip in|contribute)\b/.test(value);
    return { category: 'Ride', kind: split ? 'split_cost' : 'community', marketIntent: null, confidence: 0.94 };
  }

  const errand = containsAny(value, ['pick up','pickup','drop off','dropoff','errand','grab ','deliver ','delivery','grocery','groceries','package']);
  if (errand) {
    const paid = /\$\s?\d|\b(pay|paid|tip|offer|offering)\b/.test(value);
    return { category: 'Pickup / errand', kind: paid ? 'paid_help' : 'community', marketIntent: null, confidence: 0.91 };
  }

  const moving = /\b(move|moving|carry|lifting|lift|furniture|couch|sofa|boxes|unload|loading|搬家)\b/.test(value);
  if (moving) {
    const paid = /\$\s?\d|\b(pay|paid|offer|offering|hour|hourly)\b/.test(value);
    return { category: 'Moving / help', kind: paid ? 'paid_help' : 'community', marketIntent: null, confidence: 0.93 };
  }

  const study = /\b(study|study group|homework|exam|midterm|final|tutor|tutoring|review|problem set|pset|math|calculus|linear algebra|chem|chemistry|physics|biology|cs|computer science|data 8|math 55|math 110|math 128a)\b/.test(value);
  if (study) {
    const paid = /\b(tutor|tutoring)\b/.test(value) && /\$\s?\d|\b(pay|paid|rate|hour|hourly)\b/.test(value);
    return { category: 'Study', kind: paid ? 'paid_help' : 'community', marketIntent: null, confidence: 0.94 };
  }

  const collab = /\b(project|startup|build|developer|dev|frontend|backend|designer|design|cofounder|co-founder|collab|collaborate|teammate|hackathon|research)\b/.test(value);
  if (collab) return { category: 'Project / collab', kind: 'collaboration', marketIntent: null, confidence: 0.92 };

  return null;
}

function extractAmount(message: string) {
  const match = message.match(/(?:\$\s*|usd\s*)(\d{1,5}(?:\.\d{1,2})?)/i)
    || message.match(/\b(\d{1,5}(?:\.\d{1,2})?)\s*(?:dollars?|bucks?)\b/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100000) return null;
  return Math.round(amount * 100);
}

function extractCondition(message: string): BrainPlan['item_condition'] {
  const value = normalize(message);
  if (/\b(for parts|parts only|broken)\b/.test(value)) return 'for_parts';
  if (/\b(like new|barely used|mint)\b/.test(value)) return 'like_new';
  if (/\bbrand new\b|\bnew condition\b/.test(value)) return 'new';
  if (/\b(good condition|good shape|used good)\b/.test(value)) return 'good';
  if (/\b(fair condition|fair shape|worn)\b/.test(value)) return 'fair';
  return null;
}

function extractNegotiable(message: string) {
  const value = normalize(message);
  if (/\b(not negotiable|firm price|price firm|firm)\b/.test(value)) return false;
  if (/\b(negotiable|obo|or best offer|flexible on price)\b/.test(value)) return true;
  return null;
}

function extractTime(message: string) {
  const parts: string[] = [];
  const day = message.match(/\b(today|tonight|tomorrow|this (?:morning|afternoon|evening)|(?:mon|tues?|wed(?:nesday)?|thu(?:rs)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?))\b/i)?.[0];
  const clock = message.match(/\b(?:at\s*)?(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i)?.[1];
  const date = message.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}\b/i)?.[0];
  if (day) parts.push(day);
  if (date) parts.push(date);
  if (clock) parts.push(clock);
  return [...new Set(parts)].join(' · ');
}

function extractPlace(message: string, category: BrainCategory) {
  const airport = message.match(/\b(IND|ORD|SFO|OAK|SJC|LAX|JFK|EWR)\b/i)?.[0];
  if (airport) return airport.toUpperCase();
  const phrase = message.match(/\b(?:at|from|to|near|by|in)\s+([A-Za-z0-9][A-Za-z0-9 .'-]{1,45})(?=\s+(?:today|tonight|tomorrow|at\s+\d|for\s+\$|\$\d)|[,.!?]|$)/i)?.[1]?.trim();
  if (!phrase) return '';
  if (category === 'Ride' && /^me$/i.test(phrase)) return '';
  return phrase.slice(0, 80);
}

function conciseTitle(message: string, classification: Classification) {
  const cleaned = message.replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
  const prefix = classification.marketIntent === 'sell' ? 'For sale: ' : classification.marketIntent === 'wanted' ? 'Wanted: ' : '';
  let core = cleaned
    .replace(/^(hey\s+)?(i\s*(?:am|'m)?\s*)?(need|want|looking for|looking to|can someone|anyone able to|selling|sell)\s+/i, '')
    .replace(/^to\s+/i, '');
  if (classification.marketIntent === 'sell') core = core.replace(/^my\s+/i, '');
  const amountCut = core.split(/\s+(?:for\s+)?\$\s*\d/)[0].trim();
  if (amountCut.length >= 4) core = amountCut;
  core = core.slice(0, 92).trim();
  if (!core) core = classification.category;
  return `${prefix}${core}`.slice(0, 110);
}

function overlapScore(message: string, candidate: BrainCandidate, classification: Classification) {
  let score = 0;
  if (candidate.category === classification.category) score += 0.34;
  if (candidate.kind === classification.kind) score += 0.18;
  if (classification.marketIntent && candidate.market_intent === classification.marketIntent) score += 0.12;
  if (classification.marketIntent && candidate.market_intent && candidate.market_intent !== classification.marketIntent) score -= 0.30;

  const queryTokens = new Set(tokens(message));
  const candidateTokens = new Set(tokens(`${candidate.title} ${candidate.details || ''}`));
  const common = [...queryTokens].filter((token) => candidateTokens.has(token));
  const lexical = queryTokens.size ? common.length / Math.min(Math.max(queryTokens.size, 1), 6) : 0;
  score += Math.min(0.36, lexical * 0.42);
  return Math.max(0, Math.min(1, score));
}

function rankMatches(message: string, classification: Classification, candidates: BrainCandidate[]) {
  return candidates
    .map((candidate) => ({ candidate, score: overlapScore(message, candidate, classification) }))
    .filter(({ score }) => score >= 0.48)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ candidate, score }) => ({
      id: candidate.id,
      reason: score >= 0.64 ? 'Strong overlap in intent, category, and request details.' : 'Similar campus request with matching intent signals.',
      strength: score >= 0.64 ? 'strong' as const : 'possible' as const,
      score
    }));
}

export function planDeterministically(message: string, candidates: BrainCandidate[]): BrainPlan | null {
  const classification = classify(message);
  if (!classification || classification.confidence < 0.90) return null;

  const amountCents = extractAmount(message);
  const timeText = extractTime(message);
  const placeText = extractPlace(message, classification.category);
  const matches = rankMatches(message, classification, candidates);
  const strongMatch = matches[0]?.strength === 'strong';
  const title = conciseTitle(message, classification);
  const itemCondition = classification.kind === 'buy_sell' ? extractCondition(message) : null;
  const negotiable = classification.kind === 'buy_sell' ? extractNegotiable(message) : null;

  const questions: string[] = [];
  // Only block on details that prevent a useful post. Time/place can remain optional and be edited later.
  if (classification.kind === 'buy_sell' && classification.marketIntent === 'sell' && amountCents === null) questions.push('What price do you want to list?');
  if (classification.category === 'Ride' && !timeText) questions.push('When do you need the ride?');

  const needsDetails = questions.length > 0 && !strongMatch;
  const nextAction: BrainPlan['next_action'] = strongMatch ? 'join_existing' : needsDetails ? 'need_details' : 'create_request';
  const details = message.trim().slice(0, 900);

  return {
    status: needsDetails ? 'needs_details' : 'ready',
    intent_summary: `${classification.category}: ${title}`.slice(0, 220),
    assistant_message: strongMatch
      ? 'There is an existing campus post that looks like a strong fit. Check it first; if it is not right, you can still create your own post.'
      : needsDetails
        ? `This is clear enough to classify. ${questions[0]}`
        : 'This is clear enough to turn into an Aspire post. Review the draft, then submit it if it looks right.',
    category: classification.category,
    kind: classification.kind,
    title,
    details,
    amount_cents: amountCents,
    payment_method: amountCents !== null && classification.kind === 'paid_help' ? 'in_person' : 'none',
    market_intent: classification.kind === 'buy_sell' ? classification.marketIntent : null,
    item_condition: itemCondition,
    price_negotiable: negotiable,
    time_text: timeText,
    place_text: placeText,
    confidence: classification.confidence >= 0.94 ? 'high' : 'medium',
    next_action: nextAction,
    questions: needsDetails ? questions.slice(0, 2) : [],
    matches: matches.map(({ score: _score, ...match }) => match)
  };
}
