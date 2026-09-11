import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`Resolution Center regression failed: ${label}`);
}

const centerSql = read('supabase/migrations/20260911012000_resolution_center.sql');
const followupSql = read('supabase/migrations/20260911014000_resolution_followup.sql');
const scheduleSql = read('supabase/migrations/20260911015000_schedule_agreement.sql');
const lockdownSql = read('supabase/migrations/20260911015100_schedule_agreement_lockdown.sql');
const releaseRoute = read('app/api/stripe/payment/release/route.ts');
const resolutionRoute = read('app/api/resolution/resolve/route.ts');

const checks = [
  [centerSql, "scheduled_start_at + interval '10 minutes'", 'no-show grace period must remain server-enforced'],
  [centerSql, 'connection_resolution_one_open_case_idx', 'only one open case per connection must remain enforced'],
  [centerSql, "status in ('submitted','under_review')", 'open-case states must remain explicit'],
  [releaseRoute, ".from('connection_resolution_cases')", 'payout release must query Resolution Center cases'],
  [releaseRoute, "code: 'RESOLUTION_CASE_OPEN'", 'payout release must stop while a case is open'],
  [releaseRoute, "payment.status !== 'secured'", 'payout release must require a secured payment'],
  [resolutionRoute, "payment.status !== 'secured'", 'automatic refund must require a secured payment'],
  [resolutionRoute, 'payment.stripe_transfer_id', 'automatic refund must refuse already-transferred provider funds'],
  [resolutionRoute, "role !== 'admin'", 'financial refunds must stay admin-only'],
  [resolutionRoute, 'resolutionCase.opened_by !== payment.payer_id', 'automatic customer refunds must come from payer-owned cases'],
  [resolutionRoute, 'aspire_resolution_refund_', 'refunds must stay idempotent'],
  [scheduleSql, 'The other participant must respond to this proposal', 'a proposer must not accept their own schedule change'],
  [scheduleSql, "status text not null default 'pending' check (status in ('pending','accepted','declined','superseded'))", 'schedule proposals must retain accepted/declined lifecycle states'],
  [lockdownSql, 'revoke execute on function public.set_connection_schedule', 'legacy direct schedule mutation must stay revoked'],
  [followupSql, "'connection_coordination'", 'coordination notifications must remain supported'],
  [followupSql, "'resolution_case'", 'Resolution Center notifications must remain supported'],
  [followupSql, 'connection_resolution_responses', 'both sides must retain a case-statement channel']
];

for (const [source, needle, label] of checks) requireText(source, needle, label);

console.log(`Resolution Center regression: ${checks.length}/${checks.length} safeguards passed`);
