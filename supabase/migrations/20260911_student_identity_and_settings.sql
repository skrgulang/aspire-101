-- Student identity fields + private app preferences.
-- Public profile access is exposed through a narrow RPC so precise/private account data is never part of the profile payload.

alter table public.profiles
  add column if not exists major text null,
  add column if not exists graduation_year smallint null,
  add column if not exists interests text[] not null default '{}'::text[];

alter table public.profiles drop constraint if exists profiles_major_length_check;
alter table public.profiles add constraint profiles_major_length_check check (major is null or char_length(btrim(major)) between 1 and 120);
alter table public.profiles drop constraint if exists profiles_graduation_year_check;
alter table public.profiles add constraint profiles_graduation_year_check check (graduation_year is null or graduation_year between 2020 and 2045);
alter table public.profiles drop constraint if exists profiles_interests_count_check;
alter table public.profiles add constraint profiles_interests_count_check check (cardinality(interests) <= 12);
alter table public.profiles drop constraint if exists profiles_bio_length_check;
alter table public.profiles add constraint profiles_bio_length_check check (bio is null or char_length(bio) <= 240);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  location_mode text not null default 'off' check (location_mode in ('off','approximate','precise_on_request')),
  profile_visibility text not null default 'connections' check (profile_visibility in ('private','connections','campus')),
  show_major boolean not null default true,
  show_graduation_year boolean not null default true,
  show_interests boolean not null default true,
  show_completed boolean not null default true,
  show_joined boolean not null default true,
  ai_personalization boolean not null default true,
  notify_messages boolean not null default true,
  notify_connections boolean not null default true,
  notify_post_updates boolean not null default true,
  notify_payments boolean not null default true,
  notify_safety boolean not null default true,
  notify_marketing boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;
drop policy if exists "users read own preferences" on public.user_preferences;
create policy "users read own preferences" on public.user_preferences for select to authenticated using (user_id = auth.uid());
drop policy if exists "users insert own preferences" on public.user_preferences;
create policy "users insert own preferences" on public.user_preferences for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "users update own preferences" on public.user_preferences;
create policy "users update own preferences" on public.user_preferences for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on table public.user_preferences from anon;
grant select, insert, update on table public.user_preferences to authenticated;
grant all on table public.user_preferences to service_role;

drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at before update on public.user_preferences for each row execute function public.set_updated_at();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_university_id uuid;
  v_school text;
  v_graduation_year smallint;
  v_interests text[] := '{}'::text[];
begin
  v_university_id := public.university_for_email(new.email);
  select u.name into v_school from public.universities u where u.id = v_university_id;

  if coalesce(new.raw_user_meta_data->>'graduation_year','') ~ '^\d{4}$' then
    v_graduation_year := (new.raw_user_meta_data->>'graduation_year')::smallint;
    if v_graduation_year < 2020 or v_graduation_year > 2045 then v_graduation_year := null; end if;
  end if;

  if jsonb_typeof(new.raw_user_meta_data->'interests') = 'array' then
    select coalesce(array_agg(distinct left(btrim(value),40)) filter (where btrim(value) <> ''), '{}'::text[])
      into v_interests
    from jsonb_array_elements_text(new.raw_user_meta_data->'interests') as value;
    v_interests := v_interests[1:12];
  end if;

  insert into public.profiles (id,email,display_name,name,full_name,school,city,home_campus_id,major,graduation_year,interests)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data->>'display_name',''),
    nullif(new.raw_user_meta_data->>'display_name',''),
    nullif(new.raw_user_meta_data->>'display_name',''),
    v_school,
    nullif(new.raw_user_meta_data->>'city',''),
    v_university_id,
    nullif(left(btrim(coalesce(new.raw_user_meta_data->>'major','')),120),''),
    v_graduation_year,
    coalesce(v_interests,'{}'::text[])
  )
  on conflict (id) do update set
    email=excluded.email,
    school=coalesce(excluded.school, public.profiles.school),
    home_campus_id=coalesce(excluded.home_campus_id, public.profiles.home_campus_id),
    major=coalesce(excluded.major, public.profiles.major),
    graduation_year=coalesce(excluded.graduation_year, public.profiles.graduation_year),
    interests=case when cardinality(excluded.interests)>0 then excluded.interests else public.profiles.interests end,
    updated_at=now();

  insert into public.user_preferences(user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function public.get_public_student_profile(p_user_id uuid)
returns table(
  user_id uuid,
  display_name text,
  avatar_url text,
  school text,
  major text,
  graduation_year smallint,
  bio text,
  interests text[],
  completed_count bigint,
  joined_at timestamptz,
  school_verified boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select id, home_campus_id from public.profiles where id = auth.uid()
  ), target as (
    select p.*,
      coalesce(pref.profile_visibility,'connections') as profile_visibility,
      coalesce(pref.show_major,true) as show_major,
      coalesce(pref.show_graduation_year,true) as show_graduation_year,
      coalesce(pref.show_interests,true) as show_interests,
      coalesce(pref.show_completed,true) as show_completed,
      coalesce(pref.show_joined,true) as show_joined
    from public.profiles p
    left join public.user_preferences pref on pref.user_id=p.id
    where p.id=p_user_id
  ), allowed as (
    select t.* from target t
    where auth.uid() is not null and (
      auth.uid()=t.id
      or (t.profile_visibility='campus' and exists (select 1 from viewer v where v.home_campus_id is not null and v.home_campus_id=t.home_campus_id))
      or (t.profile_visibility='connections' and exists (
        select 1 from public.connections c
        where ((c.requester_id=auth.uid() and c.responder_id=t.id) or (c.responder_id=auth.uid() and c.requester_id=t.id))
          and c.status in ('confirmed','active','completed')
      ))
    )
  )
  select
    a.id,
    coalesce(nullif(a.display_name,''),nullif(a.name,''),'Aspire student'),
    coalesce(nullif(a.avatar_url,''),nullif(a.image_url,'')),
    a.school,
    case when a.show_major then a.major end,
    case when a.show_graduation_year then a.graduation_year end,
    a.bio,
    case when a.show_interests then a.interests else '{}'::text[] end,
    case when a.show_completed then (
      select count(*) from public.connections c
      where c.status='completed' and (c.requester_id=a.id or c.responder_id=a.id)
    ) else null end,
    case when a.show_joined then a.created_at end,
    exists (select 1 from public.school_verifications sv where sv.user_id=a.id and sv.status='verified')
  from allowed a;
$$;

revoke all on function public.get_public_student_profile(uuid) from public;
grant execute on function public.get_public_student_profile(uuid) to authenticated;
