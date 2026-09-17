-- User-facing moderation notifications.
-- The review engine remains fail-closed; this only tells the post owner when a
-- review finishes, needs changes, or is waiting on a human decision.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
check (kind in (
  'request_response','connection_chosen','connection_confirmed','connection_completed','connection_cancelled',
  'message','circle_mutual','connection_reminder','connection_coordination','resolution_case','post_review'
));

create or replace function public.notify_request_review_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_body text;
begin
  -- Notify once when the automated layers finish but a human review is still
  -- required. A stable event key avoids repeated alerts on rescans.
  if new.ai_moderation_status = 'complete'
     and old.ai_moderation_status is distinct from new.ai_moderation_status
     and new.moderation_status = 'pending' then
    perform public.push_notification(
      new.poster_id,
      'post_review',
      'post-review-pending:' || new.id::text,
      'Your post needs a closer review',
      '“' || left(new.title, 220) || '” is still private while a moderator reviews one or more review lanes.',
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
    v_body := '“' || left(new.title, 220) || '” was not approved. Open My Activity to review the status and submit a corrected post.';
    perform public.push_notification(
      new.poster_id,'post_review','post-review-rejected:' || new.id::text,
      'Your post was not approved',v_body,null,new.id,null,null,null
    );
  end if;

  return new;
end;
$function$;

revoke all on function public.notify_request_review_change() from public;

drop trigger if exists notify_request_review_after_change on public.requests;
create trigger notify_request_review_after_change
after update of moderation_status, ai_moderation_status on public.requests
for each row execute function public.notify_request_review_change();
