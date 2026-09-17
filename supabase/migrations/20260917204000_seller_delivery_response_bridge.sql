-- Compatibility bridge for the current Marketplace checkout UI.
-- The current checkout still submits its first Seller Delivery inquiry through
-- request_responses. Intercept that exact flow before storage, keep only the
-- general area, and mirror it into the structured quote workflow.

create or replace function public.bridge_marketplace_seller_delivery_response()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r public.requests%rowtype;
  v_area text;
begin
  if new.message is null or new.status <> 'pending' then return new; end if;
  if new.message not ilike 'Would you be willing to deliver%I’ll share the exact address privately after we agree.%'
     and new.message not ilike 'Would you be willing to deliver%I''ll share the exact address privately after we agree.%' then
    return new;
  end if;

  select * into r from public.requests where id=new.request_id;
  if not found
     or r.kind <> 'buy_sell'
     or r.market_intent <> 'sell'
     or r.status <> 'open'
     or r.moderation_status <> 'approved'
     or not ('seller_delivery' = any(coalesce(r.fulfillment_methods,array[]::text[]))) then
    return new;
  end if;

  -- Current UI emits: "... to the City, ST area? ...". Extract only that
  -- general area. Any optional free-form note is deliberately discarded so a
  -- buyer cannot accidentally leak a street, dorm, room, or other exact detail
  -- through the legacy response channel.
  v_area := nullif(btrim(substring(new.message from ' to the ([^?]+) area\?')), '');
  if v_area is null then return new; end if;
  v_area := left(v_area,180);

  -- Because this is a BEFORE trigger, the stored response itself is scrubbed.
  new.message := format(
    'Seller Delivery request for general area: %s. Exact address stays private until protected payment is secured.',
    v_area
  );

  insert into public.market_seller_delivery_quotes (
    request_id,buyer_id,seller_id,buyer_area,buyer_note,status,
    delivery_cents,seller_note,quoted_at,accepted_at,declined_at
  ) values (
    new.request_id,new.responder_id,r.poster_id,v_area,null,'requested',
    null,null,null,null,null
  )
  on conflict (request_id,buyer_id) do update set
    buyer_area=excluded.buyer_area,
    buyer_note=null,
    status=case when public.market_seller_delivery_quotes.status='accepted' then 'accepted' else 'requested' end,
    delivery_cents=case when public.market_seller_delivery_quotes.status='accepted' then public.market_seller_delivery_quotes.delivery_cents else null end,
    seller_note=case when public.market_seller_delivery_quotes.status='accepted' then public.market_seller_delivery_quotes.seller_note else null end,
    quoted_at=case when public.market_seller_delivery_quotes.status='accepted' then public.market_seller_delivery_quotes.quoted_at else null end,
    declined_at=null,
    updated_at=now();

  return new;
end;
$function$;

drop trigger if exists trg_bridge_marketplace_seller_delivery_response on public.request_responses;
create trigger trg_bridge_marketplace_seller_delivery_response
before insert or update of message,status on public.request_responses
for each row execute function public.bridge_marketplace_seller_delivery_response();
