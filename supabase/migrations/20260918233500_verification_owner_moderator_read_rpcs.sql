-- Move signed-in verification reads behind owner/moderator scoped RPCs.

create or replace function public.get_my_school_verification()
returns table(
  user_id uuid,
  school text,
  student_id text,
  status text,
  submitted_at timestamptz,
  review_note text,
  university_id uuid,
  verification_method text,
  school_email text,
  verified_at timestamptz
)
language sql
stable
security definer
set search_path = 'public'
as $function$
  select
    s.user_id, s.school, s.student_id, s.status, s.submitted_at,
    s.review_note, s.university_id, s.verification_method,
    s.school_email, s.verified_at
  from public.school_verifications s
  where auth.uid() is not null
    and s.user_id = auth.uid()
  limit 1;
$function$;

revoke all on function public.get_my_school_verification() from public, anon;
grant execute on function public.get_my_school_verification() to authenticated;

create or replace function public.moderator_fetch_school_verifications(p_limit integer default 200)
returns table(
  user_id uuid,
  school text,
  student_id text,
  status text,
  submitted_at timestamptz,
  review_note text,
  university_id uuid,
  verification_method text,
  school_email text,
  verified_at timestamptz
)
language plpgsql
stable
security definer
set search_path = 'public'
as $function$
begin
  if not public.is_moderator() then
    raise exception 'Moderator access required.';
  end if;

  return query
  select
    s.user_id, s.school, s.student_id, s.status, s.submitted_at,
    s.review_note, s.university_id, s.verification_method,
    s.school_email, s.verified_at
  from public.school_verifications s
  order by s.submitted_at asc
  limit greatest(1, least(coalesce(p_limit,200), 500));
end;
$function$;

revoke all on function public.moderator_fetch_school_verifications(integer) from public, anon;
grant execute on function public.moderator_fetch_school_verifications(integer) to authenticated;

create or replace function public.get_my_identity_verification()
returns table(
  user_id uuid,
  status text,
  verified_at timestamptz,
  last_error text
)
language sql
stable
security definer
set search_path = 'public'
as $function$
  select i.user_id, i.status, i.verified_at, i.last_error
  from public.identity_verifications i
  where auth.uid() is not null
    and i.user_id = auth.uid()
  limit 1;
$function$;

revoke all on function public.get_my_identity_verification() from public, anon;
grant execute on function public.get_my_identity_verification() to authenticated;
