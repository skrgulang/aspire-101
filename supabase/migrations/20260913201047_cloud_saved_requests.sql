create table if not exists public.saved_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null references public.requests(id) on delete cascade,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

create index if not exists saved_requests_user_created_idx
  on public.saved_requests(user_id, created_at desc);

alter table public.saved_requests enable row level security;

drop policy if exists "users read own saved requests" on public.saved_requests;
create policy "users read own saved requests"
on public.saved_requests for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "users save requests for themselves" on public.saved_requests;
create policy "users save requests for themselves"
on public.saved_requests for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "users update own saved requests" on public.saved_requests;
create policy "users update own saved requests"
on public.saved_requests for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "users remove own saved requests" on public.saved_requests;
create policy "users remove own saved requests"
on public.saved_requests for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.saved_requests from anon;
grant select, insert, update, delete on public.saved_requests to authenticated;
