-- Aspire 101 V2 request foundation
-- Safe to review before applying to the resumed Supabase project.

create extension if not exists pgcrypto;

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  poster_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('community','paid_help','split_cost','buy_sell','collaboration')),
  category text not null,
  title text not null check (char_length(title) between 1 and 180),
  details text,
  campus text,
  city text,
  latitude double precision,
  longitude double precision,
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  currency text not null default 'USD',
  payment_method text not null default 'none' check (payment_method in ('aspire','in_person','none')),
  status text not null default 'open' check (status in ('open','matched','in_progress','completed','cancelled','expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.request_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  responder_id uuid not null references auth.users(id) on delete cascade,
  message text,
  status text not null default 'pending' check (status in ('pending','accepted','declined','withdrawn')),
  created_at timestamptz not null default now(),
  unique (request_id, responder_id)
);

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.requests(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  responder_id uuid not null references auth.users(id) on delete cascade,
  requester_confirmed boolean not null default false,
  responder_confirmed boolean not null default false,
  status text not null default 'pending' check (status in ('pending','confirmed','active','completed','cancelled')),
  agreed_amount_cents integer,
  agreed_terms jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists requests_status_created_idx on public.requests(status, created_at desc);
create index if not exists requests_campus_idx on public.requests(campus);
create index if not exists responses_request_idx on public.request_responses(request_id, created_at desc);

alter table public.requests enable row level security;
alter table public.request_responses enable row level security;
alter table public.connections enable row level security;

-- Public browsing is intentional; posting requires a signed-in user.
drop policy if exists "requests are publicly readable" on public.requests;
create policy "requests are publicly readable"
  on public.requests for select
  using (true);

drop policy if exists "users create their own requests" on public.requests;
create policy "users create their own requests"
  on public.requests for insert
  to authenticated
  with check (auth.uid() = poster_id);

drop policy if exists "owners update their requests" on public.requests;
create policy "owners update their requests"
  on public.requests for update
  to authenticated
  using (auth.uid() = poster_id)
  with check (auth.uid() = poster_id);

drop policy if exists "owners delete their requests" on public.requests;
create policy "owners delete their requests"
  on public.requests for delete
  to authenticated
  using (auth.uid() = poster_id);

-- A responder can create/see their own response; the request owner can also see it.
drop policy if exists "response participants can read" on public.request_responses;
create policy "response participants can read"
  on public.request_responses for select
  to authenticated
  using (
    auth.uid() = responder_id
    or exists (
      select 1 from public.requests r
      where r.id = request_id and r.poster_id = auth.uid()
    )
  );

drop policy if exists "users respond as themselves" on public.request_responses;
create policy "users respond as themselves"
  on public.request_responses for insert
  to authenticated
  with check (
    auth.uid() = responder_id
    and exists (
      select 1 from public.requests r
      where r.id = request_id
        and r.poster_id <> auth.uid()
        and r.status = 'open'
    )
  );

drop policy if exists "responders can withdraw" on public.request_responses;
create policy "responders can withdraw"
  on public.request_responses for update
  to authenticated
  using (auth.uid() = responder_id)
  with check (auth.uid() = responder_id);

-- Connections are private to the two students involved.
drop policy if exists "connection participants can read" on public.connections;
create policy "connection participants can read"
  on public.connections for select
  to authenticated
  using (auth.uid() = requester_id or auth.uid() = responder_id);

drop policy if exists "request owners create connections" on public.connections;
create policy "request owners create connections"
  on public.connections for insert
  to authenticated
  with check (
    auth.uid() = requester_id
    and exists (
      select 1 from public.requests r
      where r.id = request_id and r.poster_id = auth.uid()
    )
  );

drop policy if exists "connection participants update" on public.connections;
create policy "connection participants update"
  on public.connections for update
  to authenticated
  using (auth.uid() = requester_id or auth.uid() = responder_id)
  with check (auth.uid() = requester_id or auth.uid() = responder_id);
