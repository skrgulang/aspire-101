-- Modern post language reach + private drafts for Need/Offer composers.

alter table public.requests
  drop constraint if exists requests_language_code_check;
alter table public.requests
  add constraint requests_language_code_check
  check (language_code in ('any','en','zh','es','ko','ja','fr','hi','ar','vi','other'));

alter table public.marketplace_listing_drafts
  add column if not exists language_code text not null default 'any';

alter table public.marketplace_listing_drafts
  drop constraint if exists marketplace_listing_drafts_language_code_check;
alter table public.marketplace_listing_drafts
  add constraint marketplace_listing_drafts_language_code_check
  check (language_code in ('any','en','zh','es','ko','ja','fr','hi','ar','vi','other'));

create table if not exists public.request_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  composer_mode text not null default 'need' check (composer_mode in ('need','offer')),
  campus_id uuid references public.universities(id) on delete set null,
  category text not null default 'Other',
  kind text not null default 'community' check (kind in ('community','paid_help','split_cost','buy_sell','collaboration')),
  title text not null default '',
  details text not null default '',
  language_code text not null default 'any' check (language_code in ('any','en','zh','es','ko','ja','fr','hi','ar','vi','other')),
  amount_cents integer check (amount_cents is null or amount_cents between 0 and 100000000),
  market_intent text check (market_intent is null or market_intent in ('sell','wanted')),
  item_condition text check (item_condition is null or item_condition in ('new','like_new','good','fair','for_parts')),
  price_negotiable boolean not null default false,
  fulfillment_method text check (fulfillment_method is null or fulfillment_method in ('campus_pickup','shipping')),
  schedule_mode text not null default 'flexible' check (schedule_mode in ('flexible','scheduled')),
  start_local text,
  end_local text,
  timezone text,
  meeting_label text,
  origin text,
  destination text,
  seats integer check (seats is null or seats between 1 and 8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    char_length(category) <= 80
    and char_length(title) <= 180
    and char_length(details) <= 10000
    and (start_local is null or char_length(start_local) <= 40)
    and (end_local is null or char_length(end_local) <= 40)
    and (timezone is null or char_length(timezone) <= 100)
    and (meeting_label is null or char_length(meeting_label) <= 240)
    and (origin is null or char_length(origin) <= 240)
    and (destination is null or char_length(destination) <= 240)
  )
);

alter table public.request_drafts enable row level security;
revoke all on table public.request_drafts from anon;
grant select, insert, update, delete on table public.request_drafts to authenticated;

drop policy if exists request_drafts_select_own on public.request_drafts;
drop policy if exists request_drafts_insert_own on public.request_drafts;
drop policy if exists request_drafts_update_own on public.request_drafts;
drop policy if exists request_drafts_delete_own on public.request_drafts;

create policy request_drafts_select_own
on public.request_drafts for select to authenticated
using ((select auth.uid()) = user_id);

create policy request_drafts_insert_own
on public.request_drafts for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy request_drafts_update_own
on public.request_drafts for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy request_drafts_delete_own
on public.request_drafts for delete to authenticated
using ((select auth.uid()) = user_id);

create index if not exists request_drafts_user_updated_idx
  on public.request_drafts(user_id, updated_at desc);

create or replace function public.guard_request_draft_count()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated' then
    if new.user_id is distinct from auth.uid() then raise exception 'DRAFT_OWNER_MISMATCH'; end if;
    if (select count(*) >= 50 from public.request_drafts d where d.user_id = auth.uid()) then
      raise exception 'REQUEST_DRAFT_LIMIT';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists request_drafts_count_tg on public.request_drafts;
create trigger request_drafts_count_tg
before insert on public.request_drafts
for each row execute function public.guard_request_draft_count();

revoke all on function public.guard_request_draft_count() from public, anon, authenticated;

create table if not exists public.request_draft_media (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.request_drafts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  sort_order integer not null default 0 check (sort_order between 0 and 4),
  created_at timestamptz not null default now(),
  unique(draft_id, sort_order),
  check (char_length(storage_path) <= 500)
);

alter table public.request_draft_media enable row level security;
revoke all on table public.request_draft_media from anon;
grant select, insert, update, delete on table public.request_draft_media to authenticated;

drop policy if exists request_draft_media_select_own on public.request_draft_media;
drop policy if exists request_draft_media_insert_own on public.request_draft_media;
drop policy if exists request_draft_media_update_own on public.request_draft_media;
drop policy if exists request_draft_media_delete_own on public.request_draft_media;

