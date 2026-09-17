-- Expand Marketplace policy detection beyond English while keeping ambiguous
-- localized terms in human review instead of hard-blocking them. Also replace
-- raw-flag Marketplace summaries with moderator-readable reasons.

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

  -- Signals from the AI/rule/behavior layers remain authoritative inputs.
  if ai_flags && array['regulated_or_prohibited_item']::text[]
     or rule_flags && array['restricted_market_term']::text[] then
    flags := array_append(flags,'regulated_or_prohibited_item');
  end if;
  if ai_flags && array['marketplace_prohibited_listing']::text[] then flags := array_append(flags,'marketplace_prohibited_listing'); end if;
  if ai_flags && array['credential_trade']::text[] then flags := array_append(flags,'credential_trade'); end if;
  if ai_flags && array['sensitive_personal_data']::text[] then flags := array_append(flags,'sensitive_personal_data'); end if;
  if ai_flags && array['off_platform_payment','off_platform_evasion']::text[] then flags := array_append(flags,'off_platform_payment_or_evasion'); end if;
  if behavior_flags && array['price_far_below_campus_baseline','price_far_above_campus_baseline']::text[] then flags := array_append(flags,'price_anomaly'); end if;
  if behavior_flags && array['repeated_duplicate_listing']::text[] then flags := array_append(flags,'duplicate_listing'); end if;

  -- Prohibited listing types: English plus high-confidence Chinese, Japanese,
  -- Korean, and Spanish phrases. These map to the existing hard-block category.
  if t ~ '(^|[^a-z])(counterfeit|replica|fake designer|stolen|stolen goods|hot item|gift[ -]?card|account for sale|game account)([^a-z]|$)'
     or t ~ '(高仿|假货|假貨|仿品|赃物|贓物|偷来的|偷來的|账号出售|帳號出售|游戏账号|遊戲帳號|礼品卡|禮品卡)'
     or t ~ '(偽物|コピー品|盗品|アカウント販売|ゲームアカウント|ギフトカード)'
     or t ~ '(가품|짝퉁|도난품|계정[[:space:]]*판매|게임[[:space:]]*계정|기프트[[:space:]]*카드)'
     or t ~ '(falsificación|falsificacion|tarjeta[[:space:]]+de[[:space:]]+regalo|cuenta[[:space:]]+en[[:space:]]+venta|cuenta[[:space:]]+de[[:space:]]+juego)' then
    flags := array_append(flags,'prohibited_listing_type');
  end if;

  -- High-confidence regulated/prohibited goods. Avoid single-character CJK
  -- matches so harmless phrases such as color names do not get hard-blocked.
  if t ~ '(^|[^a-z])(gun|firearm|ammo|ammunition|silencer|switchblade|taser|weed|marijuana|cocaine|fentanyl|vape|nicotine|steroid)([^a-z]|$)'
     or t ~ '(枪支|槍支|枪械|槍械|手枪|手槍|步枪|步槍|子弹|子彈|弹药|彈藥|消音器|电击枪|電擊槍|大麻|可卡因|芬太尼|电子烟|電子煙|尼古丁)'
     or t ~ '(実銃|拳銃|ライフル|弾薬|実包|サイレンサー|スタンガン|大麻|コカイン|フェンタニル|電子タバコ|ニコチン)'
     or t ~ '(총기|권총|소총|탄약|소음기|테이저|대마|마리화나|코카인|펜타닐|전자담배|니코틴)'
     or t ~ '(arma[[:space:]]+de[[:space:]]+fuego|pistola|rifle|munición|municion|silenciador|marihuana|cocaína|cocaina|fentanilo|nicotina)' then
    flags := array_append(flags,'regulated_or_prohibited_item');
  end if;

  -- Ambiguous age-/prescription-/weapon-adjacent terms go to human review,
  -- not automatic blocking. This catches more languages without overreaching.
  if t ~ '(^|[^a-z])(knife|alcohol|beer|wine|liquor|prescription|medication)([^a-z]|$)'
     or t ~ '(刀具|折刀|酒类|酒類|啤酒|葡萄酒|处方药|處方藥|药品|藥品|类固醇|類固醇)'
     or t ~ '(ナイフ|包丁|酒類|ビール|ワイン|処方薬|医薬品|ステロイド)'
     or t ~ '(칼|나이프|주류|맥주|와인|소주|처방약|의약품|스테로이드)'
     or t ~ '(cuchillo|alcohol|cerveza|vino|licor|medicamento[[:space:]]+con[[:space:]]+receta|esteroide)' then
    flags := array_append(flags,'regulated_item_needs_review');
  end if;

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

