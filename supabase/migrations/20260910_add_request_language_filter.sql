alter table public.requests add column if not exists language_code text not null default 'en';

update public.requests set language_code='en' where language_code is null or trim(language_code)='';

alter table public.requests drop constraint if exists requests_language_code_check;
alter table public.requests add constraint requests_language_code_check
  check (language_code in ('en','zh','es','ko','ja','fr','hi','ar','vi','other'));

create index if not exists requests_campus_language_live_idx
  on public.requests (campus_id, language_code, created_at desc)
  where status='open' and moderation_status='approved';

drop function if exists public.discover_requests(uuid,text,text,integer);

create or replace function public.discover_requests(
  p_campus_id uuid,
  p_query text default null,
  p_category text default 'Anything',
  p_limit integer default 40,
  p_language text default null
)
returns table(
  id uuid,
  poster_id uuid,
  kind text,
  category text,
  title text,
  details text,
  campus text,
  campus_id uuid,
  city text,
  amount_cents integer,
  currency text,
  payment_method text,
  market_intent text,
  item_condition text,
  price_negotiable boolean,
  fulfillment_method text,
  quantity integer,
  language_code text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  clean_query text := nullif(trim(coalesce(p_query, '')), '');
  clean_category text := coalesce(nullif(trim(p_category), ''), 'Anything');
  clean_language text := lower(nullif(trim(coalesce(p_language, '')), ''));
  safe_limit integer := greatest(1, least(coalesce(p_limit, 40), 80));
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_campus_id is null or not exists (select 1 from public.universities u0 where u0.id=p_campus_id and u0.active=true) then raise exception 'Unsupported campus'; end if;

  return query
  select r.id,r.poster_id,r.kind,r.category,r.title,r.details,u.name,r.campus_id,u.city,r.amount_cents,r.currency,r.payment_method,r.market_intent,r.item_condition,r.price_negotiable,r.fulfillment_method,r.quantity,r.language_code,r.status,r.created_at,r.updated_at
  from public.requests r
  join public.universities u on u.id=r.campus_id
  where r.status='open'
    and r.moderation_status='approved'
    and r.campus_id=p_campus_id
    and (clean_language is null or clean_language='all' or r.language_code=clean_language)
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
      or (clean_category='Pick this up' and lower(r.category || ' ' || r.title) ~ '(pickup|errand|target|costco|order|food|package)')
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

revoke all on function public.discover_requests(uuid,text,text,integer,text) from public, anon;
grant execute on function public.discover_requests(uuid,text,text,integer,text) to authenticated;
