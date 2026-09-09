import { inferIntentHints, rankCandidatesForIntent } from '../lib/server/aspireBrain.js';

const classificationCases = [
  ['Need a ride to SFO Friday, can split $30', { category: 'Ride', kind: 'split_cost', amount_cents: 3000 }],
  ['selling my used monitor for $80', { category: 'Buy & sell', kind: 'buy_sell', market_intent: 'sell', amount_cents: 8000 }],
  ['looking for a math study group', { category: 'Study', kind: 'community' }],
  ['Need help moving a desk tomorrow', { category: 'Moving / help', kind: 'paid_help' }],
  ['Looking for a teammate for a hackathon project', { category: 'Project / collab', kind: 'collaboration' }]
];

for (const [input, expected] of classificationCases) {
  const actual = inferIntentHints(input);
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) throw new Error(`${input}: ${key}=${actual[key]} expected ${value}`);
  }
}

const candidates = [
  { id: 'study', title: 'Math 110 study group', details: 'review linear algebra', category: 'Study', kind: 'community', market_intent: null },
  { id: 'ride', title: 'Ride to SFO', details: 'Friday afternoon airport carpool', category: 'Ride', kind: 'split_cost', market_intent: null },
  { id: 'market', title: 'Desk for sale', details: 'wood desk', category: 'Buy & sell', kind: 'buy_sell', market_intent: 'sell' }
];

const ranked = rankCandidatesForIntent('ride to airport Friday', candidates, 2);
if (ranked[0]?.id !== 'ride') throw new Error(`ranking failed: ${ranked.map((item) => item.id).join(',')}`);

console.log('Aspire Brain regression: 6/6 passed');
