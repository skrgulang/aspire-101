import assert from 'node:assert/strict';
// @ts-ignore Node's built-in type stripping executes the source .ts module directly.
import { planDeterministically, type BrainCandidate } from '../lib/aspireBrain.ts';

const candidates: BrainCandidate[] = [
  {
    id: 'ride-ind-friday', title: 'Ride to IND Friday evening', details: 'Leaving campus around 6 pm, splitting gas.',
    category: 'Ride', kind: 'split_cost', amount_cents: null, market_intent: null, item_condition: null,
    price_negotiable: null, fulfillment_method: null, created_at: '2026-09-08T12:00:00Z'
  },
  {
    id: 'calc-study', title: 'Calculus study group tomorrow', details: 'Reviewing exam problems at 7 pm.',
    category: 'Study', kind: 'community', amount_cents: null, market_intent: null, item_condition: null,
    price_negotiable: null, fulfillment_method: null, created_at: '2026-09-08T12:00:00Z'
  },
  {
    id: 'fridge-sale', title: 'For sale: mini fridge', details: 'Good condition, pickup near campus.',
    category: 'Buy & sell', kind: 'buy_sell', amount_cents: 7500, market_intent: 'sell', item_condition: 'good',
    price_negotiable: true, fulfillment_method: 'pickup', created_at: '2026-09-08T12:00:00Z'
  }
];

type Expected = {
  message: string;
  category?: string;
  kind?: string;
  marketIntent?: string | null;
  amount?: number | null;
  condition?: string | null;
  negotiable?: boolean | null;
  timeIncludes?: string;
  place?: string;
  nextAction?: string;
  shouldPlan?: boolean;
};

const cases: Expected[] = [
  { message: 'Need a ride to IND Friday at 6pm, happy to split gas', category: 'Ride', kind: 'split_cost', place: 'IND', timeIncludes: 'Friday', nextAction: 'join_existing' },
  { message: 'Selling my mini fridge for $80, good condition, price negotiable, pickup near campus', category: 'Buy & sell', kind: 'buy_sell', marketIntent: 'sell', amount: 8000, condition: 'good', negotiable: true },
  { message: 'Looking to buy a desk for $40', category: 'Buy & sell', kind: 'buy_sell', marketIntent: 'wanted', amount: 4000 },
  { message: 'Study group for Math 110 tomorrow at 7pm', category: 'Study', kind: 'community', timeIncludes: 'tomorrow', nextAction: 'join_existing' },
  { message: 'Need someone to help move a couch, offering $25', category: 'Moving / help', kind: 'paid_help', amount: 2500 },
  { message: 'Need a frontend developer for our hackathon project', category: 'Project / collab', kind: 'collaboration' },
  { message: 'Can someone pick up my grocery order? I can pay $12', category: 'Pickup / errand', kind: 'paid_help', amount: 1200 },
  { message: 'Selling a chair, like new, $30 firm', category: 'Buy & sell', kind: 'buy_sell', marketIntent: 'sell', amount: 3000, condition: 'like_new', negotiable: false },
  { message: 'I need something', shouldPlan: false },
  { message: 'What should I do tonight?', shouldPlan: false }
];

let planned = 0;
for (const test of cases) {
  const plan = planDeterministically(test.message, candidates);
  if (test.shouldPlan === false) {
    assert.equal(plan, null, `Expected fallback for: ${test.message}`);
    continue;
  }
  assert.ok(plan, `Expected deterministic plan for: ${test.message}`);
  planned += 1;
  if (test.category) assert.equal(plan.category, test.category, test.message);
  if (test.kind) assert.equal(plan.kind, test.kind, test.message);
  if ('marketIntent' in test) assert.equal(plan.market_intent, test.marketIntent, test.message);
  if ('amount' in test) assert.equal(plan.amount_cents, test.amount, test.message);
  if ('condition' in test) assert.equal(plan.item_condition, test.condition, test.message);
  if ('negotiable' in test) assert.equal(plan.price_negotiable, test.negotiable, test.message);
  if (test.timeIncludes) assert.ok(plan.time_text.toLowerCase().includes(test.timeIncludes.toLowerCase()), test.message);
  if (test.place) assert.equal(plan.place_text, test.place, test.message);
  if (test.nextAction) assert.equal(plan.next_action, test.nextAction, test.message);
}

const deterministicCoverage = planned / cases.length;
assert.ok(deterministicCoverage >= 0.8, `Expected >=80% deterministic coverage, got ${deterministicCoverage}`);
console.log(JSON.stringify({ cases: cases.length, planned, deterministicCoverage, status: 'pass' }, null, 2));
