import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const tempDir = mkdtempSync(join(tmpdir(), 'aspire-brain-regression-'));
const tsc = resolve('node_modules/typescript/bin/tsc');

try {
  execFileSync(process.execPath, [tsc, '--target','ES2022','--module','commonjs','--moduleResolution','node','--rootDir','lib/aspire-brain','--outDir',tempDir,'--skipLibCheck','lib/aspire-brain/index.ts','lib/aspire-brain/entities.ts','lib/aspire-brain/intent.ts','lib/aspire-brain/matcher.ts','lib/aspire-brain/planner.ts','lib/aspire-brain/campusKnowledge.ts'], { stdio: 'inherit' });
  const require = createRequire(import.meta.url);
  const { looksLikeAspireAction, parseAspireIntent, runAspireBrain } = require(join(tempDir, 'index.js'));
  const { extractAspireEntities } = require(join(tempDir, 'entities.js'));
  let checks = 0;
  function check(condition, message) { checks += 1; if (!condition) throw new Error(message); }

  const intentCases = [
    ['Need a ride to SFO Friday','FIND_OR_CREATE_RIDE','Ride'],
    ['WTS laptop for USD 1,200','SELL_ITEM','Buy & sell'],
    ['WTB bike near campus','FIND_ITEM','Buy & sell'],
    ['selling my Math 110 textbook for $25','SELL_ITEM','Buy & sell'],
    ['looking for a Math 110 study partner','FIND_STUDY','Study'],
    ['Need help moving a desk tomorrow','GET_HELP','Moving / help'],
    ['Looking for a frontend teammate for a hackathon project','FIND_PROJECT','Project / collab'],
    ['Can someone pick up my Target order?','RUN_ERRAND','Pickup / errand'],
    ['Can someone buy groceries for me?','RUN_ERRAND','Pickup / errand'],
    ['Could someone grab medicine for me tonight?','RUN_ERRAND','Pickup / errand']
  ];
  for (const [input, expectedIntent, expectedCategory] of intentCases) {
    const actual = parseAspireIntent(input);
    check(actual.intent === expectedIntent && actual.category === expectedCategory, `${input}: got ${actual.intent}/${actual.category}`);
  }
  check(parseAspireIntent('I want to buy a used bike').intent === 'FIND_ITEM', 'ordinary item purchase should remain marketplace intent');
  check(parseAspireIntent('Where can I buy groceries?').intent !== 'RUN_ERRAND', 'shopping information should not become a person-to-person errand');
  check(looksLikeAspireAction('WTB bike near campus'), 'WTB item shorthand should be routed as an Aspire action');
  check(looksLikeAspireAction('WTS monitor $80'), 'WTS item shorthand should be routed as an Aspire action');
  check(!looksLikeAspireAction('what is WTB'), 'A definition question about WTB should not be routed as an Aspire action');

  const sellEntities = extractAspireEntities('WTS laptop for USD 1,200', 'SELL_ITEM');
  check(sellEntities.item.toLowerCase() === 'laptop', `WTS item extraction failed: ${sellEntities.item}`);
  check(sellEntities.amountCents === 120000, `USD comma amount failed: ${sellEntities.amountCents}`);
  const compactSellEntities = extractAspireEntities('WTS monitor $80', 'SELL_ITEM');
  check(compactSellEntities.item.toLowerCase() === 'monitor', `compact WTS item extraction failed: ${compactSellEntities.item}`);
  check(compactSellEntities.amountCents === 8000, `compact WTS amount failed: ${compactSellEntities.amountCents}`);
  const rideEntities = extractAspireEntities('Need a ride to IND, I can pay 25 dollars', 'FIND_OR_CREATE_RIDE');
  check(rideEntities.amountCents === 2500, `word amount failed: ${rideEntities.amountCents}`);

  const now = new Date().toISOString();
  const marketCandidates = [
    { id:'seller',poster_id:'u1',title:'Bike for sale',details:'campus commuter bike',category:'Buy & sell',kind:'buy_sell',amount_cents:7000,market_intent:'sell',item_condition:'good',price_negotiable:false,fulfillment_method:'campus_pickup',created_at:now },
    { id:'buyer',poster_id:'u2',title:'Wanted bike',details:'looking for a campus bike',category:'Buy & sell',kind:'buy_sell',amount_cents:6000,market_intent:'wanted',item_condition:null,price_negotiable:false,fulfillment_method:'campus_pickup',created_at:now }
  ];
  const buyPlan = runAspireBrain('WTB bike near campus','Purdue',marketCandidates);
  check(buyPlan.handled === true, 'WTB should be handled locally instead of reaching OpenAI fallback');
  check(buyPlan.matches[0]?.id === 'seller', `WTB should rank a seller first: ${buyPlan.matches.map((item) => item.id).join(',')}`);
  const sellPlan = runAspireBrain('WTS bike for $80','Purdue',marketCandidates);
  check(sellPlan.handled === true, 'WTS should be handled locally instead of reaching OpenAI fallback');
  check(sellPlan.matches[0]?.id === 'buyer', `WTS should rank a wanted buyer first: ${sellPlan.matches.map((item) => item.id).join(',')}`);
  check(sellPlan.plan?.amount_cents === 8000, `WTS draft amount failed: ${sellPlan.plan?.amount_cents}`);
  check(sellPlan.plan?.payment_method === 'aspire', `WTS paid draft should use Aspire payment: ${sellPlan.plan?.payment_method}`);

  const studyCandidates = [
    { id:'textbook',poster_id:'u3',title:'Math 110 textbook for sale',details:'linear algebra book',category:'Buy & sell',kind:'buy_sell',amount_cents:3000,market_intent:'sell',item_condition:'good',price_negotiable:false,fulfillment_method:'campus_pickup',created_at:now },
    { id:'study',poster_id:'u4',title:'Math 110 study partner',details:'review homework together',category:'Study',kind:'community',amount_cents:null,market_intent:null,item_condition:null,price_negotiable:false,fulfillment_method:null,created_at:now }
  ];
  const studyPlan = runAspireBrain('looking for a Math 110 study partner','Purdue',studyCandidates);
  check(studyPlan.handled === true && studyPlan.matches[0]?.id === 'study', 'Study matching should reject marketplace keyword distractors');

  const errandPlan = runAspireBrain('Can someone buy groceries for me?','Purdue',[]);
  check(errandPlan.handled === true && errandPlan.intent.intent === 'RUN_ERRAND', 'purchase errand should be handled locally instead of reaching OpenAI fallback');
  console.log(`Aspire Brain active-engine regression: ${checks}/${checks} passed`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
