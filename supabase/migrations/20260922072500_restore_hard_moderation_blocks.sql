-- Restore the original hard-block behavior for severe moderation outcomes.
-- Clean posts may auto-publish, medium/high uncertainty goes to human review,
-- and explicit hard-policy / critical-risk content is blocked immediately.

create or replace function public.sync_request_moderation_layers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
  market_flags := public.aspire_market_review_flags(body_text,new.kind,new.market_intent,new.amount_cents,new.item_condition,new.fulfillment_methods,new.seller_area,new.ai_policy_flags,new.moderation_flags,new.behavior_flags,has_photo);

  if new.ai_risk_level in ('high','critical') then post_flags := array_append(post_flags,'ai_' || new.ai_risk_level || '_risk'); end if;
  if coalesce(new.behavior_risk_score,0) >= 60 then post_flags := array_append(post_flags,'high_behavior_risk');
  elsif coalesce(new.behavior_risk_score,0) >= 25 then post_flags := array_append(post_flags,'elevated_behavior_risk'); end if;
  if coalesce(new.ai_policy_flags,'{}'::text[]) && array['scam_pressure','off_platform_contact']::text[] then post_flags := array_append(post_flags,'platform_risk_signal'); end if;
  if coalesce(new.ai_policy_flags,'{}'::text[]) && array['sensitive_personal_data']::text[] then post_flags := array_append(post_flags,'sensitive_personal_data'); end if;
  if coalesce(new.ai_policy_flags,'{}'::text[]) && array['explicit_sexual_content']::text[] then post_flags := array_append(post_flags,'explicit_sexual_content'); end if;
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

  if new.ai_recommended_action='block'
     or new.ai_risk_level='critical'
     or post_flags && array['hard_language_policy','sensitive_personal_data','explicit_sexual_content']::text[]
  then new.post_review_status := 'block';
  elsif new.ai_risk_level in ('medium','high') or coalesce(new.behavior_risk_score,0)>=25 or cardinality(post_flags)>0 then new.post_review_status := 'review';
  else new.post_review_status := 'pass'; end if;

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

  if new.post_review_status='block' or new.language_review_status='block' or new.market_review_status='block' then
    new.moderation_status := 'blocked';
    new.moderated_by := null;
    new.moderated_at := now();
    new.moderation_reason := 'Automatically blocked by layered moderation. Review lane details before overriding.';
  elsif new.post_review_status='pass'
     and new.language_review_status='pass'
     and new.market_review_status in ('pass','not_applicable') then
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
$$;

create or replace function public.notify_request_review_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text;
begin
  if new.ai_moderation_status = 'complete'
     and old.ai_moderation_status is distinct from new.ai_moderation_status
     and new.moderation_status = 'pending' then
    perform public.push_notification(
      new.poster_id,
      'post_review',
      'post-review-pending:' || new.id::text,
      'Your post is waiting for human review',
      '“' || left(new.title, 220) || '” is private. Open My Posts to see which review lane needs attention and what you may need to change.',
      null,new.id,null,null,null
    );
  end if;

  if old.moderation_status is not distinct from new.moderation_status then
    return new;
  end if;

  if new.moderation_status = 'approved' then
    v_body := '“' || left(new.title, 220) || '” passed review and is now visible to other students.';
    perform public.push_notification(
      new.poster_id,'post_review','post-review-approved:' || new.id::text,
      'Your post is live',v_body,null,new.id,null,null,null
    );
  elsif new.moderation_status = 'blocked' then
    v_body := '“' || left(new.title, 220) || '” cannot be published because it triggered a serious Aspire safety or policy rule. Open My Posts to review the status.';
    perform public.push_notification(
      new.poster_id,'post_review','post-review-blocked:' || new.id::text,
      'Your post cannot be published',v_body,null,new.id,null,null,null
    );
  elsif new.moderation_status = 'rejected' then
    v_body := '“' || left(new.title, 220) || '” was not approved.'
      || case when nullif(btrim(coalesce(new.moderation_reason,'')),'') is not null
              then ' Reason: ' || left(btrim(new.moderation_reason), 240)
              else '' end
      || ' Open My Posts to edit and resubmit.';
    perform public.push_notification(
      new.poster_id,'post_review','post-review-rejected:' || new.id::text,
      'Your post was not approved',v_body,null,new.id,null,null,null
    );
  end if;

  return new;
end;
$$;

-- Re-apply hard blocks to active posts that were temporarily moved into the human
-- queue but whose layered review already says "block". Moderator decisions remain untouched.
update public.requests
set moderation_status='blocked',
    moderated_by=null,
    moderated_at=now(),
    moderation_reason='Automatically blocked by layered moderation. Review lane details before overriding.',
    updated_at=now()
where status in ('open','matched','in_progress')
  and moderation_status='pending'
  and moderated_by is null
  and (
    post_review_status='block'
    or language_review_status='block'
    or market_review_status='block'
  );
