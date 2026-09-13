create or replace function public.share_connection_location(
  p_connection_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters double precision default null,
  p_minutes integer default 30
)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_connection public.connections;
  v_expires timestamptz;
  v_minutes integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'Invalid coordinates'; end if;

  select * into v_connection from public.connections where id = p_connection_id;
  if not found then raise exception 'Connection not found'; end if;
  if auth.uid() <> v_connection.requester_id and auth.uid() <> v_connection.responder_id then raise exception 'Not authorized'; end if;
  if v_connection.status not in ('confirmed','active') then raise exception 'Location can only be shared for an active connection'; end if;
  if exists (
    select 1 from public.user_blocks ub
    where (ub.blocker_id = v_connection.requester_id and ub.blocked_id = v_connection.responder_id)
       or (ub.blocker_id = v_connection.responder_id and ub.blocked_id = v_connection.requester_id)
  ) then
    raise exception 'Location sharing is unavailable while either participant has blocked the other';
  end if;

  v_minutes := greatest(5,least(coalesce(p_minutes,30),120));
  v_expires := now() + make_interval(mins => v_minutes);

  insert into public.connection_live_locations(connection_id,user_id,latitude,longitude,accuracy_meters,expires_at,updated_at)
  values (p_connection_id,auth.uid(),p_latitude,p_longitude,p_accuracy_meters,v_expires,now())
  on conflict (connection_id,user_id) do update set
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    accuracy_meters = excluded.accuracy_meters,
    expires_at = excluded.expires_at,
    updated_at = now();

  insert into public.connection_events(connection_id,actor_id,event_type,body,metadata)
  values (p_connection_id,auth.uid(),'location_shared','Shared live location temporarily.',jsonb_build_object('expires_at',v_expires));

  return v_expires;
end;
$function$;

drop policy if exists "connection participants read active shared location" on public.connection_live_locations;
create policy "connection participants read active shared location"
on public.connection_live_locations for select
to authenticated
using (
  expires_at > now()
  and exists (
    select 1
    from public.connections c
    where c.id = connection_live_locations.connection_id
      and c.status in ('confirmed','active')
      and ((select auth.uid()) = c.requester_id or (select auth.uid()) = c.responder_id)
      and not exists (
        select 1 from public.user_blocks ub
        where (ub.blocker_id = c.requester_id and ub.blocked_id = c.responder_id)
           or (ub.blocker_id = c.responder_id and ub.blocked_id = c.requester_id)
      )
  )
);

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

  delete from public.connection_live_locations l
  using public.connections c
  where l.connection_id = c.id
    and (
      (c.requester_id = new.blocker_id and c.responder_id = new.blocked_id)
      or (c.requester_id = new.blocked_id and c.responder_id = new.blocker_id)
    );

  return new;
end;
$function$;
