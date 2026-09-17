-- Blocked/rejected posts are already private, so photo cleanup during correction
-- should not change their moderation state before the resubmit RPC runs. Photo
-- changes on an approved live post still invalidate approval immediately.
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
  where id = v_request_id
    and status = 'open'
    and moderation_status = 'approved';

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.invalidate_request_moderation_for_media() from public;
