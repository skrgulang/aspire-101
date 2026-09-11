-- Supabase project defaults may grant anon/authenticated broader privileges to newly
-- created objects. Narrow Aspire Live to participant reads + authenticated RPCs only.

revoke all on table public.connection_events from public, anon, authenticated;
revoke all on table public.connection_live_locations from public, anon, authenticated;
grant select on table public.connection_events to authenticated;
grant select on table public.connection_live_locations to authenticated;

revoke all on sequence public.connection_events_id_seq from public, anon, authenticated;

revoke all on function public.set_connection_schedule(uuid,timestamptz,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.set_connection_schedule(uuid,timestamptz,text,text,timestamptz) to authenticated;

revoke all on function public.set_connection_coordination_status(uuid,text) from public, anon, authenticated;
grant execute on function public.set_connection_coordination_status(uuid,text) to authenticated;

revoke all on function public.share_connection_location(uuid,double precision,double precision,double precision,integer) from public, anon, authenticated;
grant execute on function public.share_connection_location(uuid,double precision,double precision,double precision,integer) to authenticated;

revoke all on function public.stop_connection_location_share(uuid) from public, anon, authenticated;
grant execute on function public.stop_connection_location_share(uuid) to authenticated;

-- Trigger-only function: clients never need to invoke it directly.
revoke all on function public.seed_connection_schedule_from_request() from public, anon, authenticated;

revoke all on function public.cleanup_expired_connection_locations() from public, anon, authenticated;
grant execute on function public.cleanup_expired_connection_locations() to authenticated;

revoke all on function public.purge_connection_live_locations_when_closed() from public, anon, authenticated;
