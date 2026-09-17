-- Safe owner edits for blocked/rejected posts, followed by a fresh moderation pass.

-- Keep the legacy single-value fulfillment column compatible with the newer
-- multi-method marketplace model. Seller/Aspirer delivery live only in the array.
create or replace function public.guard_request_fulfillment_methods()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_methods text[];
  v_method text;
begin
  if new.kind = 'buy_sell' then
    v_methods := coalesce(new.fulfillment_methods, array[coalesce(new.fulfillment_method, 'campus_pickup')]);
    if array_length(v_methods, 1) is null then v_methods := array['campus_pickup']; end if;

    foreach v_method in array v_methods loop
      if v_method not in ('campus_pickup','shipping','aspirer_delivery','seller_delivery') then
        raise exception 'INVALID_FULFILLMENT_METHOD';
      end if;
    end loop;

    new.fulfillment_methods := v_methods;
    if 'campus_pickup' = any(v_methods) then new.fulfillment_method := 'campus_pickup';
    elsif 'shipping' = any(v_methods) then new.fulfillment_method := 'shipping';
    else new.fulfillment_method := null;
    end if;
  else
    new.fulfillment_method := null;
    new.fulfillment_methods := array['campus_pickup'];
  end if;

  return new;
end;
$$;

-- Any review-sensitive edit invalidates prior AI results so an old scan can
-- never be reused to approve newly edited text, language, price, or delivery data.
create or replace function public.guard_request_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  flags text[];
  review_sensitive_changed boolean := tg_op = 'INSERT';
begin
  if tg_op = 'UPDATE' then
    review_sensitive_changed := new.title is distinct from old.title
      or new.details is distinct from old.details
      or new.category is distinct from old.category
      or new.kind is distinct from old.kind
      or new.language_code is distinct from old.language_code
      or new.amount_cents is distinct from old.amount_cents
      or new.item_condition is distinct from old.item_condition
      or new.price_negotiable is distinct from old.price_negotiable
      or new.fulfillment_method is distinct from old.fulfillment_method
      or new.fulfillment_methods is distinct from old.fulfillment_methods
      or new.seller_area is distinct from old.seller_area
      or new.shipping_paid_by_default is distinct from old.shipping_paid_by_default
      or new.shipping_paid_by_preference is distinct from old.shipping_paid_by_preference
      or new.seller_delivery_mode is distinct from old.seller_delivery_mode
      or new.seller_delivery_price_cents is distinct from old.seller_delivery_price_cents;
  end if;

  flags := public.aspire_content_flags(concat_ws(' ', new.title, new.details, new.category));
  new.moderation_flags := flags;
  new.moderation_version := 'rules_v1';

  if flags && array['profanity','hate_slur','threat_or_abuse']::text[] then
    raise exception 'CONTENT_POLICY_BLOCKED';
  end if;

  if review_sensitive_changed then
    new.moderation_status := 'pending';
    new.moderated_by := null;
    new.moderated_at := null;
    new.moderation_reason := null;
    new.ai_moderation_status := 'not_scanned';
    new.ai_risk_level := 'unknown';
    new.ai_risk_score := null;
    new.ai_recommended_action := 'review';
    new.ai_policy_flags := '{}'::text[];
    new.ai_summary := null;
    new.ai_last_scanned_at := null;
    new.behavior_risk_score := null;
    new.behavior_flags := '{}'::text[];
    new.trust_score_snapshot := null;
    new.trust_band_snapshot := null;
  end if;

  return new;
end;
$$;

drop trigger if exists requests_content_moderation_tg on public.requests;
create trigger requests_content_moderation_tg
before insert or update of
  title, details, category, kind, language_code, amount_cents, item_condition,
  price_negotiable, fulfillment_method, fulfillment_methods, seller_area,
  shipping_paid_by_default, shipping_paid_by_preference,
  seller_delivery_mode, seller_delivery_price_cents
on public.requests
for each row execute function public.guard_request_content();

-- Browser users may edit their own post content, but must never directly write
-- moderation-owned state. Alphabetic trigger ordering makes this guard run before
-- trusted content/layer triggers that derive moderation state from legitimate edits.
create or replace function public.guard_authenticated_request_moderation_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated' and (
    new.moderation_status is distinct from old.moderation_status
    or new.moderation_flags is distinct from old.moderation_flags
    or new.moderation_version is distinct from old.moderation_version
    or new.moderated_by is distinct from old.moderated_by
    or new.moderated_at is distinct from old.moderated_at
    or new.moderation_reason is distinct from old.moderation_reason
    or new.ai_moderation_status is distinct from old.ai_moderation_status
    or new.ai_risk_level is distinct from old.ai_risk_level
    or new.ai_risk_score is distinct from old.ai_risk_score
    or new.ai_recommended_action is distinct from old.ai_recommended_action
    or new.ai_policy_flags is distinct from old.ai_policy_flags
    or new.ai_summary is distinct from old.ai_summary
    or new.ai_last_scanned_at is distinct from old.ai_last_scanned_at
    or new.behavior_risk_score is distinct from old.behavior_risk_score
    or new.behavior_flags is distinct from old.behavior_flags
    or new.trust_score_snapshot is distinct from old.trust_score_snapshot
    or new.trust_band_snapshot is distinct from old.trust_band_snapshot
    or new.post_review_status is distinct from old.post_review_status
    or new.post_review_flags is distinct from old.post_review_flags
    or new.post_review_summary is distinct from old.post_review_summary
    or new.language_review_status is distinct from old.language_review_status
    or new.language_review_flags is distinct from old.language_review_flags
    or new.language_review_summary is distinct from old.language_review_summary
    or new.language_detected is distinct from old.language_detected
    or new.market_review_status is distinct from old.market_review_status
    or new.market_review_flags is distinct from old.market_review_flags
    or new.market_review_summary is distinct from old.market_review_summary
    or new.layered_review_version is distinct from old.layered_review_version
    or new.layered_reviewed_at is distinct from old.layered_reviewed_at
  ) then
    raise exception 'MODERATION_FIELDS_READ_ONLY';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_authenticated_request_moderation_fields() from public;

