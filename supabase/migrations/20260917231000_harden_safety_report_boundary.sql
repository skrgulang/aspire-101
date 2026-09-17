-- Safety reports are user-submitted evidence, but review state and reviewer
-- identity are staff-owned. Restrict browser writes to report inputs only and
-- keep reviewer UUIDs private.

alter table public.safety_reports enable row level security;

drop policy if exists "safety report owner or moderator read" on public.safety_reports;
drop policy if exists "users submit their own reports" on public.safety_reports;

create policy "safety report owner or moderator read"
on public.safety_reports
for select
to authenticated
using ((select auth.uid()) = reporter_id or public.is_moderator());

create policy "users submit their own reports"
on public.safety_reports
for insert
to authenticated
with check ((select auth.uid()) = reporter_id);

revoke all privileges on table public.safety_reports from anon;
revoke all privileges on table public.safety_reports from authenticated;

-- Members can submit only the report evidence/context. id, status, created_at,
-- reviewed_at, and reviewed_by stay database/staff owned.
grant insert (
  reporter_id,
  target_user_id,
  request_id,
  connection_id,
  reason,
  details
) on table public.safety_reports to authenticated;

-- Reporter history and moderator queues can see report state, but not the
-- reviewer account UUID.
grant select (
  id,
  reporter_id,
  target_user_id,
  request_id,
  connection_id,
  reason,
  details,
  status,
  created_at,
  reviewed_at
) on table public.safety_reports to authenticated;
