import { inferIntentHints, inferNavigationIntent, rankCandidatesForIntent } from '../lib/server/aspireBrain.js';

const classificationCases = [
  ['Need a ride to SFO Friday, can split $30', { category: 'Ride', kind: 'split_cost', amount_cents: 3000 }],
  ['Need a ride to IND, I can pay 25 dollars', { category: 'Ride', kind: 'split_cost', amount_cents: 2500 }],
  ['airport carpool budget 40 bucks', { category: 'Ride', kind: 'split_cost', amount_cents: 4000 }],
  ['selling my used monitor for $80', { category: 'Buy & sell', kind: 'buy_sell', market_intent: 'sell', amount_cents: 8000 }],
  ['WTS laptop for USD 1,200', { category: 'Buy & sell', kind: 'buy_sell', market_intent: 'sell', amount_cents: 120000 }],
  ['looking for a math study group', { category: 'Study', kind: 'community' }],
  ['Need help moving a desk tomorrow', { category: 'Moving / help', kind: 'paid_help' }],
  ['Looking for a teammate for a hackathon project', { category: 'Project / collab', kind: 'collaboration' }],
  ['WTB bike near campus', { category: 'Buy & sell', kind: 'buy_sell', market_intent: 'wanted' }],
  ['WTS textbook for $25', { category: 'Buy & sell', kind: 'buy_sell', market_intent: 'sell', amount_cents: 2500 }],
  ['selling my math textbook', { category: 'Buy & sell', kind: 'buy_sell', market_intent: 'sell' }],
  ['WTB physics textbook', { category: 'Buy & sell', kind: 'buy_sell', market_intent: 'wanted' }],
  ['Can someone buy groceries for me?', { category: 'Pickup / errand', kind: 'paid_help' }],
  ['Could someone grab medicine for me tonight?', { category: 'Pickup / errand', kind: 'paid_help' }],
  ['I want to buy a used bike', { category: 'Buy & sell', kind: 'buy_sell', market_intent: 'wanted' }],
  ['WTS sealed monitor $80 OBO', { category: 'Buy & sell', kind: 'buy_sell', market_intent: 'sell', amount_cents: 8000, item_condition: 'new', price_negotiable: true }],
  ['Selling laptop in like new condition, price firm', { category: 'Buy & sell', kind: 'buy_sell', market_intent: 'sell', item_condition: 'like_new', price_negotiable: false }],
  ['WTS broken phone for parts only $20', { category: 'Buy & sell', kind: 'buy_sell', market_intent: 'sell', amount_cents: 2000, item_condition: 'for_parts' }],
  ['Selling desk in good condition, open to offers', { category: 'Buy & sell', kind: 'buy_sell', market_intent: 'sell', item_condition: 'good', price_negotiable: true }]
];

for (const [input, expected] of classificationCases) {
  const actual = inferIntentHints(input);
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) throw new Error(`${input}: ${key}=${actual[key]} expected ${value}`);
  }
}

const explicitEntityCases = [
  ['Need a ride to SFO tomorrow', { time_text: 'tomorrow', place_text: 'SFO' }],
  ['Study group near PMU tonight', { time_text: 'tonight', place_text: 'PMU' }],
  ['Need moving help at WALC after 5 pm', { time_text: 'after 5 pm', place_text: 'WALC' }]
];
for (const [input, expected] of explicitEntityCases) {
  const actual = inferIntentHints(input);
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) throw new Error(`${input}: ${key}=${actual[key]} expected ${value}`);
  }
}
const noInventedEntities = inferIntentHints('Need a math study partner');
if (noInventedEntities.time_text || noInventedEntities.place_text) throw new Error('Brain must not invent missing time/place hints');

const ambiguousPurchase = inferIntentHints('Where can I buy groceries?');
if (ambiguousPurchase.category !== 'Pickup / errand') throw new Error('grocery discovery should stay in the grocery/errand domain without becoming marketplace');