create policy request_draft_media_select_own
on public.request_draft_media for select to authenticated
using ((select auth.uid()) = user_id);

create policy request_draft_media_insert_own
on public.request_draft_media for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.request_drafts d
    where d.id = draft_id and d.user_id = (select auth.uid())
  )
);

create policy request_draft_media_update_own
on public.request_draft_media for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy request_draft_media_delete_own
on public.request_draft_media for delete to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'request-drafts',
  'request-drafts',
  false,
  8388608,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists request_draft_storage_select_own on storage.objects;
drop policy if exists request_draft_storage_insert_own on storage.objects;
drop policy if exists request_draft_storage_delete_own on storage.objects;

create policy request_draft_storage_select_own
on storage.objects for select to authenticated
using (
  bucket_id = 'request-drafts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy request_draft_storage_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'request-drafts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.request_drafts d
    where d.id::text = (storage.foldername(name))[2]
      and d.user_id = (select auth.uid())
  )
);

create policy request_draft_storage_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'request-drafts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create or replace function public.aspire_language_review_flags(
  p_text text,
  p_declared text,
  p_rule_flags text[]
)
returns text[]
language plpgsql
stable
set search_path = public
as $$
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
  if lower_t ~ '(!{6,}|\?{6,}|[$]{6,}|#{6,})' then flags := array_append(flags,'excessive_punctuation'); end if;
  if regexp_count(lower_t, 'https?://|www\.') >= 3 then flags := array_append(flags,'link_spam'); end if;
  if lower_t ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' or lower_t ~ '(^|[^0-9])([0-9][ -.()]*){10,}([^0-9]|$)' then flags := array_append(flags,'contact_information'); end if;
  if coalesce(p_rule_flags,'{}'::text[]) && array['profanity']::text[] then flags := array_append(flags,'profanity'); end if;
  if coalesce(p_rule_flags,'{}'::text[]) && array['hate_slur']::text[] then flags := array_append(flags,'hate_slur'); end if;
  if coalesce(p_rule_flags,'{}'::text[]) && array['threat_or_abuse']::text[] then flags := array_append(flags,'threat_or_abuse'); end if;
  if declared not in ('other','any') and detected not in ('unknown','other','mixed') then
    if declared in ('zh','ja','ko','ar','hi') and declared <> detected then flags := array_append(flags,'declared_language_mismatch');
    elsif declared = 'en' and detected in ('zh','ja','ko','ar','hi') then flags := array_append(flags,'declared_language_mismatch'); end if;
  end if;
  return array(select distinct x from unnest(flags) as x where x is not null);
end;
$$;

