create table if not exists public.product_update_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  school text,
  interests text[] not null default '{}',
  source text not null default 'updates_page',
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists product_update_waitlist_email_unique
  on public.product_update_waitlist (lower(email));

create index if not exists product_update_waitlist_ip_created_idx
  on public.product_update_waitlist (ip_hash, created_at desc);

alter table public.product_update_waitlist enable row level security;

revoke all on public.product_update_waitlist from anon, authenticated;
grant all on public.product_update_waitlist to service_role;

comment on table public.product_update_waitlist is
  'Aspire 101 product update/waitlist signups. Writes are server-only via service role.';
