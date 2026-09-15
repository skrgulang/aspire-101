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
