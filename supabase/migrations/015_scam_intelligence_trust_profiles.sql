-- Aspire Scam Intelligence v1
-- Adds a conservative, explainable internal trust profile and behavioral risk snapshots.
-- Trust scores are internal signals only; they do not auto-ban or auto-publish users.

alter table public.requests add column if not exists behavior_risk_score integer;
alter table public.requests add column if not exists behavior_flags text[] not null default '{}'::text[];
alter table public.requests add column if not exists trust_score_snapshot integer;
alter table public.requests add column if not exists trust_band_snapshot text;

do $$ begin
  alter table public.requests add constraint requests_behavior_risk_score_check
    check (behavior_risk_score is null or behavior_risk_score between 0 and 100);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.requests add constraint requests_trust_score_snapshot_check
    check (trust_score_snapshot is null or trust_score_snapshot between 0 and 100);
exception when duplicate_object then null; end $$;

alter table public.request_ai_assessments add column if not exists behavior_flags text[] not null default '{}'::text[];
alter table public.request_ai_assessments add column if not exists trust_score_snapshot integer;
alter table public.request_ai_assessments add column if not exists trust_band_snapshot text;

do $$ begin
  alter table public.request_ai_assessments add constraint request_ai_assessments_trust_score_check
    check (trust_score_snapshot is null or trust_score_snapshot between 0 and 100);
exception when duplicate_object then null; end $$;

create table if not exists public.user_trust_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  trust_score integer not null default 35 check (trust_score between 0 and 100),
  trust_band text not null default 'new' check (trust_band in ('restricted','caution','new','established','trusted')),
  school_verified boolean not null default false,
  identity_verified boolean not null default false,
  completed_market_orders integer not null default 0,
  positive_reviews integer not null default 0,
  negative_reviews integer not null default 0,
  rejected_posts integer not null default 0,
  removed_posts integer not null default 0,
  high_risk_rejections integer not null default 0,
  factors jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_trust_profiles enable row level security;
drop policy if exists "users read own trust profile" on public.user_trust_profiles;
create policy "users read own trust profile" on public.user_trust_profiles
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "moderators read trust profiles" on public.user_trust_profiles;
create policy "moderators read trust profiles" on public.user_trust_profiles
  for select to authenticated using (public.is_moderator());

revoke all on table public.user_trust_profiles from anon;
grant select on table public.user_trust_profiles to authenticated;

