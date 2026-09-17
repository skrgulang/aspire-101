-- My Activity should never show an approved/live post alongside stale review or
-- block lane chips. Overall moderation_status is authoritative after a human
-- override or for approved legacy rows.
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
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;

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
    case when r.moderation_status = 'approved' then 'pass' else r.post_review_status end,
    case when r.moderation_status = 'approved' then '{}'::text[] else public.aspire_user_visible_review_flags(r.post_review_flags) end,
    case when r.moderation_status = 'approved' then 'pass' else r.language_review_status end,
    case when r.moderation_status = 'approved' then '{}'::text[] else public.aspire_user_visible_review_flags(r.language_review_flags) end,
    case
      when r.kind <> 'buy_sell' then 'not_applicable'
      when r.moderation_status = 'approved' then 'pass'
      else r.market_review_status
    end,
    case when r.moderation_status = 'approved' then '{}'::text[] else public.aspire_user_visible_review_flags(r.market_review_flags) end,
    r.layered_reviewed_at
  from public.requests r
  where r.poster_id = auth.uid()
  order by r.created_at desc;
end;
$$;

revoke all on function public.get_my_activity_requests() from public;
revoke all on function public.get_my_activity_requests() from anon;
grant execute on function public.get_my_activity_requests() to authenticated;
