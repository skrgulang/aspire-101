-- Replace legacy profile-flag moderator access on public.tasks with the
-- authoritative MFA-gated user_roles authorization function.
--
-- This migration intentionally leaves owner/participant/public task policies
-- unchanged. It only removes staff access paths that depended on profiles.role
-- or profiles.is_moderator.

alter table public.tasks enable row level security;

drop policy if exists "Moderators manage all tasks" on public.tasks;
drop policy if exists tasks_full_for_moderators on public.tasks;
drop policy if exists tasks_staff_manage on public.tasks;

create policy tasks_staff_manage
on public.tasks
for all
to authenticated
using (public.is_moderator())
with check (public.is_moderator());
