-- PREVIEW-ONLY bootstrap for Supabase development branches.
--
-- Why this exists:
-- production contains a few legacy objects that predate the tracked migration chain.
-- A clean Supabase branch replays migrations from history, so those legacy objects must be
-- recreated first or the replay stops before current Aspire migrations can be validated.
--
-- DO NOT apply this file to production as a normal migration. It is only for disposable
-- preview/development databases created to validate migration reproducibility.

create extension if not exists citext;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  school text,
  city text,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text,
  phone text,
  email text,
  email_type text,
  avatar_url text,
  username citext,
  username_norm text,
  bio text,
  role text,
  full_name text,
  is_moderator boolean not null default false,
  home_campus_id uuid,
  current_campus_id uuid,
  campus_last_selected_at timestamptz,
  avatar_moderation_status text not null default 'none',
  avatar_pending_path text,
  avatar_moderation_review_id uuid,
  avatar_moderation_summary text,
  avatar_moderation_updated_at timestamptz,
  major text,
  graduation_year smallint,
  interests text[] not null default '{}'::text[]
);

alter table public.profiles enable row level security;

create table if not exists public.banned_patterns (
  pattern text primary key,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.banned_words (
  word citext primary key
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  title text not null,
  description text,
  budget numeric,
  status text not null default 'pending',
  created_at timestamptz default now(),
  owner uuid,
  details text,
  city text,
  latitude double precision,
  longitude double precision,
  updated_at timestamptz,
  owner_id uuid default auth.uid(),
  lat double precision,
  lng double precision,
  poster_name text,
  ip_location text,
  accepted_by uuid,
  accepted_at timestamptz,
  accepted_name text,
  moderation_reason text,
  moderated_by uuid,
  moderated_at timestamptz,
  created_by uuid,
  anonymous boolean not null default false,
  has_detailed_address boolean not null default false,
  detailed_address text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  mod_reason text
);

create table if not exists public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance_cents integer not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function public.make_obf_regex(raw text)
returns text
language sql
immutable
as $$ select nullif(btrim(raw), '') $$;

create or replace function public.add_banned_pattern(raw text, note text default null)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_pattern text := public.make_obf_regex(raw);
begin
  if v_pattern is null or v_pattern = '' then return; end if;
  insert into public.banned_patterns(pattern, note)
  values (v_pattern, note)
  on conflict (pattern) do nothing;
end;
$$;

create or replace function public.add_banned_patterns(raw_words text[], note text default null)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  w text;
begin
  foreach w in array raw_words loop
    perform public.add_banned_pattern(w, note);
  end loop;
end;
$$;

create or replace function public.upsert_my_profile(
  p_name text default null,
  p_school text default null,
  p_city text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.profiles (id, name, school, city, phone, email)
  values (
    auth.uid(),
    p_name,
    p_school,
    p_city,
    (select phone from auth.users where id = auth.uid()),
    (select email from auth.users where id = auth.uid())
  )
  on conflict (id) do update
  set name = coalesce(excluded.name, public.profiles.name),
      school = coalesce(excluded.school, public.profiles.school),
      city = coalesce(excluded.city, public.profiles.city),
      phone = coalesce(excluded.phone, public.profiles.phone),
      email = coalesce(excluded.email, public.profiles.email),
      updated_at = now();
$$;

create or replace function public.claim_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task record;
  v_me uuid := auth.uid();
  v_name text;
begin
  if v_me is null then raise exception 'not signed in'; end if;
  select * into v_task from public.tasks where id = p_task_id for update;
  if v_task is null then raise exception 'task not found'; end if;
  if v_task.user_id = v_me then raise exception 'cannot claim own task'; end if;
  if v_task.status is distinct from 'approved' then raise exception 'cannot claim until task is approved'; end if;
  if v_task.accepted_by is not null then raise exception 'already claimed'; end if;
  select coalesce(u.raw_user_meta_data->>'full_name', u.email, 'Member') into v_name from auth.users u where u.id = v_me;
  update public.tasks set accepted_by = v_me, accepted_name = v_name, status = 'claimed', updated_at = now() where id = p_task_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- The following legacy functions only need their historical signatures to exist so later
-- hardening migrations can revoke/grant privileges during a clean preview replay. V2 does not
-- route new product behavior through them.
create or replace function public.get_or_create_room(p_task_id uuid)
returns uuid language plpgsql security definer set search_path = public, auth
as $$ begin raise exception 'legacy room bootstrap only'; end; $$;

create or replace function public.create_room_on_claim()
returns trigger language plpgsql security definer set search_path = public, auth
as $$ begin return new; end; $$;

create or replace function public.set_poster_name()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  if new.poster_name is null or new.poster_name = '' then
    select coalesce(p.username::text, 'Member') into new.poster_name from public.profiles p where p.id = new.user_id;
  end if;
  return new;
end; $$;

create or replace function public.sfb_set_creator()
returns trigger language plpgsql security definer set search_path = public
as $$ begin if new.created_by is null then new.created_by := auth.uid(); end if; return new; end; $$;

create or replace function public.allow_claim_only_if_approved()
returns trigger language plpgsql as $$ begin return new; end; $$;

create or replace function public.contains_banned(text)
returns boolean language sql immutable as $$ select false $$;

create or replace function public.is_valid_username(text)
returns boolean language sql immutable as $$ select true $$;

create or replace function public.nearby_posts(double precision, double precision, double precision)
returns jsonb language sql stable as $$ select '[]'::jsonb $$;

create or replace function public.nearby_profiles(double precision, double precision, double precision)
returns jsonb language sql stable as $$ select '[]'::jsonb $$;

create or replace function public.nearby_tasks(double precision, double precision, double precision)
returns jsonb language sql stable as $$ select '[]'::jsonb $$;

create or replace function public.nearby_tasks(double precision, double precision, integer)
returns jsonb language sql stable as $$ select '[]'::jsonb $$;

create or replace function public.normalize_username()
returns trigger language plpgsql as $$ begin return new; end; $$;

create or replace function public.normalize_username(text)
returns text language sql immutable as $$ select lower(btrim($1)) $$;

create or replace function public.profiles_username_guard_tg()
returns trigger language plpgsql as $$ begin return new; end; $$;

create or replace function public.profiles_username_norm_tg()
returns trigger language plpgsql as $$ begin new.username_norm := lower(btrim(coalesce(new.username::text, ''))); return new; end; $$;

create or replace function public.set_task_created_by()
returns trigger language plpgsql as $$ begin if new.created_by is null then new.created_by := auth.uid(); end if; return new; end; $$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end; $$;

create or replace function public.set_updated_at_tasks()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end; $$;

create or replace function public.tasks_force_pending()
returns trigger language plpgsql as $$ begin new.status := 'pending'; return new; end; $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end; $$;

create or replace function public.user_participates_task(public.tasks)
returns boolean language sql stable as $$ select false $$;

create or replace function public.username_clean(text)
returns text language sql immutable as $$ select lower(btrim($1)) $$;

create or replace function public.username_violation(text)
returns text language sql immutable as $$ select null::text $$;