const candidates = [
  { id: 'study', title: 'Math 110 study group', details: 'review linear algebra', category: 'Study', kind: 'community', market_intent: null },
  { id: 'ride', title: 'Ride to SFO', details: 'Friday afternoon airport carpool', category: 'Ride', kind: 'split_cost', market_intent: null },
  { id: 'market', title: 'Desk for sale', details: 'wood desk', category: 'Buy & sell', kind: 'buy_sell', market_intent: 'sell' }
];

const ranked = rankCandidatesForIntent('ride to airport Friday', candidates, 2);
if (ranked[0]?.id !== 'ride') throw new Error(`ranking failed: ${ranked.map((item) => item.id).join(',')}`);

const marketplaceCandidates = [
  { id: 'seller', title: 'Bike for sale', details: 'campus commuter bike', category: 'Buy & sell', kind: 'buy_sell', market_intent: 'sell' },
  { id: 'buyer', title: 'Wanted bike', details: 'looking for a campus bike', category: 'Buy & sell', kind: 'buy_sell', market_intent: 'wanted' }
];

const buyRanked = rankCandidatesForIntent('WTB bike', marketplaceCandidates, 2);
if (buyRanked[0]?.id !== 'seller') throw new Error(`buyer reciprocal ranking failed: ${buyRanked.map((item) => item.id).join(',')}`);

const sellRanked = rankCandidatesForIntent('WTS bike', marketplaceCandidates, 2);
if (sellRanked[0]?.id !== 'buyer') throw new Error(`seller reciprocal ranking failed: ${sellRanked.map((item) => item.id).join(',')}`);

const studyDistractors = [
  { id: 'textbook', title: 'Math textbook for sale', details: 'calculus book', category: 'Buy & sell', kind: 'buy_sell', market_intent: 'sell' },
  { id: 'study-partner', title: 'Math study partner', details: 'review homework together', category: 'Study', kind: 'community', market_intent: null }
];
const studyRanked = rankCandidatesForIntent('looking for math study help', studyDistractors, 2);
if (studyRanked[0]?.id !== 'study-partner') throw new Error(`category precision failed: ${studyRanked.map((item) => item.id).join(',')}`);
if (studyRanked.some((item) => item.id === 'textbook')) throw new Error('wrong-category keyword distractor should not survive structured ranking');

const onlyWrongCategory = [
  { id: 'math-book', title: 'Math book', details: 'textbook for sale', category: 'Buy & sell', kind: 'buy_sell', market_intent: 'sell' }
];
const noMatch = rankCandidatesForIntent('need a math study group', onlyWrongCategory, 12);
if (noMatch.length !== 0) throw new Error('structured intent should not fall back to irrelevant recent candidates');

const navigationCases = [
  ['open connections', '/connections'],
  ['show my inbox', '/connections'],
  ['open my messages', '/connections'],
  ['show me saved', '/saved'],
  ['open my saved', '/saved'],
  ['go to profile', '/profile'],
  ['show my profile', '/profile'],
  ['payments', '/money'],
  ['open my wallet', '/money'],
  ['take me to discover', '/discover'],
  ['create post', '/post'],
  ['view activity', '/activity'],
  ['open safety', '/safety']
];

for (const [input, expectedRoute] of navigationCases) {
  const actual = inferNavigationIntent(input);
  if (actual?.route !== expectedRoute) throw new Error(`${input}: route=${actual?.route} expected ${expectedRoute}`);
}

const negativeNavigationCases = [
  'show me people who can help with math',
  'find a study partner',
  'I need help with a payment for a ride',
  'post a request for moving help',
  'show my payment request for the airport'
];

for (const input of negativeNavigationCases) {
  if (inferNavigationIntent(input)) throw new Error(`${input}: should not be treated as direct navigation`);
}

console.log('Aspire Brain regression: 46/46 passed');