revoke all on function public.aspire_market_review_flags(text,text,text,integer,text,text[],text,text[],text[],text[],boolean) from public;

create or replace function public.aspire_market_review_reason(p_flags text[], p_status text)
returns text
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  f text[] := coalesce(p_flags,'{}'::text[]);
  reasons text[] := '{}'::text[];
begin
  if p_status = 'not_applicable' then return 'Not a marketplace listing.'; end if;
  if p_status = 'pending' then return 'Waiting for marketplace policy and image checks.'; end if;
  if p_status = 'pass' then return 'Marketplace listing checks passed.'; end if;

  if f && array['regulated_or_prohibited_item']::text[] then reasons := array_append(reasons,'possible regulated or prohibited item'); end if;
  if f && array['regulated_item_needs_review']::text[] then reasons := array_append(reasons,'age-, prescription-, or weapon-adjacent item needs human classification'); end if;
  if f && array['marketplace_prohibited_listing','prohibited_listing_type']::text[] then reasons := array_append(reasons,'possible prohibited listing type'); end if;
  if f && array['credential_trade']::text[] then reasons := array_append(reasons,'possible account or credential trade'); end if;
  if f && array['sensitive_personal_data']::text[] then reasons := array_append(reasons,'sensitive personal information may be exposed'); end if;
  if f && array['off_platform_payment_or_evasion']::text[] then reasons := array_append(reasons,'possible attempt to move payment or checkout off-platform'); end if;
  if f && array['price_anomaly']::text[] then reasons := array_append(reasons,'price needs a reasonableness check'); end if;
  if f && array['duplicate_listing']::text[] then reasons := array_append(reasons,'possible duplicate listing'); end if;
  if f && array['missing_item_photo']::text[] then reasons := array_append(reasons,'seller listing is missing a real item photo'); end if;
  if f && array['missing_public_seller_area']::text[] then reasons := array_append(reasons,'seller listing is missing a broad public selling area'); end if;
  if f && array['missing_price']::text[] then reasons := array_append(reasons,'seller listing is missing a price'); end if;
  if f && array['missing_condition']::text[] then reasons := array_append(reasons,'seller listing is missing item condition'); end if;
  if f && array['missing_fulfillment_method']::text[] then reasons := array_append(reasons,'listing is missing a fulfillment option'); end if;

  if cardinality(reasons) = 0 then
    return case when p_status='block'
      then 'Marketplace policy requires blocking or a moderator override.'
      else 'Marketplace policy signals need human review.' end;
  end if;

  return case when p_status='block' then 'BLOCK — ' else 'REVIEW — ' end
    || array_to_string(reasons, '; ') || '.';
end;
$function$;

revoke all on function public.aspire_market_review_reason(text[],text) from public;

-- The existing layered trigger computes flags/status first. PostgreSQL runs
-- same-timing triggers by name, so this z-prefixed trigger runs afterward and
-- replaces the raw flag-list summary with human-readable review guidance.
create or replace function public.sync_request_market_review_summary()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  new.market_review_summary := public.aspire_market_review_reason(new.market_review_flags,new.market_review_status);
  new.layered_review_version := 'layers_v2_multilingual_market';
  return new;
end;
$function$;

revoke all on function public.sync_request_market_review_summary() from public;

drop trigger if exists z_requests_market_review_summary_tg on public.requests;
create trigger z_requests_market_review_summary_tg
before insert or update of
  title, details, category, kind, language_code, amount_cents, item_condition,
  fulfillment_method, fulfillment_methods, seller_area, moderation_flags,
  ai_moderation_status, ai_risk_level, ai_risk_score, ai_recommended_action,
  ai_policy_flags, behavior_risk_score, behavior_flags
on public.requests
for each row execute function public.sync_request_market_review_summary();

-- Recalculate the small active scanned Marketplace set without touching scan
-- timestamps or creating a second AI audit event.
update public.requests
set ai_risk_score = ai_risk_score
where kind='buy_sell'
  and status in ('open','matched','in_progress')
  and ai_moderation_status='complete';
