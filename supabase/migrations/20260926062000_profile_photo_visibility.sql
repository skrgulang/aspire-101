-- Privacy-controlled profile photos for campus posts and visible profiles.
-- Default is OFF. Owners can still see their own photo.

alter table public.user_preferences
  add column if not exists show_profile_photo boolean not null default false;

drop function if exists public.discover_requests(uuid, text, text, integer, text);

create function public.discover_requests(
  p_campus_id uuid,
  p_query text default null::text,
  p_category text default 'Anything'::text,
  p_limit integer default 40,
  p_language text default null::text
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
  fulfillment_methods text[],
  shipping_paid_by_preference text,
  seller_delivery_mode text,
  seller_delivery_price_cents integer,
  quantity integer,
  language_code text,
  cover_image_url text,
  cover_image_source text,
  cover_image_asset_id uuid,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  author_avatar_url text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
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
         r.status,r.created_at,r.updated_at,
         case
           when r.poster_id = auth.uid() or coalesce(up.show_profile_photo, false)
             then coalesce(p.avatar_url, p.image_url)
           else null
         end as author_avatar_url
  from public.requests r
  join public.universities u on u.id=r.campus_id
  left join public.profiles p on p.id=r.poster_id
  left join public.user_preferences up on up.user_id=r.poster_id
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
$function$;

revoke all on function public.discover_requests(uuid, text, text, integer, text) from public, anon;
grant execute on function public.discover_requests(uuid, text, text, integer, text) to authenticated, service_role;

create or replace function public.get_public_profile(p_target_user_id uuid)
returns table(
  user_id uuid,
  can_view boolean,
  visibility text,
  display_name text,
  school text,
  avatar_url text,
  bio text,
  major text,
  graduation_year smallint,
  interests text[],
  completed_count bigint,
  joined_at timestamptz,
  school_verified boolean,
  is_connection boolean,
  same_campus boolean,
  owner_view boolean
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_viewer_id uuid := auth.uid();
  v_target public.profiles%rowtype;
  v_preferences public.user_preferences%rowtype;
  v_owner boolean := false;
  v_connection boolean := false;
  v_same_campus boolean := false;
  v_blocked boolean := false;
  v_can_view boolean := false;
  v_visibility text := 'connections';
begin
  if v_viewer_id is null then raise exception 'Authentication required'; end if;

  select p.* into v_target
  from public.profiles p
  where p.id = p_target_user_id;

  if not found then return; end if;

  select up.* into v_preferences
  from public.user_preferences up
  where up.user_id = p_target_user_id;

  v_owner := v_viewer_id = p_target_user_id;
  v_visibility := coalesce(v_preferences.profile_visibility, 'connections');

  select exists (
    select 1
    from public.connections c
    where c.status in ('confirmed', 'active', 'completed')
      and c.requester_confirmed = true
      and c.responder_confirmed = true
      and (
        (c.requester_id = v_viewer_id and c.responder_id = p_target_user_id)
        or (c.requester_id = p_target_user_id and c.responder_id = v_viewer_id)
      )
  ) into v_connection;

  select exists (
    select 1
    from public.profiles viewer
    where viewer.id = v_viewer_id
      and viewer.home_campus_id is not null
      and v_target.home_campus_id is not null
      and viewer.home_campus_id = v_target.home_campus_id
  ) into v_same_campus;

  select exists (
    select 1 from public.user_blocks ub
    where (ub.blocker_id = v_viewer_id and ub.blocked_id = p_target_user_id)
       or (ub.blocker_id = p_target_user_id and ub.blocked_id = v_viewer_id)
  ) into v_blocked;

  v_can_view := v_owner or (
    not v_blocked and (
      (v_visibility = 'connections' and v_connection)
      or (v_visibility = 'campus' and v_same_campus)
    )
  );

  return query
  select
    p_target_user_id,
    v_can_view,
    v_visibility,
    case when v_can_view then coalesce(nullif(trim(v_target.display_name), ''), nullif(trim(v_target.full_name), ''), nullif(trim(v_target.name), ''), 'Aspire student') else null end,
    case when v_can_view then v_target.school else null end,
    case when v_can_view and (v_owner or coalesce(v_preferences.show_profile_photo, false))
      then coalesce(v_target.avatar_url, v_target.image_url) else null end,
    case when v_can_view then v_target.bio else null end,
    case when v_can_view and coalesce(v_preferences.show_major, true) then v_target.major else null end,
    case when v_can_view and coalesce(v_preferences.show_graduation_year, true) then v_target.graduation_year else null end,
    case when v_can_view and coalesce(v_preferences.show_interests, true) then coalesce(v_target.interests, '{}'::text[]) else null end,
    case when v_can_view and coalesce(v_preferences.show_completed, true) then (
      select count(*)::bigint from public.requests r where r.poster_id = p_target_user_id and r.status = 'completed'
    ) else null end,
    case when v_can_view and coalesce(v_preferences.show_joined, true) then v_target.created_at else null end,
    case when v_can_view then exists (
      select 1 from public.school_verifications sv where sv.user_id = p_target_user_id and sv.status = 'verified'
    ) else false end,
    v_connection,
    v_same_campus,
    v_owner;
end;
$function$;

revoke all on function public.get_public_profile(uuid) from public, anon;
grant execute on function public.get_public_profile(uuid) to authenticated;
