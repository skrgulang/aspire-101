-- Defense-in-depth for internal moderation records. RLS remains the row-level
-- gate for staff reads; browser roles do not need to mutate these tables.

alter table public.request_ai_assessments enable row level security;
alter table public.request_layered_moderation_audit enable row level security;
alter table public.moderation_actions enable row level security;

-- Keep the intended moderator-only read policies explicit.
drop policy if exists "moderators read ai assessments" on public.request_ai_assessments;
create policy "moderators read ai assessments"
on public.request_ai_assessments
for select
to authenticated
using (public.is_moderator());

drop policy if exists "request_layered_moderation_audit_moderator_read" on public.request_layered_moderation_audit;
create policy "request_layered_moderation_audit_moderator_read"
on public.request_layered_moderation_audit
for select
to authenticated
using (public.is_moderator());

drop policy if exists "moderators read moderation actions" on public.moderation_actions;
create policy "moderators read moderation actions"
on public.moderation_actions
for select
to authenticated
using (public.is_moderator());

-- Anonymous clients should have no table privileges on internal moderation data.
revoke all privileges on table public.request_ai_assessments from anon;
revoke all privileges on table public.request_layered_moderation_audit from anon;
revoke all privileges on table public.moderation_actions from anon;

-- Authenticated browser clients only need staff-gated reads. AI assessment and
-- audit/action writes happen through service-role server code or DB triggers.
revoke insert, update, delete, truncate, references, trigger on table public.request_ai_assessments from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.request_layered_moderation_audit from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.moderation_actions from authenticated;

grant select on table public.request_ai_assessments to authenticated;
grant select on table public.request_layered_moderation_audit to authenticated;
grant select on table public.moderation_actions to authenticated;
