-- Aspire Agent: privacy-minded planning + outcome learning.
-- Stores structured plans and selected match ids, not the user's raw free-text prompt.

create table if not exists public.aspire_ai_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campus_id uuid null references public.universities(id) on delete set null,
  intent_summary text not null default '',
  category text null,
  kind text null,
  recommended_action text not null default 'explore'
    check (recommended_action in ('join_existing','create_request','explore','need_details','blocked')),
  draft jsonb not null default '{}'::jsonb,
  match_ids uuid[] not null default '{}'::uuid[],
  outcome text not null default 'planned'
    check (outcome in ('planned','opened_match','drafted_post','posted','connected','completed','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists aspire_ai_sessions_user_created_idx
  on public.aspire_ai_sessions(user_id, created_at desc);
create index if not exists aspire_ai_sessions_campus_created_idx
  on public.aspire_ai_sessions(campus_id, created_at desc);

alter table public.aspire_ai_sessions enable row level security;

drop policy if exists "Users can read own AI sessions" on public.aspire_ai_sessions;
create policy "Users can read own AI sessions"
  on public.aspire_ai_sessions for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can update own AI session outcome" on public.aspire_ai_sessions;
create policy "Users can update own AI session outcome"
  on public.aspire_ai_sessions for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on table public.aspire_ai_sessions from anon;
revoke insert, delete on table public.aspire_ai_sessions from authenticated;
grant select, update on table public.aspire_ai_sessions to authenticated;
grant all on table public.aspire_ai_sessions to service_role;

create or replace function public.touch_aspire_ai_session()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.touch_aspire_ai_session() from public, anon, authenticated;
grant execute on function public.touch_aspire_ai_session() to service_role;

drop trigger if exists touch_aspire_ai_session_tg on public.aspire_ai_sessions;
create trigger touch_aspire_ai_session_tg
before update on public.aspire_ai_sessions
for each row execute function public.touch_aspire_ai_session();
