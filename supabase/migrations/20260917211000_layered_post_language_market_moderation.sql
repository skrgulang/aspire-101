-- Layered moderation for Aspire 101.
-- Final publication still uses requests.moderation_status, but three independent
-- review lanes make the decision explainable: general post safety, language,
-- and marketplace policy.

alter table public.requests
  add column if not exists post_review_status text not null default 'pending',
  add column if not exists post_review_flags text[] not null default '{}'::text[],
  add column if not exists post_review_summary text,
  add column if not exists language_review_status text not null default 'pending',
  add column if not exists language_review_flags text[] not null default '{}'::text[],
  add column if not exists language_detected text not null default 'unknown',
  add column if not exists language_review_summary text,
  add column if not exists market_review_status text not null default 'not_applicable',
  add column if not exists market_review_flags text[] not null default '{}'::text[],
  add column if not exists market_review_summary text,
  add column if not exists layered_review_version text not null default 'layers_v1',
  add column if not exists layered_reviewed_at timestamptz;

alter table public.requests drop constraint if exists requests_post_review_status_check;
alter table public.requests add constraint requests_post_review_status_check
  check (post_review_status in ('pending','pass','review','block'));

alter table public.requests drop constraint if exists requests_language_review_status_check;
alter table public.requests add constraint requests_language_review_status_check
  check (language_review_status in ('pending','pass','review','block'));

alter table public.requests drop constraint if exists requests_market_review_status_check;
alter table public.requests add constraint requests_market_review_status_check
  check (market_review_status in ('not_applicable','pending','pass','review','block'));

alter table public.requests drop constraint if exists requests_language_detected_check;
alter table public.requests add constraint requests_language_detected_check
  check (language_detected in ('unknown','en','zh','es','ko','ja','fr','hi','ar','vi','other','mixed'));

create index if not exists requests_post_review_queue_idx
  on public.requests (post_review_status, created_at desc)
  where status in ('open','matched','in_progress');
create index if not exists requests_language_review_queue_idx
  on public.requests (language_review_status, created_at desc)
  where status in ('open','matched','in_progress');
create index if not exists requests_market_review_queue_idx
  on public.requests (market_review_status, created_at desc)
  where kind='buy_sell' and status in ('open','matched','in_progress');

create or replace function public.aspire_detect_text_language(p_text text, p_declared text default null)
returns text
language plpgsql
immutable
set search_path = public
as $function$
declare
  t text := coalesce(p_text,'');
  declared text := lower(coalesce(p_declared,''));
  has_han boolean := t ~ '[一-龯]';
  has_kana boolean := t ~ '[ぁ-ゟ゠-ヿ]';
  has_hangul boolean := t ~ '[가-힣]';
  has_arabic boolean := t ~ '[؀-ۿ]';
  has_devanagari boolean := t ~ '[ऀ-ॿ]';
  script_count integer;
begin
  script_count := (case when has_han then 1 else 0 end)
                + (case when has_kana then 1 else 0 end)
                + (case when has_hangul then 1 else 0 end)
                + (case when has_arabic then 1 else 0 end)
                + (case when has_devanagari then 1 else 0 end);

  if has_kana then return 'ja'; end if;
  if has_hangul then return 'ko'; end if;
  if has_arabic then return 'ar'; end if;
  if has_devanagari then return 'hi'; end if;
  if has_han then return 'zh'; end if;

  -- Latin-script languages cannot be reliably separated with a regex-only
  -- detector. Preserve the declared language when it is one of Aspire's Latin
  -- options and let the AI safety scan judge the content itself.
  if declared in ('en','es','fr','vi') then return declared; end if;
  if length(btrim(t)) = 0 then return 'unknown'; end if;
  if t ~ '[A-Za-z]' then return 'en'; end if;
  if script_count > 1 then return 'mixed'; end if;
  return case when declared in ('zh','es','ko','ja','fr','hi','ar','vi','other') then declared else 'other' end;
end;
$function$;

revoke all on function public.aspire_detect_text_language(text,text) from public;

create or replace function public.aspire_language_review_flags(p_text text, p_declared text, p_rule_flags text[])
returns text[]
language plpgsql
immutable
set search_path = public
as $function$
declare
  t text := coalesce(p_text,'');
  lower_t text := lower(t);
  detected text := public.aspire_detect_text_language(t, p_declared);
  declared text := lower(coalesce(p_declared,'en'));
  flags text[] := '{}'::text[];
