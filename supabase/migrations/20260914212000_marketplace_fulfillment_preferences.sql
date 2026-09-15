-- Seller-owned multi-select fulfillment preferences for marketplace listings.

create or replace function public.set_marketplace_fulfillment_methods(
  p_request_id uuid,
  p_methods text[]
)
returns public.requests
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.requests%rowtype;
  v_methods text[];
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.can_user_interact(auth.uid()) then raise exception 'ACCOUNT_RESTRICTED'; end if;

  select * into r from public.requests where id = p_request_id for update;
  if not found or r.poster_id <> auth.uid() then raise exception 'LISTING_NOT_OWNED'; end if;
  if r.kind <> 'buy_sell' or r.market_intent <> 'sell' then raise exception 'NOT_SELLER_LISTING'; end if;
  if r.status <> 'open' then raise exception 'LISTING_NOT_OPEN'; end if;
  if p_methods is null or cardinality(p_methods) = 0 then raise exception 'FULFILLMENT_REQUIRED'; end if;
  if exists (
    select 1 from unnest(p_methods) as method
    where method not in ('campus_pickup','shipping','aspirer_delivery')
  ) then
    raise exception 'INVALID_FULFILLMENT_METHOD';
  end if;

  select array_agg(method order by first_position)
  into v_methods
  from (
    select method, min(position) as first_position
    from unnest(p_methods) with ordinality as value(method, position)
    group by method
  ) deduped;

  if v_methods is null or cardinality(v_methods) = 0 then raise exception 'FULFILLMENT_REQUIRED'; end if;

  update public.requests
  set fulfillment_methods = v_methods,
      fulfillment_method = v_methods[1],
      updated_at = now()
  where id = r.id
  returning * into r;

  return r;
end;
$$;

revoke all on function public.set_marketplace_fulfillment_methods(uuid,text[]) from public, anon;
grant execute on function public.set_marketplace_fulfillment_methods(uuid,text[]) to authenticated, service_role;
