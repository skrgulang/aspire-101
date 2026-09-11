-- Keep Aspire Live location sharing temporary even without the reminder cron.
-- Expired coordinates are hidden by RLS in the foundation migration; this migration
-- also removes them from storage opportunistically and immediately on connection close.

create or replace function public.cleanup_expired_connection_locations()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_deleted integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  delete from public.connection_live_locations
  where expires_at <= now();

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.cleanup_expired_connection_locations() from public, anon;
grant execute on function public.cleanup_expired_connection_locations() to authenticated;

create or replace function public.purge_connection_live_locations_when_closed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status not in ('confirmed', 'active') then
    delete from public.connection_live_locations
    where connection_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.purge_connection_live_locations_when_closed() from public, anon, authenticated;

drop trigger if exists purge_connection_live_locations_when_closed_trigger on public.connections;
create trigger purge_connection_live_locations_when_closed_trigger
after update of status on public.connections
for each row
when (old.status is distinct from new.status)
execute function public.purge_connection_live_locations_when_closed();

-- The connection timeline subscribes to INSERT events. Add the table to Supabase Realtime
-- once, without failing if the publication is unavailable or the table is already present.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'connection_events'
     ) then
    alter publication supabase_realtime add table public.connection_events;
  end if;
end;
$$;