begin
  if position(chr(8203) in t) > 0 or position(chr(8204) in t) > 0 or position(chr(8205) in t) > 0
     or position(chr(8234) in t) > 0 or position(chr(8235) in t) > 0 or position(chr(8236) in t) > 0
     or position(chr(8237) in t) > 0 or position(chr(8238) in t) > 0 then
    flags := array_append(flags,'hidden_unicode');
  end if;

  if lower_t ~ '(!{6,}|\?{6,}|\${6,}|#{6,})' then
    flags := array_append(flags,'excessive_punctuation');
  end if;

  if regexp_count(lower_t, 'https?://|www\.') >= 3 then
    flags := array_append(flags,'link_spam');
  end if;

  if lower_t ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
     or lower_t ~ '(^|[^0-9])([0-9][ -.()]*){10,}([^0-9]|$)' then
    flags := array_append(flags,'contact_information');
  end if;

  if coalesce(p_rule_flags,'{}'::text[]) && array['profanity']::text[] then flags := array_append(flags,'profanity'); end if;
  if coalesce(p_rule_flags,'{}'::text[]) && array['hate_slur']::text[] then flags := array_append(flags,'hate_slur'); end if;
  if coalesce(p_rule_flags,'{}'::text[]) && array['threat_or_abuse']::text[] then flags := array_append(flags,'threat_or_abuse'); end if;

  if declared <> 'other' and detected not in ('unknown','other','mixed') then
    if declared in ('zh','ja','ko','ar','hi') and declared <> detected then
      flags := array_append(flags,'declared_language_mismatch');
    elsif declared = 'en' and detected in ('zh','ja','ko','ar','hi') then
      flags := array_append(flags,'declared_language_mismatch');
    end if;
  end if;

  return array(select distinct x from unnest(flags) as x where x is not null);
end;
$function$;

revoke all on function public.aspire_language_review_flags(text,text,text[]) from public;

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
set search_path = public
as $function$
declare
  t text := lower(coalesce(p_text,''));
  flags text[] := '{}'::text[];
  ai_flags text[] := coalesce(p_ai_flags,'{}'::text[]);
  rule_flags text[] := coalesce(p_rule_flags,'{}'::text[]);
  behavior_flags text[] := coalesce(p_behavior_flags,'{}'::text[]);
begin
  if p_kind <> 'buy_sell' then return flags; end if;

  if ai_flags && array['regulated_or_prohibited_item']::text[] or rule_flags && array['restricted_market_term']::text[] then
    flags := array_append(flags,'regulated_or_prohibited_item');
  end if;
  if ai_flags && array['marketplace_prohibited_listing']::text[] then flags := array_append(flags,'marketplace_prohibited_listing'); end if;
  if ai_flags && array['credential_trade']::text[] then flags := array_append(flags,'credential_trade'); end if;
  if ai_flags && array['sensitive_personal_data']::text[] then flags := array_append(flags,'sensitive_personal_data'); end if;
  if ai_flags && array['off_platform_payment','off_platform_evasion']::text[] then flags := array_append(flags,'off_platform_payment_or_evasion'); end if;
  if behavior_flags && array['price_far_below_campus_baseline','price_far_above_campus_baseline']::text[] then flags := array_append(flags,'price_anomaly'); end if;
  if behavior_flags && array['repeated_duplicate_listing']::text[] then flags := array_append(flags,'duplicate_listing'); end if;

  if t ~ '(^|[^a-z])(counterfeit|replica|fake designer|stolen|stolen goods|hot item|gift[ -]?card|account for sale|game account)([^a-z]|$)' then
    flags := array_append(flags,'prohibited_listing_type');
  end if;
  if t ~ '(^|[^a-z])(gun|firearm|ammo|ammunition|silencer|switchblade|taser|weed|marijuana|cocaine|fentanyl|vape|nicotine|steroid)([^a-z]|$)' then
    flags := array_append(flags,'regulated_or_prohibited_item');
  end if;

  if coalesce(p_market_intent,'sell') = 'sell' then
    if coalesce(p_amount_cents,0) <= 0 then flags := array_append(flags,'missing_price'); end if;
    if p_item_condition is null then flags := array_append(flags,'missing_condition'); end if;
    if not p_has_photo then flags := array_append(flags,'missing_item_photo'); end if;
  end if;
  if coalesce(array_length(p_fulfillment_methods,1),0) = 0 then flags := array_append(flags,'missing_fulfillment_method'); end if;
  if nullif(btrim(coalesce(p_seller_area,'')),'') is null then flags := array_append(flags,'missing_public_seller_area'); end if;

  return array(select distinct x from unnest(flags) as x where x is not null);
end;
$function$;

revoke all on function public.aspire_market_review_flags(text,text,text,integer,text,text[],text,text[],text[],text[],boolean) from public;

