-- Compatibility bridge for the current Marketplace checkout UI.
-- It still records the first seller-delivery inquiry as a request_response.
-- Mirror that very specific message into the structured quote workflow so the
-- seller can Accept & quote from /transactions without exposing an address.

create or replace function public.bridge_marketplace_seller_delivery_response()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r public.requests%rowtype;
  v_area text;
  v_note text;
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

  -- Current UI emits: "... to the City, ST area? ... Notes: ..."
  v_area := nullif(btrim(substring(new.message from ' to the ([^?]+) area\?')), '');
  if v_area is null then return new; end if;

  v_note := nullif(btrim(substring(new.message from ' Notes: (.*?)\. I[’'']ll share')), '');

  insert into public.market_seller_delivery_quotes (
    request_id,buyer_id,seller_id,buyer_area,buyer_note,status,
    delivery_cents,seller_note,quoted_at,accepted_at,declined_at
  ) values (
    new.request_id,new.responder_id,r.poster_id,left(v_area,180),left(v_note,500),'requested',
    null,null,null,null,null
  )
  on conflict (request_id,buyer_id) do update set
    buyer_area=excluded.buyer_area,
    buyer_note=excluded.buyer_note,
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
after insert or update of message,status on public.request_responses
for each row execute function public.bridge_marketplace_seller_delivery_response();
