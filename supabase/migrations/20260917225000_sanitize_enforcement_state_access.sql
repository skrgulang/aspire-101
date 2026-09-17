-- Users need to know whether their account is restricted and why, but they do
-- not need internal moderator identifiers or audit timestamps. Use column-level
-- privileges so browser clients can only read the public enforcement fields.

alter table public.user_enforcement_states enable row level security;

drop policy if exists "users read own enforcement state" on public.user_enforcement_states;
drop policy if exists "moderators read enforcement states" on public.user_enforcement_states;
drop policy if exists "enforcement owner or moderator read" on public.user_enforcement_states;

create policy "enforcement owner or moderator read"
on public.user_enforcement_states
for select
to authenticated
using ((select auth.uid()) = user_id or public.is_moderator());

revoke all privileges on table public.user_enforcement_states from anon;
revoke all privileges on table public.user_enforcement_states from authenticated;

-- These are the only fields needed by the member-facing posting gate and the
-- current moderator console. set_by/set_at/updated_at stay server-internal.
grant select (user_id, state, reason, expires_at)
on table public.user_enforcement_states
to authenticated;