drop trigger if exists a_guard_authenticated_request_moderation_fields_tg on public.requests;
create trigger a_guard_authenticated_request_moderation_fields_tg
before update on public.requests
for each row execute function public.guard_authenticated_request_moderation_fields();

-- Photo changes also invalidate approval. This prevents an approved marketplace
-- listing from deleting/replacing its reviewed image while remaining public.
create or replace function public.invalidate_request_moderation_for_media()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
begin
  v_request_id := case when tg_op = 'DELETE' then old.request_id else new.request_id end;

  update public.requests
  set
    moderation_status = 'pending',
    moderated_by = null,
    moderated_at = null,
    moderation_reason = null,
    ai_moderation_status = 'not_scanned',
    ai_risk_level = 'unknown',
    ai_risk_score = null,
    ai_recommended_action = 'review',
    ai_policy_flags = '{}'::text[],
    ai_summary = null,
    ai_last_scanned_at = null,
    behavior_risk_score = null,
    behavior_flags = '{}'::text[],
    trust_score_snapshot = null,
    trust_band_snapshot = null,
    post_review_status = 'pending',
    post_review_flags = '{}'::text[],
    post_review_summary = 'Waiting for a fresh review after a photo change.',
    language_review_status = 'pending',
    language_review_flags = '{}'::text[],
    language_review_summary = 'Waiting for a fresh review after a photo change.',
    market_review_status = case when kind = 'buy_sell' then 'pending' else 'not_applicable' end,
    market_review_flags = '{}'::text[],
    market_review_summary = case when kind = 'buy_sell' then 'Waiting for a fresh marketplace review after a photo change.' else 'Not a marketplace listing.' end,
    layered_reviewed_at = null,
    updated_at = now()
  where id = v_request_id and status = 'open';

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.invalidate_request_moderation_for_media() from public;

drop trigger if exists request_media_invalidate_review_tg on public.request_media;
create trigger request_media_invalidate_review_tg
after insert or delete on public.request_media
for each row execute function public.invalidate_request_moderation_for_media();

create or replace function public.resubmit_request_for_review(
  p_request_id uuid,
  p_title text,
  p_details text,
  p_language_code text,
  p_amount_cents integer,
  p_item_condition text,
  p_price_negotiable boolean,
  p_fulfillment_methods text[],
  p_seller_area text,
  p_shipping_paid_by text,
  p_seller_delivery_mode text,
  p_seller_delivery_price_cents integer
)
returns public.requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_request public.requests%rowtype;
  v_methods text[];
  v_shipping text;
  v_seller_mode text;
  v_seller_price integer;
  v_legacy_fulfillment text;
