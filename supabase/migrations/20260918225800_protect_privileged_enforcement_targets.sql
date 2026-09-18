-- Prevent ordinary moderators from restricting or suspending moderator/admin accounts.
-- is_moderator() and is_admin() both inherit the existing AAL2 requirement.

create or replace function public.moderator_set_user_enforcement(
  p_user_id uuid,
  p_state text,
  p_reason text default null,
  p_expires_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_action text;
  v_target_role text;
begin
  if not public.is_moderator() then
    raise exception 'Moderator access required.';
  end if;

  if p_state not in ('active','restricted','suspended') then
    raise exception 'Invalid enforcement state.';
  end if;

  if not exists(select 1 from public.profiles where id=p_user_id) then
    raise exception 'User not found.';
  end if;

  select role into v_target_role
  from public.user_roles
  where user_id = p_user_id;

  if coalesce(v_target_role, 'member') in ('moderator','admin')
     and not public.is_admin() then
    raise exception 'Admin access required to enforce privileged accounts.';
  end if;

  if p_user_id=auth.uid() and p_state<>'active' then
    raise exception 'You cannot restrict your own moderator account.';
  end if;

  if p_state<>'active' and nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'An enforcement reason is required.';
  end if;

  insert into public.user_enforcement_states(
    user_id,state,reason,set_by,set_at,expires_at,updated_at
  )
  values(
    p_user_id,p_state,nullif(trim(coalesce(p_reason,'')),''),
    auth.uid(),now(),p_expires_at,now()
  )
  on conflict(user_id) do update
  set state=excluded.state,
      reason=excluded.reason,
      set_by=excluded.set_by,
      set_at=now(),
      expires_at=excluded.expires_at,
      updated_at=now();

  v_action:=case p_state
    when 'restricted' then 'restrict_user'
    when 'suspended' then 'suspend_user'
    else 'restore_user'
  end;

  insert into public.moderation_actions(
    moderator_id,action,target_user_id,note
  )
  values(
    auth.uid(),v_action,p_user_id,
    concat_ws(
      ' · ',
      nullif(trim(coalesce(p_reason,'')),''),
      case when p_expires_at is not null then 'expires '||p_expires_at::text else null end
    )
  );
end;
$function$;

revoke execute on function public.moderator_set_user_enforcement(uuid,text,text,timestamptz) from public, anon;
grant execute on function public.moderator_set_user_enforcement(uuid,text,text,timestamptz) to authenticated;
