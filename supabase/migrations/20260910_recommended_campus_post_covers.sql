create table if not exists public.campus_cover_images (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid null references public.universities(id) on delete cascade,
  category_key text null,
  image_url text not null,
  title text null,
  alt_text text null,
  source text not null default 'curated',
  priority integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campus_cover_images_source_check check (source in ('curated','campus_default','global_default')),
  constraint campus_cover_images_unique unique (campus_id, category_key, image_url)
);

create index if not exists campus_cover_images_lookup_idx
  on public.campus_cover_images (campus_id, category_key, active, priority desc);

alter table public.campus_cover_images enable row level security;
drop policy if exists campus_cover_images_public_read on public.campus_cover_images;
create policy campus_cover_images_public_read
  on public.campus_cover_images
  for select
  to anon, authenticated
  using (active = true);

revoke all on public.campus_cover_images from anon, authenticated;
grant select on public.campus_cover_images to anon, authenticated;

alter table public.requests
  add column if not exists cover_image_url text null,
  add column if not exists cover_image_source text not null default 'none',
  add column if not exists cover_image_asset_id uuid null;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'requests_cover_image_source_check'
      and conrelid = 'public.requests'::regclass
  ) then
    alter table public.requests
      add constraint requests_cover_image_source_check
      check (cover_image_source in ('none','user','system_recommended','campus_default','global_default'));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'requests_cover_image_asset_id_fkey'
      and conrelid = 'public.requests'::regclass
  ) then
    alter table public.requests
      add constraint requests_cover_image_asset_id_fkey
      foreign key (cover_image_asset_id)
      references public.campus_cover_images(id)
      on delete set null;
  end if;
end $$;

create index if not exists requests_cover_image_asset_id_idx
  on public.requests (cover_image_asset_id)
  where cover_image_asset_id is not null;

grant insert (cover_image_url, cover_image_source, cover_image_asset_id) on public.requests to authenticated;
grant update (cover_image_url, cover_image_source, cover_image_asset_id) on public.requests to authenticated;

insert into public.campus_cover_images (campus_id, category_key, image_url, title, alt_text, source, priority)
select id, null, cover_image, name || ' campus', name || ' campus', 'campus_default', 10
from public.universities
where active = true and cover_image is not null
on conflict (campus_id, category_key, image_url) do nothing;

insert into public.campus_cover_images (campus_id, category_key, image_url, title, alt_text, source, priority)
select id, 'People / community', '/seeded/corec.webp', 'Purdue CoRec', 'France A. Córdova Recreational Sports Center at Purdue', 'curated', 100
from public.universities where slug = 'purdue'
on conflict (campus_id, category_key, image_url) do update set active = true, priority = excluded.priority;

insert into public.campus_cover_images (campus_id, category_key, image_url, title, alt_text, source, priority)
select id, 'Gaming', '/seeded/gaming.webp', 'Purdue Gaming Lounge', 'Purdue gaming and esports room', 'curated', 100
from public.universities where slug = 'purdue'
on conflict (campus_id, category_key, image_url) do update set active = true, priority = excluded.priority;

update public.requests r
set cover_image_source = 'user', cover_image_url = null, cover_image_asset_id = null
where exists (select 1 from public.request_media rm where rm.request_id = r.id)
  and r.cover_image_source = 'none';

with picks as (
  select r.id as request_id, pick.id as asset_id, pick.campus_id, pick.category_key, pick.image_url
  from public.requests r
  cross join lateral (
    select c.id, c.campus_id, c.category_key, c.image_url
    from public.campus_cover_images c
    where c.active = true
      and (c.campus_id = r.campus_id or c.campus_id is null)
      and (c.category_key = r.category or c.category_key is null)
    order by
      (c.campus_id = r.campus_id) desc,
      (c.category_key = r.category) desc,
      c.priority desc,
      c.created_at asc
    limit 1
  ) pick
  where r.cover_image_source = 'none'
    and not exists (select 1 from public.request_media rm where rm.request_id = r.id)
)
update public.requests r
set cover_image_url = p.image_url,
    cover_image_asset_id = p.asset_id,
    cover_image_source = case when p.category_key is not null then 'system_recommended'
                              when p.campus_id is not null then 'campus_default'
                              else 'global_default' end
from picks p
where p.request_id = r.id;

drop function if exists public.discover_requests(uuid,text,text,integer,text);
create function public.discover_requests(
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
  cover_image_url text,
  cover_image_source text,
  cover_image_asset_id uuid,
  status text,
  created_at timestamptz,
  updated_at timestamptz
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
  if p_campus_id is null or not exists (select 1 from public.universities u0 where u0.id=p_campus_id and u0.active=true) then raise exception 'Unsupported campus'; end if;

  return query
  select r.id,r.poster_id,r.kind,r.category,r.title,r.details,u.name,r.campus_id,u.city,
         r.amount_cents,r.currency,r.payment_method,r.market_intent,r.item_condition,
         r.price_negotiable,r.fulfillment_method,r.quantity,r.language_code,
         r.cover_image_url,r.cover_image_source,r.cover_image_asset_id,
         r.status,r.created_at,r.updated_at
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
grant execute on function public.discover_requests(uuid,text,text,integer,text) to authenticated, service_role;