begin
  if v_user is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  select * into v_request
  from public.requests
  where id = p_request_id and poster_id = v_user
  for update;

  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_request.status <> 'open' then raise exception 'REQUEST_NOT_EDITABLE'; end if;
  if v_request.moderation_status not in ('blocked','rejected') then raise exception 'REQUEST_NOT_READY_FOR_RESUBMIT'; end if;

  if exists (
    select 1 from public.connections c
    where c.request_id = p_request_id and c.status <> 'cancelled'
  ) then
    raise exception 'REQUEST_HAS_CONNECTION';
  end if;

  if nullif(btrim(coalesce(p_title,'')),'') is null or char_length(btrim(p_title)) > 180 then
    raise exception 'INVALID_TITLE';
  end if;
  if char_length(coalesce(p_details,'')) > 5000 then raise exception 'DETAILS_TOO_LONG'; end if;
  if p_language_code not in ('en','zh','es','ko','ja','fr','hi','ar','vi','other') then raise exception 'INVALID_LANGUAGE'; end if;

  if v_request.kind in ('paid_help','split_cost','buy_sell') and coalesce(p_amount_cents,0) <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  if v_request.kind = 'buy_sell' then
    v_methods := coalesce(p_fulfillment_methods,'{}'::text[]);
    if cardinality(v_methods) < 1 or cardinality(v_methods) > 4
       or not (v_methods <@ array['campus_pickup','shipping','aspirer_delivery','seller_delivery']::text[]) then
      raise exception 'INVALID_FULFILLMENT_METHODS';
    end if;
    if nullif(btrim(coalesce(p_seller_area,'')),'') is null or char_length(btrim(p_seller_area)) > 120 then
      raise exception 'INVALID_SELLER_AREA';
    end if;
    if coalesce(v_request.market_intent,'sell') = 'sell'
       and p_item_condition not in ('new','like_new','good','fair','for_parts') then
      raise exception 'INVALID_ITEM_CONDITION';
    end if;

    if 'shipping' = any(v_methods) then
      v_shipping := coalesce(nullif(p_shipping_paid_by,''),'buyer');
      if v_shipping not in ('buyer','seller','either') then raise exception 'INVALID_SHIPPING_PAYER'; end if;
    else
      v_shipping := null;
    end if;

    if 'seller_delivery' = any(v_methods) then
      v_seller_mode := coalesce(nullif(p_seller_delivery_mode,''),'negotiable');
      if v_seller_mode not in ('free','fixed','negotiable') then raise exception 'INVALID_SELLER_DELIVERY_MODE'; end if;
      if v_seller_mode = 'fixed' then
        if coalesce(p_seller_delivery_price_cents,0) <= 0 then raise exception 'INVALID_SELLER_DELIVERY_PRICE'; end if;
        v_seller_price := p_seller_delivery_price_cents;
      elsif v_seller_mode = 'free' then
        v_seller_price := 0;
      else
        v_seller_price := null;
      end if;
    else
      v_seller_mode := null;
      v_seller_price := null;
    end if;

    if 'campus_pickup' = any(v_methods) then v_legacy_fulfillment := 'campus_pickup';
    elsif 'shipping' = any(v_methods) then v_legacy_fulfillment := 'shipping';
    else v_legacy_fulfillment := null;
    end if;
  else
    v_methods := v_request.fulfillment_methods;
    v_shipping := v_request.shipping_paid_by_default;
    v_seller_mode := v_request.seller_delivery_mode;
    v_seller_price := v_request.seller_delivery_price_cents;
    v_legacy_fulfillment := v_request.fulfillment_method;
  end if;

  update public.requests
  set
    title = btrim(p_title),
    details = nullif(btrim(coalesce(p_details,'')),''),
    language_code = p_language_code,
    amount_cents = case when v_request.kind in ('paid_help','split_cost','buy_sell') then p_amount_cents else null end,
    item_condition = case when v_request.kind = 'buy_sell' and coalesce(v_request.market_intent,'sell') = 'sell' then p_item_condition else v_request.item_condition end,
    price_negotiable = case when v_request.kind = 'buy_sell' then coalesce(p_price_negotiable,false) else v_request.price_negotiable end,
    fulfillment_method = case when v_request.kind = 'buy_sell' then v_legacy_fulfillment else v_request.fulfillment_method end,
    fulfillment_methods = case when v_request.kind = 'buy_sell' then v_methods else v_request.fulfillment_methods end,
    seller_area = case when v_request.kind = 'buy_sell' then left(btrim(p_seller_area),120) else v_request.seller_area end,
    shipping_paid_by_default = case when v_request.kind = 'buy_sell' then v_shipping else v_request.shipping_paid_by_default end,
    shipping_paid_by_preference = case when v_request.kind = 'buy_sell' then v_shipping else v_request.shipping_paid_by_preference end,
    seller_delivery_mode = case when v_request.kind = 'buy_sell' then v_seller_mode else v_request.seller_delivery_mode end,
    seller_delivery_price_cents = case when v_request.kind = 'buy_sell' then v_seller_price else v_request.seller_delivery_price_cents end,
    moderation_status = 'pending',
    moderated_by = null,
    moderated_at = null,
    moderation_reason = null,
    ai_moderation_status = 'not_scanned',
    ai_risk_level = 'unknown',
    ai_risk_score = null,
    ai_recommended_action = 'review',
    ai_policy_flags = '{}'::text[],
    ai_summary = null,
    ai_last_scanned_at = null,
    behavior_risk_score = null,
    behavior_flags = '{}'::text[],
    trust_score_snapshot = null,
    trust_band_snapshot = null,
    post_review_status = 'pending',
    post_review_flags = '{}'::text[],
    post_review_summary = 'Waiting for a fresh review after the owner edited this post.',
    language_review_status = 'pending',
    language_review_flags = '{}'::text[],
    language_review_summary = 'Waiting for a fresh language review after the owner edited this post.',
    market_review_status = case when v_request.kind = 'buy_sell' then 'pending' else 'not_applicable' end,
    market_review_flags = '{}'::text[],
    market_review_summary = case when v_request.kind = 'buy_sell' then 'Waiting for a fresh marketplace review after the owner edited this post.' else 'Not a marketplace listing.' end,
    layered_reviewed_at = null,
    updated_at = now()
  where id = p_request_id
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function public.resubmit_request_for_review(uuid,text,text,text,integer,text,boolean,text[],text,text,text,integer) from public;
grant execute on function public.resubmit_request_for_review(uuid,text,text,text,integer,text,boolean,text[],text,text,text,integer) to authenticated;