create or replace function public.sync_request_moderation_layers()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  body_text text := concat_ws(' ',new.title,new.details,new.category);
  language_flags text[];
  market_flags text[];
  post_flags text[] := '{}'::text[];
  detected text;
  has_photo boolean := false;
  ai_done boolean := new.ai_moderation_status = 'complete';
  hard_language boolean;
  hard_market boolean;
  market_applicable boolean := new.kind = 'buy_sell';
begin
  if new.id is not null then
    select exists(select 1 from public.request_media rm where rm.request_id=new.id) into has_photo;
  end if;

  detected := public.aspire_detect_text_language(body_text,new.language_code);
  language_flags := public.aspire_language_review_flags(body_text,new.language_code,new.moderation_flags);
  market_flags := public.aspire_market_review_flags(
    body_text,new.kind,new.market_intent,new.amount_cents,new.item_condition,new.fulfillment_methods,new.seller_area,
    new.ai_policy_flags,new.moderation_flags,new.behavior_flags,has_photo
  );

  if new.ai_risk_level in ('high','critical') then post_flags := array_append(post_flags,'ai_' || new.ai_risk_level || '_risk'); end if;
  if coalesce(new.behavior_risk_score,0) >= 60 then post_flags := array_append(post_flags,'high_behavior_risk');
  elsif coalesce(new.behavior_risk_score,0) >= 25 then post_flags := array_append(post_flags,'elevated_behavior_risk'); end if;
  if coalesce(new.ai_policy_flags,'{}'::text[]) && array['scam_pressure','off_platform_contact']::text[] then post_flags := array_append(post_flags,'platform_risk_signal'); end if;
  if coalesce(new.ai_policy_flags,'{}'::text[]) && array['sensitive_personal_data']::text[] then post_flags := array_append(post_flags,'sensitive_personal_data'); end if;
  if coalesce(new.moderation_flags,'{}'::text[]) && array['profanity','hate_slur','threat_or_abuse']::text[] then post_flags := array_append(post_flags,'hard_language_policy'); end if;
  post_flags := array(select distinct x from unnest(post_flags) as x where x is not null);

  hard_language := language_flags && array['hate_slur','threat_or_abuse','profanity']::text[];
  hard_market := market_flags && array['regulated_or_prohibited_item','marketplace_prohibited_listing','credential_trade','sensitive_personal_data','prohibited_listing_type']::text[];

  new.language_detected := detected;
  new.language_review_flags := language_flags;
  new.market_review_flags := market_flags;
  new.post_review_flags := post_flags;
  new.layered_review_version := 'layers_v1';

  if not ai_done then
    new.post_review_status := 'pending';
    new.language_review_status := 'pending';
    new.market_review_status := case when market_applicable then 'pending' else 'not_applicable' end;
    new.post_review_summary := 'Waiting for the automated content and behavior scan.';
    new.language_review_summary := case when cardinality(language_flags)>0 then 'Language rules found signals; waiting for the full safety scan.' else 'Waiting for the full language safety scan.' end;
    new.market_review_summary := case when market_applicable then 'Waiting for marketplace policy and image checks.' else 'Not a marketplace listing.' end;
    new.layered_reviewed_at := null;
    new.moderation_status := 'pending';
    return new;
  end if;

  if new.ai_recommended_action='block' or new.ai_risk_level='critical' or post_flags && array['hard_language_policy','sensitive_personal_data']::text[] then
    new.post_review_status := 'block';
  elsif new.ai_risk_level in ('medium','high') or coalesce(new.behavior_risk_score,0)>=25 or cardinality(post_flags)>0 then
    new.post_review_status := 'review';
  else
    new.post_review_status := 'pass';
  end if;

  if hard_language or new.ai_risk_level='critical' then new.language_review_status := 'block';
  elsif cardinality(language_flags)>0 then new.language_review_status := 'review';
  else new.language_review_status := 'pass'; end if;

  if not market_applicable then new.market_review_status := 'not_applicable';
  elsif hard_market then new.market_review_status := 'block';
  elsif cardinality(market_flags)>0 then new.market_review_status := 'review';
  else new.market_review_status := 'pass'; end if;

  new.post_review_summary := case new.post_review_status
    when 'pass' then 'General post safety checks passed.'
    when 'review' then 'General post safety signals need review: ' || array_to_string(post_flags, ', ')
    when 'block' then 'General post safety requires blocking or a moderator override.'
    else 'Waiting for post review.' end;
  new.language_review_summary := case new.language_review_status
    when 'pass' then 'Language checks passed. Detected language: ' || detected || '.'
    when 'review' then 'Language signals need review: ' || array_to_string(language_flags, ', ')
    when 'block' then 'Language policy requires blocking or a moderator override.'
    else 'Waiting for language review.' end;
  new.market_review_summary := case new.market_review_status
    when 'not_applicable' then 'Not a marketplace listing.'
    when 'pass' then 'Marketplace listing checks passed.'
    when 'review' then 'Marketplace signals need review: ' || array_to_string(market_flags, ', ')
    when 'block' then 'Marketplace policy requires blocking or a moderator override.'
    else 'Waiting for marketplace review.' end;
  new.layered_reviewed_at := now();

  -- Layered gate: automatic publication is allowed only when every applicable
  -- lane passes. A review signal always falls back to the human queue.
  if new.post_review_status='block' or new.language_review_status='block' or new.market_review_status='block' then
    new.moderation_status := 'blocked';
    new.moderated_by := null;
    new.moderated_at := now();
    new.moderation_reason := 'Automatically blocked by layered moderation. Review lane details before overriding.';
  elsif new.post_review_status='pass' and new.language_review_status='pass' and new.market_review_status in ('pass','not_applicable') then
    new.moderation_status := 'approved';
    new.moderated_by := null;
    new.moderated_at := now();
    new.moderation_reason := 'Automatically approved after post, language, and marketplace checks passed.';
  else
    new.moderation_status := 'pending';
    new.moderated_by := null;
    new.moderated_at := null;
    new.moderation_reason := null;
  end if;

  return new;
