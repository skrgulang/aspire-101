alter table public.market_orders add column if not exists delivery_address jsonb;
alter table public.market_orders add column if not exists delivery_instructions text;

create or replace function public.set_market_order_delivery_address(
  p_connection_id uuid,
  p_delivery_address jsonb,
  p_delivery_instructions text default null
)
returns public.market_orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  o public.market_orders;
  v_street1 text;
  v_city text;
  v_state text;
  v_zip text;
  v_country text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into o
  from public.market_orders
  where connection_id = p_connection_id
  for update;

  if not found then raise exception 'MARKET_ORDER_NOT_FOUND'; end if;
  if o.buyer_id <> auth.uid() then raise exception 'NOT_BUYER'; end if;
  if o.fulfillment_method not in ('shipping','aspirer_delivery') then raise exception 'DELIVERY_ADDRESS_NOT_REQUIRED'; end if;

  v_street1 := btrim(coalesce(p_delivery_address->>'street1',''));
  v_city := btrim(coalesce(p_delivery_address->>'city',''));
  v_state := btrim(coalesce(p_delivery_address->>'state',''));
  v_zip := btrim(coalesce(p_delivery_address->>'zip',''));
  v_country := upper(btrim(coalesce(p_delivery_address->>'country','US')));

  if v_street1 = '' or v_city = '' or v_state = '' or v_zip = '' or v_country = '' then
    raise exception 'DELIVERY_ADDRESS_INCOMPLETE';
  end if;

  update public.market_orders
  set delivery_address = jsonb_build_object(
        'name', nullif(btrim(coalesce(p_delivery_address->>'name','')), ''),
        'street1', v_street1,
        'street2', nullif(btrim(coalesce(p_delivery_address->>'street2','')), ''),
        'city', v_city,
        'state', v_state,
        'zip', v_zip,
        'country', v_country
      ),
      delivery_instructions = nullif(left(btrim(coalesce(p_delivery_instructions,'')), 500), ''),
      updated_at = now()
  where id = o.id
  returning * into o;

  return o;
end;
$function$;
