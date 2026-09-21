-- Keep both participants' Orders screens synchronized when payment or order
-- state changes. RLS remains the authorization boundary for change delivery.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'market_orders'
    ) then
      alter publication supabase_realtime add table public.market_orders;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'connection_payments'
    ) then
      alter publication supabase_realtime add table public.connection_payments;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'market_disputes'
    ) then
      alter publication supabase_realtime add table public.market_disputes;
    end if;
  end if;
end
$$;
