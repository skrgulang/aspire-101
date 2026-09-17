-- Route legacy school-ID submissions through a validated RPC and expose only
-- the verification fields current member/moderator UIs actually need.

alter table public.school_verifications enable row level security;

drop policy if exists "school verification owner insert" on public.school_verifications;
drop policy if exists "school verification owner resubmit" on public.school_verifications;
drop policy if exists "school verification owner or moderator read" on public.school_verifications;

create policy "school verification owner or moderator read"
on public.school_verifications
for select
to authenticated
using ((select auth.uid()) = user_id or public.is_moderator());

-- Browser sessions no longer write verification/provider metadata directly.
-- Server/service workflows retain their own role privileges.
revoke all privileges on table public.school_verifications from anon;
revoke all privileges on table public.school_verifications from authenticated;

grant select (
  user_id,
  school,
  student_id,
  status,
  submitted_at,
  review_note,
  verification_method,
  school_email,
  verified_at
) on table public.school_verifications to authenticated;

create or replace function public.submit_school_verification(
  p_school text,
  p_student_id text
)
returns table (
  user_id uuid,
  school text,
  student_id text,
  status text,
  submitted_at timestamptz,
  review_note text,
  verification_method text,
  school_email text,
  verified_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_school text := trim(coalesce(p_school, ''));
  v_student_id text := trim(coalesce(p_student_id, ''));
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if length(v_school) < 2 or length(v_school) > 200 then
    raise exception 'INVALID_SCHOOL';
  end if;
  if length(v_student_id) < 3 or length(v_student_id) > 64 then
    raise exception 'INVALID_STUDENT_ID';
  end if;
  if exists (
    select 1 from public.school_verifications sv
    where sv.user_id = v_user_id and sv.status = 'verified'
  ) then
    raise exception 'ALREADY_VERIFIED';
  end if;

  insert into public.school_verifications (
    user_id,
    school,
    student_id,
    status,
    submitted_at,
    updated_at,
    reviewed_at,
    reviewed_by,
    review_note,
    verification_method,
    school_email,
    verified_at,
    verification_provider,
    provider_verification_id,
    provider_status
  ) values (
    v_user_id,
    v_school,
    v_student_id,
    'pending',
    now(),
    now(),
    null,
    null,
    null,
    'manual_id',
    null,
    null,
    'aspire',
    null,
    'pending_manual_review'
  )
  on conflict (user_id) do update set
    school = excluded.school,
    student_id = excluded.student_id,
    status = 'pending',
    submitted_at = now(),
    updated_at = now(),
    reviewed_at = null,
    reviewed_by = null,
    review_note = null,
    verification_method = 'manual_id',
    school_email = null,
    verified_at = null,
    verification_provider = 'aspire',
    provider_verification_id = null,
    provider_status = 'pending_manual_review';

  return query
  select
    sv.user_id,
    sv.school,
    sv.student_id,
    sv.status,
    sv.submitted_at,
    sv.review_note,
    sv.verification_method,
    sv.school_email,
    sv.verified_at
  from public.school_verifications sv
  where sv.user_id = v_user_id;
end;
$$;

revoke all on function public.submit_school_verification(text, text) from public, anon;
grant execute on function public.submit_school_verification(text, text) to authenticated, service_role;
