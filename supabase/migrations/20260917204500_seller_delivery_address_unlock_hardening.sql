-- Keep exact seller-delivery addresses unavailable unless a protected payment
-- is in a state that proves funds were actually secured.

create or replace function public.get_market_seller_delivery_address(p_market_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.market_orders%rowtype;
  v_private public.market_seller_delivery_private_addresses%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_order
  from public.market_orders
  where id = p_market_order_id;

  if not found or v_order.fulfillment_method <> 'seller_delivery' then
    raise exception 'SELLER_DELIVERY_ORDER_NOT_FOUND';
  end if;

  if auth.uid() <> v_order.seller_id
     and auth.uid() <> v_order.buyer_id
     and not public.is_admin() then
    raise exception 'NOT_ORDER_PARTICIPANT';
  end if;

  -- Buyer can always retrieve the address they supplied. Seller access is
  -- stricter: awaiting, failed, cancelled, refunded, or off-platform orders
  -- never expose the exact address.
  if auth.uid() = v_order.seller_id
     and v_order.status not in ('paid','handoff_confirmed','release_ready','released','disputed') then
    raise exception 'ADDRESS_LOCKED_UNTIL_PAYMENT';
  end if;

  select * into v_private
  from public.market_seller_delivery_private_addresses
  where market_order_id = p_market_order_id;

  if not found then raise exception 'DELIVERY_ADDRESS_NOT_FOUND'; end if;

  return jsonb_build_object(
    'address', v_private.address,
    'instructions', v_private.instructions
  );
end;
$function$;

grant execute on function public.get_market_seller_delivery_address(uuid) to authenticated;