end;
$function$;

revoke all on function public.sync_request_moderation_layers() from public;

drop trigger if exists requests_layered_moderation_tg on public.requests;
create trigger requests_layered_moderation_tg
before insert or update of
  title,details,category,kind,language_code,amount_cents,item_condition,fulfillment_method,fulfillment_methods,seller_area,
  moderation_flags,ai_moderation_status,ai_risk_level,ai_risk_score,ai_recommended_action,ai_policy_flags,
  behavior_risk_score,behavior_flags
on public.requests
for each row execute function public.sync_request_moderation_layers();

create table if not exists public.request_layered_moderation_audit (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  moderation_status text not null,
  post_review_status text not null,
  post_review_flags text[] not null default '{}'::text[],
  language_review_status text not null,
  language_review_flags text[] not null default '{}'::text[],
  language_detected text not null,
  market_review_status text not null,
  market_review_flags text[] not null default '{}'::text[],
  ai_risk_level text,
  ai_risk_score integer,
  created_at timestamptz not null default now()
);

create index if not exists request_layered_moderation_audit_request_idx
  on public.request_layered_moderation_audit(request_id,created_at desc);
alter table public.request_layered_moderation_audit enable row level security;

drop policy if exists request_layered_moderation_audit_moderator_read on public.request_layered_moderation_audit;
create policy request_layered_moderation_audit_moderator_read
on public.request_layered_moderation_audit for select to authenticated
using (public.is_moderator());
revoke insert,update,delete on public.request_layered_moderation_audit from anon,authenticated;
grant select on public.request_layered_moderation_audit to authenticated;

create or replace function public.audit_request_moderation_layers()
returns trigger
language plpgsql
security definer
set search_path=public
as $function$
begin
  if new.ai_moderation_status='complete'
     and (old.ai_moderation_status is distinct from new.ai_moderation_status
          or old.ai_last_scanned_at is distinct from new.ai_last_scanned_at) then
    insert into public.request_layered_moderation_audit(
      request_id,moderation_status,post_review_status,post_review_flags,
      language_review_status,language_review_flags,language_detected,
      market_review_status,market_review_flags,ai_risk_level,ai_risk_score
    ) values(
      new.id,new.moderation_status,new.post_review_status,new.post_review_flags,
      new.language_review_status,new.language_review_flags,new.language_detected,
      new.market_review_status,new.market_review_flags,new.ai_risk_level,new.ai_risk_score
    );
  end if;
  return new;
end;
$function$;

revoke all on function public.audit_request_moderation_layers() from public;
drop trigger if exists requests_layered_moderation_audit_tg on public.requests;
create trigger requests_layered_moderation_audit_tg
after update of ai_moderation_status,ai_last_scanned_at on public.requests
for each row execute function public.audit_request_moderation_layers();

-- Backfill only rows that already completed an AI scan. Existing approved
-- legacy rows that were never scanned remain unchanged and can be rescanned
-- from the moderator console when needed.
update public.requests
set ai_moderation_status=ai_moderation_status
where ai_moderation_status='complete';
