create table if not exists public.campus_ambassador_applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 1 and 120),
  school text not null check (char_length(school) between 1 and 160),
  school_email text not null check (char_length(school_email) <= 254),
  major_year text,
  why_aspire text not null check (char_length(why_aspire) between 10 and 3000),
  campus_involvement text,
  social_links text,
  availability text check (availability in ('1–3 hrs/week','3–5 hrs/week','5–10 hrs/week','10+ hrs/week')),
  interested_in text[] not null default '{}'::text[],
  status text not null default 'new' check (status in ('new','reviewing','interview','accepted','declined')),
  source text not null default 'ambassadors_page',
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.campus_ambassador_applications enable row level security;
revoke all on table public.campus_ambassador_applications from anon, authenticated;
create index if not exists campus_ambassador_applications_email_idx on public.campus_ambassador_applications (lower(school_email));
create index if not exists campus_ambassador_applications_created_idx on public.campus_ambassador_applications (created_at desc);
