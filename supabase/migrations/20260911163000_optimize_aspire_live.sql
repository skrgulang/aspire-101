-- Live-specific indexes and RLS init-plan optimization.

create index if not exists connection_events_actor_idx
  on public.connection_events(actor_id);
create index if not exists connection_live_locations_user_idx
  on public.connection_live_locations(user_id);
create index if not exists connections_last_coordination_actor_idx
  on public.connections(last_coordination_actor_id);

drop policy if exists "connection participants read coordination events" on public.connection_events;
create policy "connection participants read coordination events"
on public.connection_events for select to authenticated using (
  exists (
    select 1 from public.connections c
    where c.id = connection_events.connection_id
      and ((select auth.uid()) = c.requester_id or (select auth.uid()) = c.responder_id)
  )
);

drop policy if exists "connection participants read active shared location" on public.connection_live_locations;
create policy "connection participants read active shared location"
on public.connection_live_locations for select to authenticated using (
  expires_at > now()
  and exists (
    select 1 from public.connections c
    where c.id = connection_live_locations.connection_id
      and c.status in ('confirmed','active')
      and ((select auth.uid()) = c.requester_id or (select auth.uid()) = c.responder_id)
  )
);