create or replace function public.refresh_user_trust_profile(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school boolean := false;
  v_identity boolean := false;
  v_orders integer := 0;
  v_positive integer := 0;
  v_negative integer := 0;
  v_rejected integer := 0;
  v_removed integer := 0;
  v_high_rejected integer := 0;
  v_score integer := 35;
  v_band text := 'new';
begin
  if p_user_id is null or not exists(select 1 from public.profiles p where p.id=p_user_id) then return; end if;

  select exists(select 1 from public.school_verifications s where s.user_id=p_user_id and s.status='verified') into v_school;
  select exists(select 1 from public.identity_verifications i where i.user_id=p_user_id and i.status='verified') into v_identity;
  select count(*)::integer from public.market_orders m where (m.buyer_id=p_user_id or m.seller_id=p_user_id) and m.status='released' into v_orders;
  select count(*)::integer from public.connection_reviews r where r.reviewee_id=p_user_id and r.would_connect_again=true into v_positive;
  select count(*)::integer from public.connection_reviews r where r.reviewee_id=p_user_id and r.would_connect_again=false into v_negative;
  select count(*)::integer from public.moderation_actions a where a.target_user_id=p_user_id and a.action='reject_request' into v_rejected;
  select count(*)::integer from public.moderation_actions a where a.target_user_id=p_user_id and a.action='remove_request' into v_removed;
  select count(*)::integer
    from public.requests r
    where r.poster_id=p_user_id and r.moderation_status in ('rejected','blocked') and r.ai_risk_level in ('high','critical')
    into v_high_rejected;

  v_score := 35
    + case when v_school then 20 else 0 end
    + case when v_identity then 10 else 0 end
    + least(v_orders * 3, 15)
    + least(v_positive * 2, 10)
    - least(v_negative * 3, 12)
    - least(v_rejected * 8, 24)
    - least(v_removed * 12, 36)
    - least(v_high_rejected * 6, 18);
  v_score := greatest(0, least(100, v_score));

  v_band := case
    when v_score <= 25 then 'restricted'
    when v_score <= 45 then 'caution'
    when v_score <= 60 then 'new'
    when v_score <= 80 then 'established'
    else 'trusted'
  end;

  insert into public.user_trust_profiles(
    user_id, trust_score, trust_band, school_verified, identity_verified,
    completed_market_orders, positive_reviews, negative_reviews, rejected_posts,
    removed_posts, high_risk_rejections, factors, updated_at
  ) values (
    p_user_id, v_score, v_band, v_school, v_identity,
    v_orders, v_positive, v_negative, v_rejected, v_removed, v_high_rejected,
    jsonb_build_object(
      'base',35,
      'school_verified',v_school,
      'identity_verified',v_identity,
      'completed_market_orders',v_orders,
      'positive_reviews',v_positive,
      'negative_reviews',v_negative,
      'rejected_posts',v_rejected,
      'removed_posts',v_removed,
      'high_risk_rejections',v_high_rejected
    ), now()
  )
  on conflict (user_id) do update set
    trust_score=excluded.trust_score,
    trust_band=excluded.trust_band,
    school_verified=excluded.school_verified,
    identity_verified=excluded.identity_verified,
    completed_market_orders=excluded.completed_market_orders,
    positive_reviews=excluded.positive_reviews,
    negative_reviews=excluded.negative_reviews,
    rejected_posts=excluded.rejected_posts,
    removed_posts=excluded.removed_posts,
    high_risk_rejections=excluded.high_risk_rejections,
    factors=excluded.factors,
    updated_at=now();
end;
$$;

revoke all on function public.refresh_user_trust_profile(uuid) from public;
grant execute on function public.refresh_user_trust_profile(uuid) to authenticated, service_role;

create or replace function public.refresh_trust_from_school_verification()
returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.refresh_user_trust_profile(new.user_id); return new; end; $$;

drop trigger if exists refresh_trust_school_verification_tg on public.school_verifications;
create trigger refresh_trust_school_verification_tg after insert or update of status on public.school_verifications
for each row execute function public.refresh_trust_from_school_verification();

create or replace function public.refresh_trust_from_identity_verification()
returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.refresh_user_trust_profile(new.user_id); return new; end; $$;

drop trigger if exists refresh_trust_identity_verification_tg on public.identity_verifications;
create trigger refresh_trust_identity_verification_tg after insert or update of status on public.identity_verifications
for each row execute function public.refresh_trust_from_identity_verification();

create or replace function public.refresh_trust_from_review()
returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.refresh_user_trust_profile(new.reviewee_id); return new; end; $$;

drop trigger if exists refresh_trust_connection_review_tg on public.connection_reviews;
create trigger refresh_trust_connection_review_tg after insert or update of would_connect_again on public.connection_reviews
for each row execute function public.refresh_trust_from_review();

create or replace function public.refresh_trust_from_market_order()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.refresh_user_trust_profile(new.buyer_id);
  perform public.refresh_user_trust_profile(new.seller_id);
  return new;
end; $$;

drop trigger if exists refresh_trust_market_order_tg on public.market_orders;
create trigger refresh_trust_market_order_tg after insert or update of status on public.market_orders
for each row execute function public.refresh_trust_from_market_order();

create or replace function public.refresh_trust_from_moderation_action()
returns trigger language plpgsql security definer set search_path=public as $$
begin if new.target_user_id is not null then perform public.refresh_user_trust_profile(new.target_user_id); end if; return new; end; $$;

drop trigger if exists refresh_trust_moderation_action_tg on public.moderation_actions;
create trigger refresh_trust_moderation_action_tg after insert on public.moderation_actions
for each row execute function public.refresh_trust_from_moderation_action();

-- Initialize profiles without turning the score into an enforcement decision.
do $$ declare r record; begin
  for r in select id from public.profiles loop
    perform public.refresh_user_trust_profile(r.id);
  end loop;
end $$;
