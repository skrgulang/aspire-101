-- Manual, audited account enforcement for repeat abuse.
-- Safety/trust scores never auto-suspend users. A moderator must choose restricted/suspended explicitly.

create table if not exists public.user_enforcement_states (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  state text not null default 'active' check (state in ('active','restricted','suspended')),
  reason text,
  set_by uuid references auth.users(id) on delete set null,
  set_at timestamptz not null default now(),
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_enforcement_states enable row level security;
drop policy if exists "users read own enforcement state" on public.user_enforcement_states;
create policy "users read own enforcement state" on public.user_enforcement_states
  for select to authenticated using (user_id=auth.uid());
drop policy if exists "moderators read enforcement states" on public.user_enforcement_states;
create policy "moderators read enforcement states" on public.user_enforcement_states
  for select to authenticated using (public.is_moderator());
revoke all privileges on table public.user_enforcement_states from anon;
grant select on table public.user_enforcement_states to authenticated;

create or replace function public.effective_user_enforcement(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path=public
as $$
  select case
    when e.user_id is null then 'active'
    when e.expires_at is not null and e.expires_at <= now() then 'active'
    else e.state
  end
  from (select p_user_id as id) x
  left join public.user_enforcement_states e on e.user_id=x.id;
$$;
revoke execute on function public.effective_user_enforcement(uuid) from public, anon, authenticated;

create or replace function public.can_post_request(uid uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select
    uid is not null
    and public.effective_user_enforcement(uid)='active'
    and exists(select 1 from public.school_verifications sv where sv.user_id=uid and sv.status='verified');
$$;
revoke execute on function public.can_post_request(uuid) from public, anon;
grant execute on function public.can_post_request(uuid) to authenticated, service_role;

create or replace function public.can_post_request()
returns boolean
language sql
stable
security definer
set search_path=public
as $$ select public.can_post_request(auth.uid()); $$;
revoke execute on function public.can_post_request() from public, anon;
grant execute on function public.can_post_request() to authenticated;

create or replace function public.guard_account_enforcement()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid;
  v_state text;
begin
  if tg_table_name='requests' then v_user:=new.poster_id;
  elsif tg_table_name='request_responses' then v_user:=new.responder_id;
  elsif tg_table_name='connection_messages' then v_user:=new.sender_id;
  else return new;
  end if;

  v_state:=public.effective_user_enforcement(v_user);
  if tg_table_name='connection_messages' then
    if v_state='suspended' then raise exception 'ACCOUNT_SUSPENDED'; end if;
  elsif v_state in ('restricted','suspended') then
    raise exception 'ACCOUNT_RESTRICTED';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_account_enforcement() from public, anon, authenticated;

drop trigger if exists account_enforcement_requests_tg on public.requests;
create trigger account_enforcement_requests_tg before insert on public.requests
for each row execute function public.guard_account_enforcement();
drop trigger if exists account_enforcement_responses_tg on public.request_responses;
create trigger account_enforcement_responses_tg before insert on public.request_responses
for each row execute function public.guard_account_enforcement();
drop trigger if exists account_enforcement_messages_tg on public.connection_messages;
create trigger account_enforcement_messages_tg before insert on public.connection_messages
for each row execute function public.guard_account_enforcement();

alter table public.moderation_actions drop constraint if exists moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check check (action = any(array[
  'verify_school_id','reject_school_id','resolve_report','dismiss_report','remove_request',
  'grant_moderator','revoke_moderator','approve_request','reject_request','approve_request_ai_override',
  'restrict_user','suspend_user','restore_user'
]::text[]));

create or replace function public.moderator_set_user_enforcement(p_user_id uuid, p_state text, p_reason text default null, p_expires_at timestamptz default null)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_action text;
begin
  if not public.is_moderator() then raise exception 'Moderator access required.'; end if;
  if p_state not in ('active','restricted','suspended') then raise exception 'Invalid enforcement state.'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'User not found.'; end if;
  if p_user_id=auth.uid() and p_state<>'active' then raise exception 'You cannot restrict your own moderator account.'; end if;
  if p_state<>'active' and nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'An enforcement reason is required.'; end if;

  insert into public.user_enforcement_states(user_id,state,reason,set_by,set_at,expires_at,updated_at)
  values(p_user_id,p_state,nullif(trim(coalesce(p_reason,'')),''),auth.uid(),now(),p_expires_at,now())
  on conflict(user_id) do update set
    state=excluded.state,
    reason=excluded.reason,
    set_by=excluded.set_by,
    set_at=now(),
    expires_at=excluded.expires_at,
    updated_at=now();

  v_action:=case p_state when 'restricted' then 'restrict_user' when 'suspended' then 'suspend_user' else 'restore_user' end;
  insert into public.moderation_actions(moderator_id,action,target_user_id,note)
  values(auth.uid(),v_action,p_user_id,concat_ws(' · ',nullif(trim(coalesce(p_reason,'')),''),case when p_expires_at is not null then 'expires '||p_expires_at::text else null end));
end;
$$;
revoke execute on function public.moderator_set_user_enforcement(uuid,text,text,timestamptz) from public, anon;
grant execute on function public.moderator_set_user_enforcement(uuid,text,text,timestamptz) to authenticated;
