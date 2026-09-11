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
const cancellationSql = read('supabase/migrations/20260911016000_connection_cancellation.sql');
const cancellationHistory = read('app/CancellationHistory.tsx');
const cancellationQueries = read('lib/supabase/cancellations.ts');
const resolutionPage = read('app/resolution/page.tsx');
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
  [resolutionRoute, 'resolutionCase.opened_by !== payment.payer_id && !providerSelfCancelled', 'automatic refunds must remain payer-owned except verified provider self-cancellation'],
  [resolutionRoute, 'cancellationActorId === payment.payee_id', 'provider self-cancellation refund exception must require captured provider identity'],
  [resolutionRoute, 'evidence.voluntary_cancellation === true', 'provider self-cancellation refund exception must require explicit voluntary cancellation evidence'],
  [resolutionRoute, 'aspire_resolution_refund_', 'refunds must stay idempotent'],
  [scheduleSql, 'The other participant must respond to this proposal', 'a proposer must not accept their own schedule change'],
  [scheduleSql, "status text not null default 'pending' check (status in ('pending','accepted','declined','superseded'))", 'schedule proposals must retain accepted/declined lifecycle states'],
  [lockdownSql, 'revoke execute on function public.set_connection_schedule', 'legacy direct schedule mutation must stay revoked'],
  [followupSql, "'connection_coordination'", 'coordination notifications must remain supported'],
  [followupSql, "'resolution_case'", 'Resolution Center notifications must remain supported'],
  [followupSql, 'connection_resolution_responses', 'both sides must retain a case-statement channel'],
  [cancellationSql, 'cancel_connection_with_protection', 'participant cancellation must stay server-controlled'],
  [cancellationSql, "v_payment.status in ('processing','checkout_created')", 'cancellation must not race an unsettled checkout'],
  [cancellationSql, "v_payment.status in ('released','disputed')", 'post-release or disputed payments must route through Resolution Center'],
  [cancellationSql, "v_payment.status = 'secured'", 'secured payment cancellation must enter protected review'],
  [cancellationSql, "'cancellation_actor_id'", 'cancellation evidence must capture the actor'],
  [cancellationSql, "'voluntary_cancellation', true", 'explicit cancellation evidence must remain distinct from no-show'],
  [cancellationSql, "set status='cancelled'", 'participant cancellation must end the active connection'],
  [cancellationSql, "'connection_cancelled'", 'participant cancellation must create a shared timeline event'],
  [cancellationQueries, ".eq('event_type', 'connection_cancelled')", 'participant cancellation receipts must be loaded from the shared cancellation event'],
  [cancellationHistory, 'CANCELLATION RECEIPT', 'cancelled connections must retain a user-facing cancellation receipt'],
  [cancellationHistory, 'Cancellation records the event; it does not automatically assign fault', 'cancellation history must not imply automatic fault or financial outcome'],
  [cancellationHistory, 'Under Aspire review · provider payout paused', 'cancellation history must surface protected payment holds'],
  [resolutionPage, '<CancellationHistory />', 'cancelled connection history must remain reachable from Resolution Center']
];

for (const [source, needle, label] of checks) requireText(source, needle, label);

console.log(`Resolution Center regression: ${checks.length}/${checks.length} safeguards passed`);
