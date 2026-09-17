-- Buyer wanted posts are not seller listings, so they should not be held for a
-- missing public seller area. Seller listings still require a broad public area.
create or replace function public.aspire_market_review_flags(
  p_text text,
  p_kind text,
  p_market_intent text,
  p_amount_cents integer,
  p_item_condition text,
  p_fulfillment_methods text[],
  p_seller_area text,
  p_ai_flags text[],
  p_rule_flags text[],
  p_behavior_flags text[],
  p_has_photo boolean
)
returns text[]
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  t text := lower(coalesce(p_text,''));
  flags text[] := '{}'::text[];
  ai_flags text[] := coalesce(p_ai_flags,'{}'::text[]);
  rule_flags text[] := coalesce(p_rule_flags,'{}'::text[]);
  behavior_flags text[] := coalesce(p_behavior_flags,'{}'::text[]);
begin
  if p_kind <> 'buy_sell' then return flags; end if;
  if ai_flags && array['regulated_or_prohibited_item']::text[] or rule_flags && array['restricted_market_term']::text[] then flags := array_append(flags,'regulated_or_prohibited_item'); end if;
  if ai_flags && array['marketplace_prohibited_listing']::text[] then flags := array_append(flags,'marketplace_prohibited_listing'); end if;
  if ai_flags && array['credential_trade']::text[] then flags := array_append(flags,'credential_trade'); end if;
  if ai_flags && array['sensitive_personal_data']::text[] then flags := array_append(flags,'sensitive_personal_data'); end if;
  if ai_flags && array['off_platform_payment','off_platform_evasion']::text[] then flags := array_append(flags,'off_platform_payment_or_evasion'); end if;
  if behavior_flags && array['price_far_below_campus_baseline','price_far_above_campus_baseline']::text[] then flags := array_append(flags,'price_anomaly'); end if;
  if behavior_flags && array['repeated_duplicate_listing']::text[] then flags := array_append(flags,'duplicate_listing'); end if;
  if t ~ '(^|[^a-z])(counterfeit|replica|fake designer|stolen|stolen goods|hot item|gift[ -]?card|account for sale|game account)([^a-z]|$)' then flags := array_append(flags,'prohibited_listing_type'); end if;
  if t ~ '(^|[^a-z])(gun|firearm|ammo|ammunition|silencer|switchblade|taser|weed|marijuana|cocaine|fentanyl|vape|nicotine|steroid)([^a-z]|$)' then flags := array_append(flags,'regulated_or_prohibited_item'); end if;

  if coalesce(p_market_intent,'sell') = 'sell' then
    if coalesce(p_amount_cents,0) <= 0 then flags := array_append(flags,'missing_price'); end if;
    if p_item_condition is null then flags := array_append(flags,'missing_condition'); end if;
    if not p_has_photo then flags := array_append(flags,'missing_item_photo'); end if;
    if nullif(btrim(coalesce(p_seller_area,'')),'') is null then flags := array_append(flags,'missing_public_seller_area'); end if;
  end if;

  if coalesce(array_length(p_fulfillment_methods,1),0) = 0 then flags := array_append(flags,'missing_fulfillment_method'); end if;
  return array(select distinct x from unnest(flags) as x where x is not null);
end;
$function$;
