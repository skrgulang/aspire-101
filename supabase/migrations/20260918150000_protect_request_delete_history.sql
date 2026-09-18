-- Prevent browser request deletion from cascading into active/completed connection,
-- order, payment, or Resolution Center history.

drop policy if exists "owners delete unconnected requests" on public.requests;
create policy "owners delete unconnected requests"
on public.requests
for delete
to authenticated
using (
  (select auth.uid()) = poster_id
  and not exists (
    select 1
    from public.connections c
    where c.request_id = requests.id
      and c.status <> 'cancelled'
  )
  and not exists (
    select 1
    from public.market_orders mo
    where mo.request_id = requests.id
  )
  and not exists (
    select 1
    from public.connection_payments cp
    where cp.request_id = requests.id
  )
  and not exists (
    select 1
    from public.connection_resolution_cases rc
    where rc.request_id = requests.id
  )
);
