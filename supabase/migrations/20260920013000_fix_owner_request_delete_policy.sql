-- Fix owner request deletion without granting authenticated broad read access
-- to finance / resolution tables referenced by the deletion eligibility check.

create or replace function public.can_delete_owned_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.requests r
    where r.id = p_request_id
      and r.poster_id = auth.uid()
      and not exists (
        select 1 from public.connections c
        where c.request_id = r.id and c.status <> 'cancelled'
      )
      and not exists (
        select 1 from public.market_orders mo
        where mo.request_id = r.id
      )
      and not exists (
        select 1 from public.connection_payments cp
        where cp.request_id = r.id
      )
      and not exists (
        select 1 from public.connection_resolution_cases rc
        where rc.request_id = r.id
      )
  );
$$;

revoke all on function public.can_delete_owned_request(uuid) from public, anon;
grant execute on function public.can_delete_owned_request(uuid) to authenticated;

drop policy if exists "owners delete unconnected requests" on public.requests;

create policy "owners delete unconnected requests"
on public.requests
for delete
to authenticated
using (public.can_delete_owned_request(id));
