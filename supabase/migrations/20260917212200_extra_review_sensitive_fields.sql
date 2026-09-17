-- A few legacy-editable marketplace identity fields are not part of the main
-- layered trigger column list. If an owner changes them directly, make the post
-- private until a fresh scan runs instead of allowing an approved row to drift.
create or replace function public.invalidate_request_review_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.market_intent is distinct from old.market_intent
     or new.currency is distinct from old.currency
     or new.quantity is distinct from old.quantity then
    new.moderation_status := 'pending';
    new.moderated_by := null;
    new.moderated_at := null;
    new.moderation_reason := null;
    new.ai_moderation_status := 'not_scanned';
    new.ai_risk_level := 'unknown';
    new.ai_risk_score := null;
    new.ai_recommended_action := 'review';
    new.ai_policy_flags := '{}'::text[];
    new.ai_summary := null;
    new.ai_last_scanned_at := null;
    new.behavior_risk_score := null;
    new.behavior_flags := '{}'::text[];
    new.trust_score_snapshot := null;
    new.trust_band_snapshot := null;
    new.post_review_status := 'pending';
    new.post_review_flags := '{}'::text[];
    new.post_review_summary := 'Waiting for a fresh review after marketplace details changed.';
    new.language_review_status := 'pending';
    new.language_review_flags := '{}'::text[];
    new.language_review_summary := 'Waiting for a fresh review after marketplace details changed.';
    new.market_review_status := case when new.kind = 'buy_sell' then 'pending' else 'not_applicable' end;
    new.market_review_flags := '{}'::text[];
    new.market_review_summary := case when new.kind = 'buy_sell' then 'Waiting for a fresh marketplace review after listing details changed.' else 'Not a marketplace listing.' end;
    new.layered_reviewed_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.invalidate_request_review_sensitive_fields() from public;

drop trigger if exists b_invalidate_request_review_sensitive_fields_tg on public.requests;
create trigger b_invalidate_request_review_sensitive_fields_tg
before update of market_intent, currency, quantity on public.requests
for each row execute function public.invalidate_request_review_sensitive_fields();
