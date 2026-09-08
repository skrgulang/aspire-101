import type { AspireEntities } from './entities';
import type { AspireIntent } from './intent';

export type BrainPlan = {
  scope: 'action';
  status: 'ready' | 'needs_details';
  intent_summary: string;
  assistant_message: string;
  category: AspireIntent['category'];
  kind: AspireIntent['kind'];
  title: string;
  details: string;
  amount_cents: number | null;
  payment_method: 'none' | 'in_person' | 'aspire';
  market_intent: 'sell' | 'wanted' | null;
  item_condition: 'new' | 'like_new' | 'good' | 'fair' | 'for_parts' | null;
  price_negotiable: boolean | null;
  time_text: string;
  place_text: string;
  confidence: 'high' | 'medium' | 'low';
  next_action: 'join_existing' | 'create_request' | 'explore' | 'need_details';
  questions: string[];
  matches: Array<{ id: string; reason: string; strength: 'strong' | 'possible' }>;
};

function sentenceCase(value: string) {
  const clean = value.trim().replace(/\s+/g, ' ');
  if (!clean) return clean;
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function limit(value: string, max: number) {
  const clean = value.trim().replace(/\s+/g, ' ');
  return clean.length <= max ? clean : `${clean.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function whenText(entities: AspireEntities) {
  return [entities.dateText, entities.timeText].filter(Boolean).join(' · ');
}

function primaryDestination(entities: AspireEntities, campusName: string) {
  const campus = campusName.toLowerCase();
  return entities.locations.find((location) => !location.aliases.some((alias) => campus.includes(alias.toLowerCase()))) || entities.locations[0] || null;
}

function basePlan(intent: AspireIntent, message: string): BrainPlan {
  return {
    scope: 'action',
    status: 'ready',
    intent_summary: limit(message, 220),
    assistant_message: 'Aspire can route this for you.',
    category: intent.category,
    kind: intent.kind,
    title: limit(sentenceCase(message), 180),
    details: limit(sentenceCase(message), 1200),
    amount_cents: null,
    payment_method: 'none',
    market_intent: intent.marketIntent,
    item_condition: null,
    price_negotiable: null,
    time_text: '',
    place_text: '',
    confidence: intent.confidence,
    next_action: 'create_request',
    questions: [],
    matches: []
  };
}

export function buildAspirePlan(message: string, intent: AspireIntent, entities: AspireEntities, campusName: string): BrainPlan {
  const plan = basePlan(intent, message);
  const when = whenText(entities);
  plan.time_text = when;
  plan.amount_cents = entities.amountCents;

  if (intent.intent === 'FIND_OR_CREATE_RIDE') {
    const destination = primaryDestination(entities, campusName);
    plan.category = 'Ride';
    plan.kind = 'split_cost';
    plan.place_text = destination?.label || '';
    plan.title = destination
      ? limit(`Need a ride to ${destination.label}${entities.dateText ? ` ${entities.dateText}` : ''}`, 180)
      : limit(`Need a campus ride${entities.dateText ? ` ${entities.dateText}` : ''}`, 180);
    plan.details = limit(
      `Looking for a ride${destination ? ` to ${destination.label}` : ''}${entities.dateText ? ` ${entities.dateText}` : ''}${entities.timeText ? ` around ${entities.timeText}` : ''}.`,
      1200
    );
    if (!destination) plan.questions.push('Where are you trying to go?');
    if (!entities.dateText && !entities.timeText) plan.questions.push('When do you need the ride?');
    else if (!entities.timeText) plan.questions.push('What pickup time works for you?');
    plan.questions.push('Where should pickup be?');
    plan.questions = plan.questions.slice(0, 3);
  }

  if (intent.intent === 'SELL_ITEM') {
    plan.category = 'Buy & sell';
    plan.kind = 'buy_sell';
    plan.market_intent = 'sell';
    plan.payment_method = entities.amountCents != null ? 'aspire' : 'none';
    plan.price_negotiable = null;
    plan.title = limit(entities.item ? `Selling ${entities.item}` : 'Selling an item on campus', 180);
    plan.details = limit(
      `${entities.item ? `Selling ${entities.item}` : 'Selling an item'}${entities.amountCents != null ? ` for $${(entities.amountCents / 100).toFixed(entities.amountCents % 100 === 0 ? 0 : 2)}` : ''}.`,
      1200
    );
    if (!entities.item) plan.questions.push('What item are you selling?');
    if (entities.amountCents == null) plan.questions.push('What price do you want to list?');
    plan.questions.push('What condition is it in?');
    plan.questions = plan.questions.slice(0, 3);
  }

  if (intent.intent === 'FIND_ITEM') {
    plan.category = 'Buy & sell';
    plan.kind = 'buy_sell';
    plan.market_intent = 'wanted';
    plan.payment_method = entities.amountCents != null ? 'aspire' : 'none';
    plan.title = limit(entities.item ? `Looking for ${entities.item}` : 'Looking for an item on campus', 180);
    plan.details = limit(
      `${entities.item ? `Looking for ${entities.item}` : 'Looking for an item on campus'}${entities.amountCents != null ? ` with a budget around $${(entities.amountCents / 100).toFixed(entities.amountCents % 100 === 0 ? 0 : 2)}` : ''}.`,
      1200
    );
    if (!entities.item) plan.questions.push('What item are you looking for?');
  }

  if (intent.intent === 'FIND_STUDY') {
    plan.category = 'Study';
    plan.kind = 'community';
    plan.title = limit(entities.course ? `Looking for a ${entities.course} study partner` : 'Looking for a study partner', 180);
    plan.details = limit(
      `Looking for a study partner${entities.course ? ` for ${entities.course}` : ''}${entities.dateText ? ` ${entities.dateText}` : ''}${entities.timeText ? ` around ${entities.timeText}` : ''}.`,
      1200
    );
    if (!entities.course) plan.questions.push('What class or topic is this for?');
    if (!entities.dateText && !entities.timeText) plan.questions.push('When do you want to study?');
  }

  if (intent.intent === 'FIND_PROJECT') {
    plan.category = 'Project / collab';
    plan.kind = 'collaboration';
    plan.title = 'Looking for a project teammate';
    plan.details = limit(sentenceCase(message), 1200);
    plan.questions.push('What kind of teammate or skill are you looking for?');
  }

  if (intent.intent === 'GET_HELP') {
    plan.category = 'Moving / help';
    plan.kind = 'paid_help';
    plan.title = limit(`Need help moving${entities.dateText ? ` ${entities.dateText}` : ''}`, 180);
    plan.details = limit(sentenceCase(message), 1200);
    if (!entities.dateText && !entities.timeText) plan.questions.push('When do you need help?');
    if (entities.amountCents == null) plan.questions.push('How much are you offering for the help?');
    plan.questions.push('Where should the helper meet you?');
    plan.questions = plan.questions.slice(0, 3);
  }

  if (intent.intent === 'RUN_ERRAND') {
    plan.category = 'Pickup / errand';
    plan.kind = 'paid_help';
    plan.title = limit(`Need help with a pickup${entities.dateText ? ` ${entities.dateText}` : ''}`, 180);
    plan.details = limit(sentenceCase(message), 1200);
    if (!entities.dateText && !entities.timeText) plan.questions.push('When does it need to be picked up?');
    if (entities.amountCents == null) plan.questions.push('How much are you offering for the errand?');
    plan.questions.push('Where is the pickup?');
    plan.questions = plan.questions.slice(0, 3);
  }

  if (plan.questions.length > 0) {
    plan.status = 'needs_details';
    plan.next_action = 'need_details';
    plan.assistant_message = `Aspire understood this as ${plan.category}. I prepared the useful parts and left only the missing details for you.`;
  } else {
    plan.status = 'ready';
    plan.next_action = 'create_request';
    plan.assistant_message = `Aspire understood this as ${plan.category} and prepared the next step.`;
  }

  return plan;
}
