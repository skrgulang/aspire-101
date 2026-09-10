-- Aspire 101 production hardening — 2026-09-10
-- Safe to re-run. This migration narrows legacy/public privileges without changing
-- the canonical V2 requests -> responses -> connections -> payments data model.

-- -----------------------------------------------------------------------------
-- 1. Legacy moderation RPC must require a signed-in moderator.
-- -----------------------------------------------------------------------------
create or replace function public.moderate_task(
  p_task_id uuid,
  p_approve boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if auth.uid() is null or not public.is_moderator() then
    raise exception 'Moderator access required.';
  end if;

  update public.tasks
  set status      = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      mod_reason  = nullif(trim(coalesce(p_reason, '')), '')
  where id = p_task_id
    and status = 'pending';

  if not found then
    raise exception 'Pending task not found.';
  end if;
end;
$$;

revoke all on function public.moderate_task(uuid, boolean, text) from public;
revoke all on function public.moderate_task(uuid, boolean, text) from anon;
grant execute on function public.moderate_task(uuid, boolean, text) to authenticated;

-- Legacy moderation queue is moderator-only.
create or replace function public.list_pending_tasks()
returns setof public.tasks
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if auth.uid() is null or not public.is_moderator() then
    raise exception 'Moderator access required.';
  end if;
  return query
    select * from public.tasks
    where status = 'pending'
    order by created_at desc;
end;
$$;

create or replace function public.list_pending_tasks(p_limit integer default 100, p_offset integer default 0)
returns setof public.tasks
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if auth.uid() is null or not public.is_moderator() then
    raise exception 'Moderator access required.';
  end if;
  return query
    select * from public.tasks
    where status = 'pending'
    order by created_at asc
    limit greatest(1, least(coalesce(p_limit, 100), 200))
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Retire direct client writes to legacy money surfaces.
-- -----------------------------------------------------------------------------
alter table public.wallets enable row level security;
drop policy if exists "allow existing behavior" on public.wallets;
drop policy if exists "users read own wallet" on public.wallets;
revoke all on table public.wallets from public;
revoke all on table public.wallets from anon;
revoke insert, update, delete, truncate, references, trigger on table public.wallets from authenticated;
grant select on table public.wallets to authenticated;
create policy "users read own wallet"
on public.wallets
for select
to authenticated
using ((select auth.uid()) = user_id);

alter table public.user_balances enable row level security;
drop policy if exists "user can insert own balance" on public.user_balances;
drop policy if exists "user can update own balance" on public.user_balances;
drop policy if exists "user can read own balance" on public.user_balances;
drop policy if exists "users read own balance" on public.user_balances;
revoke all on table public.user_balances from public;
revoke all on table public.user_balances from anon;
revoke insert, update, delete, truncate, references, trigger on table public.user_balances from authenticated;
grant select on table public.user_balances to authenticated;
create policy "users read own balance"
on public.user_balances
for select
to authenticated
using ((select auth.uid()) = user_id);

alter table public.transactions enable row level security;
drop policy if exists "tx_create_as_sender" on public.transactions;
drop policy if exists "tx_update_own" on public.transactions;
drop policy if exists "tx_read_own" on public.transactions;
drop policy if exists "participants read legacy transactions" on public.transactions;
revoke all on table public.transactions from public;
revoke all on table public.transactions from anon;
revoke insert, update, delete, truncate, references, trigger on table public.transactions from authenticated;
grant select on table public.transactions to authenticated;
create policy "participants read legacy transactions"
on public.transactions
for select
to authenticated
using ((select auth.uid()) = from_user or (select auth.uid()) = to_user);

-- -----------------------------------------------------------------------------
-- 3. Remove anonymous execution from authenticated/trigger-only definer RPCs.
-- -----------------------------------------------------------------------------
revoke execute on function public.admin_activity_metrics(integer) from public, anon;
revoke execute on function public.cancel_market_delivery_request(uuid) from public, anon;
revoke execute on function public.claim_task(uuid) from public, anon;
revoke execute on function public.get_or_create_room(uuid) from public, anon;
revoke execute on function public.link_market_delivery_request(uuid, uuid, text, text, integer, text, text) from public, anon;
revoke execute on function public.list_pending_tasks() from public, anon;
revoke execute on function public.list_pending_tasks(integer, integer) from public, anon;
revoke execute on function public.record_user_activity() from public, anon;
revoke execute on function public.upsert_my_profile(text, text, text) from public, anon;

grant execute on function public.admin_activity_metrics(integer) to authenticated;
grant execute on function public.cancel_market_delivery_request(uuid) to authenticated;
grant execute on function public.claim_task(uuid) to authenticated;
grant execute on function public.get_or_create_room(uuid) to authenticated;
grant execute on function public.link_market_delivery_request(uuid, uuid, text, text, integer, text, text) to authenticated;
grant execute on function public.list_pending_tasks() to authenticated;
grant execute on function public.list_pending_tasks(integer, integer) to authenticated;
grant execute on function public.record_user_activity() to authenticated;
grant execute on function public.upsert_my_profile(text, text, text) to authenticated;

-- Trigger-only functions should not be callable through PostgREST RPC.
revoke execute on function public.create_room_on_claim() from public, anon, authenticated;
revoke execute on function public.ensure_market_order_for_connection() from public, anon, authenticated;
revoke execute on function public.log_market_order_status_change() from public, anon, authenticated;
revoke execute on function public.set_poster_name() from public, anon, authenticated;
revoke execute on function public.sfb_set_creator() from public, anon, authenticated;
revoke execute on function public.sync_cancelled_connection_market_order() from public, anon, authenticated;
revoke execute on function public.sync_market_order_payment_state() from public, anon, authenticated;
revoke execute on function public.sync_request_campus_name() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Lock custom function search paths.
-- -----------------------------------------------------------------------------
alter function public.add_banned_pattern(text, text) set search_path = public, auth;
alter function public.add_banned_patterns(text[], text) set search_path = public, auth;
alter function public.allow_claim_only_if_approved() set search_path = public, auth;
alter function public.contains_banned(text) set search_path = public, auth;
alter function public.create_room_on_claim() set search_path = public, auth;
alter function public.enforce_username() set search_path = public, auth;
alter function public.get_or_create_room(uuid) set search_path = public, auth;
alter function public.is_valid_username(text) set search_path = public, auth;
alter function public.make_obf_regex(text) set search_path = public, auth;
alter function public.nearby_posts(double precision, double precision, double precision) set search_path = public, auth;
alter function public.nearby_profiles(double precision, double precision, double precision) set search_path = public, auth;
alter function public.nearby_tasks(double precision, double precision, double precision) set search_path = public, auth;
alter function public.nearby_tasks(double precision, double precision, integer) set search_path = public, auth;
alter function public.normalize_username() set search_path = public, auth;
alter function public.normalize_username(text) set search_path = public, auth;
alter function public.profiles_username_guard_tg() set search_path = public, auth;
alter function public.profiles_username_norm_tg() set search_path = public, auth;
alter function public.reject_public_request_coordinates() set search_path = public, auth;
alter function public.set_task_created_by() set search_path = public, auth;
alter function public.set_updated_at() set search_path = public, auth;
alter function public.set_updated_at_tasks() set search_path = public, auth;
alter function public.tasks_force_pending() set search_path = public, auth;
alter function public.touch_updated_at() set search_path = public, auth;
alter function public.user_participates_task(public.tasks) set search_path = public, auth;
alter function public.username_clean(text) set search_path = public, auth;
alter function public.username_violation(text) set search_path = public, auth;

-- -----------------------------------------------------------------------------
-- 5. Profiles: expose only V2 display/campus fields and only user-editable writes.
-- Auth contact data, verified identity, staff roles, exact location, and internal
-- moderation state remain server-controlled.
-- -----------------------------------------------------------------------------
revoke all on table public.profiles from anon;
revoke select, insert, update, delete, truncate, references, trigger on table public.profiles from authenticated;

grant select (
  id, display_name, name, full_name, school, city, image_url, avatar_url,
  username, username_norm, bio, home_campus_id, current_campus_id,
  campus_last_selected_at, created_at, updated_at
) on public.profiles to authenticated;

grant update (
  display_name, name, full_name, city, image_url, avatar_url, username, bio,
  current_campus_id, campus_last_selected_at
) on public.profiles to authenticated;

-- -----------------------------------------------------------------------------
-- 6. V2 requires sign-in for campus activity. Reduce signed-out schema exposure.
-- -----------------------------------------------------------------------------
revoke select on table public.requests from anon;
revoke select on table public.request_media from anon;
revoke select on table public.connections from anon;
revoke select on table public.connection_messages from anon;
revoke select on table public.connection_message_reads from anon;
revoke select on table public.connection_completion_confirmations from anon;
revoke select on table public.connection_circle_choices from anon;
revoke select on table public.connection_reviews from anon;
revoke select on table public.connection_payment_agreements from anon;
revoke select on table public.connection_payments from anon;
revoke select on table public.market_delivery_links from anon;
revoke select on table public.fee_policies from anon;
revoke select on table public.user_locations from anon;

-- Retired pre-V2 surfaces are not part of the signed-out production API.
revoke select on table public.tasks from anon;
revoke select on table public.task_claims from anon;
revoke select on table public.task_messages from anon;
revoke select on table public.task_rooms from anon;
revoke select on table public.task_swipes from anon;
revoke select on table public.chat_rooms from anon;
revoke select on table public.chat_messages from anon;
revoke select on table public.posts from anon;
revoke select on table public.listings from anon;
revoke select on table public.orders from anon;
revoke select on table public.join_requests from anon;
revoke select on table public.transactions from anon;
