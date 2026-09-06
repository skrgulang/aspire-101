-- Aspire Safety Intelligence v1
-- Stores automated multimodal risk assessments while keeping final publication human-gated.

alter table public.requests add column if not exists ai_moderation_status text not null default 'not_scanned';
alter table public.requests add column if not exists ai_risk_level text not null default 'unknown';
alter table public.requests add column if not exists ai_risk_score integer;
alter table public.requests add column if not exists ai_recommended_action text not null default 'review';
alter table public.requests add column if not exists ai_policy_flags text[] not null default '{}'::text[];
alter table public.requests add column if not exists ai_summary text;
alter table public.requests add column if not exists ai_last_scanned_at timestamptz;

do $$ begin
  alter table public.requests add constraint requests_ai_moderation_status_check
    check (ai_moderation_status in ('not_scanned','scanning','complete','error'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.requests add constraint requests_ai_risk_level_check
    check (ai_risk_level in ('unknown','low','medium','high','critical'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.requests add constraint requests_ai_risk_score_check
    check (ai_risk_score is null or (ai_risk_score between 0 and 100));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.requests add constraint requests_ai_recommended_action_check
    check (ai_recommended_action in ('approve','review','block'));
exception when duplicate_object then null; end $$;

create table if not exists public.request_ai_assessments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  provider text not null default 'openai',
  model text not null,
  model_flagged boolean not null default false,
  risk_level text not null check (risk_level in ('low','medium','high','critical')),
  risk_score integer not null check (risk_score between 0 and 100),
  recommended_action text not null check (recommended_action in ('approve','review','block')),
  categories jsonb not null default '{}'::jsonb,
  category_scores jsonb not null default '{}'::jsonb,
  platform_flags text[] not null default '{}'::text[],
  rule_flags text[] not null default '{}'::text[],
  image_count integer not null default 0 check (image_count between 0 and 5),
  summary text,
  raw_response jsonb,
  created_at timestamptz not null default now()
);

create index if not exists request_ai_assessments_request_created_idx
  on public.request_ai_assessments(request_id, created_at desc);

alter table public.request_ai_assessments enable row level security;
drop policy if exists "moderators read ai assessments" on public.request_ai_assessments;
create policy "moderators read ai assessments"
  on public.request_ai_assessments for select to authenticated
  using (public.is_moderator());

revoke all on table public.request_ai_assessments from anon;
grant select on table public.request_ai_assessments to authenticated;
