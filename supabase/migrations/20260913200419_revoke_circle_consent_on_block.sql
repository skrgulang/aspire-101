create or replace function public.set_circle_choice(p_connection_id uuid, p_keep boolean)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_connection public.connections;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_connection
  from public.connections
  where id = p_connection_id;

  if not found then raise exception 'Connection not found'; end if;
  if auth.uid() <> v_connection.requester_id and auth.uid() <> v_connection.responder_id then
    raise exception 'Not authorized';
  end if;
  if v_connection.status <> 'completed' then
    raise exception 'Complete the connection before adding someone to your Circle';
  end if;

  if p_keep and exists (
    select 1
    from public.user_blocks ub
    where (ub.blocker_id = v_connection.requester_id and ub.blocked_id = v_connection.responder_id)
       or (ub.blocker_id = v_connection.responder_id and ub.blocked_id = v_connection.requester_id)
  ) then
    raise exception 'My Circle is unavailable while either participant has blocked the other';
  end if;

  insert into public.connection_circle_choices(connection_id, user_id, keep_in_circle, updated_at)
  values (p_connection_id, auth.uid(), p_keep, now())
  on conflict (connection_id, user_id) do update
    set keep_in_circle = excluded.keep_in_circle,
        updated_at = now();

  return p_keep;
end;
$function$;

create or replace function public.clear_circle_choices_after_block()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  delete from public.connection_circle_choices cc
  using public.connections c
  where cc.connection_id = c.id
    and (
      (c.requester_id = new.blocker_id and c.responder_id = new.blocked_id)
      or (c.requester_id = new.blocked_id and c.responder_id = new.blocker_id)
    );
  return new;
end;
$function$;

drop trigger if exists user_blocks_clear_circle_choices on public.user_blocks;
create trigger user_blocks_clear_circle_choices
after insert on public.user_blocks
for each row execute function public.clear_circle_choices_after_block();
