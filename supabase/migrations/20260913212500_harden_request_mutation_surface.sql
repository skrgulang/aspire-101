-- Keep user-facing request creation/management working while removing direct access
-- to server-owned moderation, trust and lifecycle columns.

revoke insert, update on table public.requests from authenticated;

grant insert (
  poster_id,
  kind,
  category,
  title,
  details,
  campus_id,
  latitude,
  longitude,
  scheduled_start_at,
  scheduled_end_at,
  timezone,
  meeting_label,
  amount_cents,
  currency,
  payment_method,
  market_intent,
  item_condition,
  price_negotiable,
  fulfillment_method,
  quantity,
  language_code,
  cover_image_url,
  cover_image_source,
  cover_image_asset_id
) on public.requests to authenticated;

grant update (
  status,
  cover_image_url,
  cover_image_source,
  cover_image_asset_id
) on public.requests to authenticated;

drop policy if exists "owners delete their requests" on public.requests;
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
      and c.requester_id = (select auth.uid())
  )
);

create or replace function public.guard_authenticated_request_status_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated'
     and new.status is distinct from old.status
     and not (old.status = 'open' and new.status = 'cancelled') then
    raise exception 'Request status can only be closed by its owner';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_authenticated_request_status_transition_tg on public.requests;
create trigger guard_authenticated_request_status_transition_tg
before update on public.requests
for each row
execute function public.guard_authenticated_request_status_transition();