create or replace function public.discover_requests(
  p_campus_id uuid,
  p_query text default null,
  p_category text default 'Anything',
  p_limit integer default 40,
  p_language text default null
)
returns table(
  id uuid, poster_id uuid, kind text, category text, title text, details text,
  campus text, campus_id uuid, city text, amount_cents integer, currency text,
  payment_method text, market_intent text, item_condition text,
  price_negotiable boolean, fulfillment_method text, fulfillment_methods text[],
  shipping_paid_by_preference text, seller_delivery_mode text,
  seller_delivery_price_cents integer, quantity integer, language_code text,
  cover_image_url text, cover_image_source text, cover_image_asset_id uuid,
  status text, created_at timestamptz, updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_query text := nullif(trim(coalesce(p_query, '')), '');
  clean_category text := coalesce(nullif(trim(p_category), ''), 'Anything');
  clean_language text := lower(nullif(trim(coalesce(p_language, '')), ''));
  safe_limit integer := greatest(1, least(coalesce(p_limit, 40), 80));
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_campus_id is null or not exists (
    select 1 from public.universities u0 where u0.id=p_campus_id and u0.active=true
  ) then raise exception 'Unsupported campus'; end if;

  return query
  select r.id,r.poster_id,r.kind,r.category,r.title,r.details,u.name,r.campus_id,u.city,
         r.amount_cents,r.currency,r.payment_method,r.market_intent,r.item_condition,
         r.price_negotiable,r.fulfillment_method,
         coalesce(r.fulfillment_methods, array[coalesce(r.fulfillment_method, 'campus_pickup')]),
         r.shipping_paid_by_preference,r.seller_delivery_mode,r.seller_delivery_price_cents,
         r.quantity,r.language_code,
         r.cover_image_url,r.cover_image_source,r.cover_image_asset_id,
         r.status,r.created_at,r.updated_at
  from public.requests r
  join public.universities u on u.id=r.campus_id
  where r.status='open'
    and r.moderation_status='approved'
    and r.campus_id=p_campus_id
    and (clean_language is null or clean_language='all' or r.language_code='any' or r.language_code=clean_language)
    and not exists (select 1 from public.user_blocks b where b.blocker_id=auth.uid() and b.blocked_id=r.poster_id)
    and not exists (select 1 from public.user_blocks b where b.blocker_id=r.poster_id and b.blocked_id=auth.uid())
    and (
      clean_query is null
      or r.search_document @@ websearch_to_tsquery('simple', clean_query)
      or r.title ilike '%' || replace(replace(clean_query,'%','\\%'),'_','\\_') || '%' escape '\\'
      or coalesce(r.details,'') ilike '%' || replace(replace(clean_query,'%','\\%'),'_','\\_') || '%' escape '\\'
    )
    and (
      clean_category='Anything'
      or (clean_category='Get me there' and lower(r.category || ' ' || r.title) ~ '(ride|transport|airport|chicago|indy)')
      or (clean_category='Pick this up' and lower(r.category || ' ' || r.title) ~ '(pickup|errand|target|costco|order|food|package|delivery)')
      or (clean_category='Give me a hand' and lower(r.category || ' ' || r.title) ~ '(moving|help|desk|chair|carry|furniture)')
      or (clean_category='Study / class' and lower(r.category || ' ' || r.title) ~ '(study|class|tutor|math|calc|econ|homework|exam)')
      or (clean_category='Gaming / duos' and lower(r.category || ' ' || r.title) ~ '(gaming|game|valorant|league|fortnite|duo|ranked|queue|cs2|overwatch|minecraft)')
      or (clean_category='Build something' and lower(r.category || ' ' || r.title) ~ '(project|collab|designer|hackathon|build|startup|code|developer)')
      or (clean_category='People / community' and lower(r.category || ' ' || r.title) ~ '(community|people|friend|group|club|ski|gym|workout|hang|campus life|meet)')
      or (clean_category='Buy & sell' and (r.kind='buy_sell' or lower(r.category || ' ' || r.title) ~ '(market|sell|buy|fridge|lamp)'))
    )
  order by r.created_at desc
  limit safe_limit;
end;
$$;

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
  select * into v_request from public.requests where id=p_request_id and poster_id=v_user for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_request.status <> 'open' then raise exception 'REQUEST_NOT_EDITABLE'; end if;
  if v_request.moderation_status not in ('blocked','rejected') then raise exception 'REQUEST_NOT_READY_FOR_RESUBMIT'; end if;
  if exists(select 1 from public.connections c where c.request_id=p_request_id and c.status<>'cancelled') then raise exception 'REQUEST_HAS_CONNECTION'; end if;
  if nullif(btrim(coalesce(p_title,'')),'') is null or char_length(btrim(p_title))>180 then raise exception 'INVALID_TITLE'; end if;
  if char_length(coalesce(p_details,''))>5000 then raise exception 'DETAILS_TOO_LONG'; end if;
  if p_language_code not in ('any','en','zh','es','ko','ja','fr','hi','ar','vi','other') then raise exception 'INVALID_LANGUAGE'; end if;
  if v_request.kind in ('paid_help','split_cost','buy_sell') and coalesce(p_amount_cents,0)<=0 then raise exception 'INVALID_AMOUNT'; end if;

  if v_request.kind='buy_sell' then
    v_methods := coalesce(p_fulfillment_methods,'{}'::text[]);
    if cardinality(v_methods)<1 or cardinality(v_methods)>4 or not(v_methods <@ array['campus_pickup','shipping','aspirer_delivery','seller_delivery']::text[]) then raise exception 'INVALID_FULFILLMENT_METHODS'; end if;
    if nullif(btrim(coalesce(p_seller_area,'')),'') is null or char_length(btrim(p_seller_area))>120 then raise exception 'INVALID_SELLER_AREA'; end if;
    if coalesce(v_request.market_intent,'sell')='sell' and p_item_condition not in ('new','like_new','good','fair','for_parts') then raise exception 'INVALID_ITEM_CONDITION'; end if;
    if 'shipping'=any(v_methods) then
      v_shipping := coalesce(nullif(p_shipping_paid_by,''),'buyer');
      if v_shipping not in ('buyer','seller','either') then raise exception 'INVALID_SHIPPING_PAYER'; end if;
    else v_shipping := null; end if;
    if 'seller_delivery'=any(v_methods) then
      v_seller_mode := coalesce(nullif(p_seller_delivery_mode,''),'negotiable');
      if v_seller_mode not in ('free','fixed','negotiable') then raise exception 'INVALID_SELLER_DELIVERY_MODE'; end if;
      if v_seller_mode='fixed' then
        if coalesce(p_seller_delivery_price_cents,0)<=0 then raise exception 'INVALID_SELLER_DELIVERY_PRICE'; end if;
        v_seller_price := p_seller_delivery_price_cents;
      elsif v_seller_mode='free' then v_seller_price := 0;
      else v_seller_price := null; end if;
    else v_seller_mode := null; v_seller_price := null; end if;
    if 'campus_pickup'=any(v_methods) then v_legacy_fulfillment := 'campus_pickup';
    elsif 'shipping'=any(v_methods) then v_legacy_fulfillment := 'shipping';
    else v_legacy_fulfillment := null; end if;
  else
    v_methods := v_request.fulfillment_methods;
    v_shipping := v_request.shipping_paid_by_default;
    v_seller_mode := v_request.seller_delivery_mode;
    v_seller_price := v_request.seller_delivery_price_cents;
    v_legacy_fulfillment := v_request.fulfillment_method;
  end if;

  update public.requests set
    title=btrim(p_title), details=nullif(btrim(coalesce(p_details,'')),''), language_code=p_language_code,
    amount_cents=case when v_request.kind in ('paid_help','split_cost','buy_sell') then p_amount_cents else null end,
    item_condition=case when v_request.kind='buy_sell' and coalesce(v_request.market_intent,'sell')='sell' then p_item_condition else v_request.item_condition end,
    price_negotiable=case when v_request.kind='buy_sell' then coalesce(p_price_negotiable,false) else v_request.price_negotiable end,
    fulfillment_method=case when v_request.kind='buy_sell' then v_legacy_fulfillment else v_request.fulfillment_method end,
    fulfillment_methods=case when v_request.kind='buy_sell' then v_methods else v_request.fulfillment_methods end,
    seller_area=case when v_request.kind='buy_sell' then left(btrim(p_seller_area),120) else v_request.seller_area end,
    shipping_paid_by_default=case when v_request.kind='buy_sell' then v_shipping else v_request.shipping_paid_by_default end,
    shipping_paid_by_preference=case when v_request.kind='buy_sell' then v_shipping else v_request.shipping_paid_by_preference end,
    seller_delivery_mode=case when v_request.kind='buy_sell' then v_seller_mode else v_request.seller_delivery_mode end,
    seller_delivery_price_cents=case when v_request.kind='buy_sell' then v_seller_price else v_request.seller_delivery_price_cents end,
    moderation_status='pending', moderated_by=null, moderated_at=null, moderation_reason=null,
    ai_moderation_status='not_scanned', ai_risk_level='unknown', ai_risk_score=null, ai_recommended_action='review', ai_policy_flags='{}'::text[], ai_summary=null, ai_last_scanned_at=null,
    behavior_risk_score=null, behavior_flags='{}'::text[], trust_score_snapshot=null, trust_band_snapshot=null,
    post_review_status='pending', post_review_flags='{}'::text[], post_review_summary='Waiting for a fresh review after the owner edited this post.',
    language_review_status='pending', language_review_flags='{}'::text[], language_review_summary='Waiting for a fresh language review after the owner edited this post.',
    market_review_status=case when v_request.kind='buy_sell' then 'pending' else 'not_applicable' end,
    market_review_flags='{}'::text[], market_review_summary=case when v_request.kind='buy_sell' then 'Waiting for a fresh marketplace review after the owner edited this post.' else 'Not a marketplace listing.' end,
    layered_reviewed_at=null, updated_at=now()
  where id=p_request_id returning * into v_request;
  return v_request;
end;
$$;

revoke all on function public.resubmit_request_for_review(uuid,text,text,text,integer,text,boolean,text[],text,text,text,integer) from public, anon;
grant execute on function public.resubmit_request_for_review(uuid,text,text,text,integer,text,boolean,text[],text,text,text,integer) to authenticated;
