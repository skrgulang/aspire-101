-- Give the profile page a self-only read/write surface for editable student details.
-- This avoids widening generic browser column grants for major, graduation year, and interests.

create or replace function public.get_my_profile_details()
returns table (
  display_name text,
  name text,
  full_name text,
  school text,
  home_campus_id uuid,
  current_campus_id uuid,
  avatar_url text,
  image_url text,
  major text,
  graduation_year smallint,
  bio text,
  interests text[],
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  return query
  select
    p.display_name,
    p.name,
    p.full_name,
    p.school,
    p.home_campus_id,
    p.current_campus_id,
    p.avatar_url,
    p.image_url,
    p.major,
    p.graduation_year,
    p.bio,
    coalesce(p.interests, '{}'::text[]),
    p.created_at
  from public.profiles p
  where p.id = auth.uid();
end;
$$;

create or replace function public.update_my_profile_details(
  p_display_name text,
  p_major text default null,
  p_graduation_year smallint default null,
  p_bio text default null,
  p_interests text[] default '{}'::text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_display_name, ''));
  v_major text := nullif(left(btrim(coalesce(p_major, '')), 120), '');
  v_bio text := nullif(left(btrim(coalesce(p_bio, '')), 240), '');
  v_interests text[] := '{}'::text[];
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'INVALID_DISPLAY_NAME';
  end if;

  if p_graduation_year is not null and (p_graduation_year < 2020 or p_graduation_year > 2045) then
    raise exception 'INVALID_GRADUATION_YEAR';
  end if;

  select coalesce(array_agg(clean order by first_pos), '{}'::text[])
  into v_interests
  from (
    select clean, min(ord) as first_pos
    from (
      select left(btrim(value), 40) as clean, ord
      from unnest(coalesce(p_interests, '{}'::text[])) with ordinality as x(value, ord)
      where btrim(value) <> ''
    ) normalized
    group by clean
    order by min(ord)
    limit 8
  ) deduped;

  update public.profiles
  set display_name = v_name,
      major = v_major,
      graduation_year = p_graduation_year,
      bio = v_bio,
      interests = v_interests,
      updated_at = now()
  where id = auth.uid();

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;
end;
$$;

create or replace function public.repair_my_profile_campus()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_university_id uuid;
  v_school text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select u.email into v_email
  from auth.users u
  where u.id = auth.uid()
    and u.email_confirmed_at is not null;

  if v_email is null then
    return false;
  end if;

  v_university_id := public.university_for_email(v_email);
  if v_university_id is null then
    return false;
  end if;

  select u.name into v_school
  from public.universities u
  where u.id = v_university_id
    and u.active = true;

  if v_school is null then
    return false;
  end if;

  update public.profiles p
  set home_campus_id = coalesce(p.home_campus_id, v_university_id),
      current_campus_id = coalesce(p.current_campus_id, v_university_id),
      school = coalesce(nullif(btrim(p.school), ''), v_school),
      updated_at = now()
  where p.id = auth.uid()
    and (
      p.home_campus_id is null
      or p.current_campus_id is null
      or nullif(btrim(p.school), '') is null
    );

  return true;
end;
$$;

revoke all on function public.get_my_profile_details() from PUBLIC, anon;
revoke all on function public.update_my_profile_details(text,text,smallint,text,text[]) from PUBLIC, anon;
revoke all on function public.repair_my_profile_campus() from PUBLIC, anon;

grant execute on function public.get_my_profile_details() to authenticated, service_role;
grant execute on function public.update_my_profile_details(text,text,smallint,text,text[]) to authenticated, service_role;
grant execute on function public.repair_my_profile_campus() to authenticated, service_role;
