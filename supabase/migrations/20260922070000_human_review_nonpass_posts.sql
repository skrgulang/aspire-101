-- Keep non-pass moderation outcomes private and route them to human review.
-- Also make poster notifications actionable and expose a moderator removal path
-- that preserves the audit/history trail instead of hard-deleting records.

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

  if new.ai_recommended_action='block' or new.ai_risk_level='critical' or post_flags && array['hard_language_policy','sensitive_personal_data']::text[] then new.post_review_status := 'block';
  elsif new.ai_risk_level in ('medium','high') or coalesce(new.behavior_risk_score,0)>=25 or cardinality(post_flags)>0 then new.post_review_status := 'review';
  else new.post_review_status := 'pass'; end if;

  if hard_language or new.ai_risk_level='critical' then new.language_review_status := 'block';
  elsif cardinality(language_flags)>0 then new.language_review_status := 'review';
  else new.language_review_status := 'pass'; end if;

  if not market_applicable then new.market_review_status := 'not_applicable';
  elsif hard_market then new.market_review_status := 'block';
  elsif cardinality(market_flags)>0 then new.market_review_status := 'review';
  else new.market_review_status := 'pass'; end if;

  new.post_review_summary := case new.post_review_status when 'pass' then 'General post safety checks passed.' when 'review' then 'General post safety signals need review: ' || array_to_string(post_flags, ', ') when 'block' then 'General post safety requires blocking or a moderator override.' else 'Waiting for post review.' end;
  new.language_review_summary := case new.language_review_status when 'pass' then 'Language checks passed. Detected language: ' || detected || '.' when 'review' then 'Language signals need review: ' || array_to_string(language_flags, ', ') when 'block' then 'Language policy requires blocking or a moderator override.' else 'Waiting for language review.' end;
  new.market_review_summary := case new.market_review_status when 'not_applicable' then 'Not a marketplace listing.' when 'pass' then 'Marketplace listing checks passed.' when 'review' then 'Marketplace signals need review: ' || array_to_string(market_flags, ', ') when 'block' then 'Marketplace policy requires blocking or a moderator override.' else 'Waiting for marketplace review.' end;
  new.layered_reviewed_at := now();

  -- Only clean passes auto-publish. Every other outcome stays private for a human.
  if new.post_review_status='pass'
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

-- Older automated blocks that were never decided by a person belong in the human queue.
update public.requests
set moderation_status='pending',
    moderated_by=null,
    moderated_at=null,
    moderation_reason=null,
    updated_at=now()
where status in ('open','matched','in_progress')
  and moderation_status='blocked'
  and moderated_by is null;

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
      null,
      new.id,
      null,
      null,
      null
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
    v_body := '“' || left(new.title, 220) || '” is still private because a review lane found something that needs to be changed.';
    perform public.push_notification(
      new.poster_id,'post_review','post-review-blocked:' || new.id::text,
      'Your post needs changes',v_body,null,new.id,null,null,null
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

create or replace function public.moderator_review_request(p_request_id uuid, p_decision text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target uuid;
  v_status text;
  v_ai_level text;
  v_ai_score integer;
  v_ai_action text;
  v_action text;
  v_audit text;
  v_note text;
begin
  if not public.is_moderator() then raise exception 'Moderator access required.'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Invalid moderation decision.'; end if;
  if p_decision='rejected' and char_length(trim(coalesce(p_note,''))) < 3 then
    raise exception 'Add a short reason for the poster.';
  end if;

  select poster_id, moderation_status, ai_risk_level, ai_risk_score, ai_recommended_action
  into v_target, v_status, v_ai_level, v_ai_score, v_ai_action
  from public.requests where id=p_request_id for update;
  if not found then raise exception 'Request not found.'; end if;

  v_audit := format('AI risk=%s; score=%s; recommendation=%s',
    coalesce(v_ai_level,'unknown'), coalesce(v_ai_score::text,'n/a'), coalesce(v_ai_action,'review'));
  v_note := concat_ws(' · ', nullif(trim(coalesce(p_note,'')),''), v_audit);

  if p_decision='approved' and (v_ai_level in ('high','critical') or v_ai_action='block') then
    v_action := 'approve_request_ai_override';
  elsif p_decision='approved' then
    v_action := 'approve_request';
  else
    v_action := 'reject_request';
  end if;

  update public.requests
  set moderation_status=p_decision,
      moderated_by=auth.uid(),
      moderated_at=now(),
      moderation_reason=nullif(trim(coalesce(p_note,'')),''),
      updated_at=now()
  where id=p_request_id;

  insert into public.moderation_actions(moderator_id, action, target_user_id, request_id, note)
  values (auth.uid(), v_action, v_target, p_request_id, v_note);
end;
$$;

revoke all on function public.moderator_review_request(uuid,text,text) from public;
grant execute on function public.moderator_review_request(uuid,text,text) to authenticated;

create or replace function public.moderator_remove_request(p_request_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target uuid;
  v_title text;
begin
  if not public.is_moderator() then raise exception 'Moderator access required.'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 3 then raise exception 'Add a short moderation reason.'; end if;

  update public.requests
  set status='cancelled',
      moderated_by=auth.uid(),
      moderated_at=now(),
      moderation_reason=trim(p_reason),
      updated_at=now()
  where id=p_request_id and status in ('open','matched','in_progress')
  returning poster_id,title into v_target,v_title;

  if not found then raise exception 'Request is not active or was not found.'; end if;

  insert into public.moderation_actions(moderator_id, action, target_user_id, request_id, note)
  values (auth.uid(), 'remove_request', v_target, p_request_id, trim(p_reason));

  perform public.push_notification(
    v_target,
    'post_review',
    'post-review-removed:' || p_request_id::text,
    'Your post was removed',
    '“' || left(v_title, 220) || '” was removed from Aspire. Reason: ' || left(trim(p_reason), 240),
    auth.uid(),
    p_request_id,
    null,
    null,
    null
  );
end;
$$;

revoke all on function public.moderator_remove_request(uuid,text) from public;
grant execute on function public.moderator_remove_request(uuid,text) to authenticated;
