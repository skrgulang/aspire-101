-- Keep anti-abuse scores and internal moderation signals off ordinary browser reads.
-- These RPCs expose only the review state a post owner needs, while moderators
-- retain a gated path to the full moderation row.

create or replace function public.aspire_user_visible_review_flags(p_flags text[])
returns text[]
language sql
immutable
set search_path = public
as $function$
  select coalesce(array_agg(flag order by ord), '{}'::text[])
  from unnest(coalesce(p_flags, '{}'::text[])) with ordinality as f(flag, ord)
  where flag = any(array[
    'profanity',
    'hate_slur',
    'threat_or_abuse',
    'hidden_unicode',
    'link_spam',
    'contact_information',
    'excessive_punctuation',
    'declared_language_mismatch',
    'missing_item_photo',
    'missing_public_seller_area',
    'missing_price',
    'missing_condition',
    'missing_fulfillment_method',
    'regulated_or_prohibited_item',
    'regulated_item_needs_review',
    'marketplace_prohibited_listing',
    'prohibited_listing_type',
    'credential_trade',
    'sensitive_personal_data',
    'off_platform_payment_or_evasion',
    'price_anomaly',
    'duplicate_listing'
  ]::text[]);
$function$;

revoke all on function public.aspire_user_visible_review_flags(text[]) from public;

create or replace function public.get_my_activity_requests()
returns table(
  id uuid,
  poster_id uuid,
  kind text,
  category text,
  title text,
  details text,
  campus text,
  amount_cents integer,
  currency text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  moderation_status text,
  moderation_reason text,
  ai_moderation_status text,
  post_review_status text,
  post_review_flags text[],
  language_review_status text,
  language_review_flags text[],
  market_review_status text,
  market_review_flags text[],
  layered_reviewed_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  return query
  select
    r.id,
    r.poster_id,
    r.kind,
    r.category,
    r.title,
    r.details,
    r.campus,
    r.amount_cents,
    r.currency,
    r.status,
    r.created_at,
    r.updated_at,
    r.moderation_status,
    r.moderation_reason,
    r.ai_moderation_status,
    r.post_review_status,
    public.aspire_user_visible_review_flags(r.post_review_flags),
    r.language_review_status,
    public.aspire_user_visible_review_flags(r.language_review_flags),
    r.market_review_status,
    public.aspire_user_visible_review_flags(r.market_review_flags),
    r.layered_reviewed_at
  from public.requests r
  where r.poster_id = auth.uid()
  order by r.created_at desc;
end;
$function$;

revoke all on function public.get_my_activity_requests() from public;
grant execute on function public.get_my_activity_requests() to authenticated;

create or replace function public.moderator_fetch_requests(p_limit integer default 80)
returns setof public.requests
language plpgsql
security definer
stable
set search_path = public
as $function$
begin
  if not public.is_moderator() then
    raise exception 'Moderator access required.';
  end if;

  return query
  select r.*
  from public.requests r
  where r.status in ('open', 'matched', 'in_progress')
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 80), 250));
end;
$function$;

revoke all on function public.moderator_fetch_requests(integer) from public;
grant execute on function public.moderator_fetch_requests(integer) to authenticated;
