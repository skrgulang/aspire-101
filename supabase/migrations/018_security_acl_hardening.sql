-- Harden high-value Trust & Safety, marketplace, payment, and private-data surfaces.
-- Trigger-only functions are not RPC endpoints. User-facing SECURITY DEFINER RPCs remain authenticated-only.

-- Trigger/internal Trust & Safety functions: never callable from PostgREST clients.
revoke execute on function public.guard_request_content() from public, anon, authenticated;
revoke execute on function public.guard_message_content() from public, anon, authenticated;
revoke execute on function public.guard_request_velocity() from public, anon, authenticated;
revoke execute on function public.guard_response_velocity() from public, anon, authenticated;
revoke execute on function public.guard_message_velocity() from public, anon, authenticated;
revoke execute on function public.refresh_trust_from_school_verification() from public, anon, authenticated;
revoke execute on function public.refresh_trust_from_identity_verification() from public, anon, authenticated;
revoke execute on function public.refresh_trust_from_review() from public, anon, authenticated;
revoke execute on function public.refresh_trust_from_market_order() from public, anon, authenticated;
revoke execute on function public.refresh_trust_from_moderation_action() from public, anon, authenticated;
revoke execute on function public.refresh_user_trust_profile(uuid) from public, anon, authenticated;
grant execute on function public.refresh_user_trust_profile(uuid) to service_role;

-- Word-list administration is server/admin-only and must not be callable by normal accounts.
revoke execute on function public.add_banned_pattern(text,text) from public, anon, authenticated;
revoke execute on function public.add_banned_patterns(text[],text) from public, anon, authenticated;

-- V2 RPCs below are signed-in surfaces. Remove accidental anonymous execution grants.
revoke execute on function public.can_post_request() from anon;
revoke execute on function public.accept_request_response(uuid) from anon;
revoke execute on function public.confirm_connection(uuid) from anon;
revoke execute on function public.cancel_connection(uuid) from anon;
revoke execute on function public.confirm_connection_completion(uuid) from anon;
revoke execute on function public.get_connection_unread_counts() from anon;
revoke execute on function public.get_my_circle() from anon;
revoke execute on function public.mark_connection_read(uuid,bigint) from anon;
revoke execute on function public.set_circle_choice(uuid,boolean) from anon;
revoke execute on function public.submit_connection_review(uuid,boolean,text[],text) from anon;
revoke execute on function public.discover_requests(uuid,text,text,integer) from anon;
revoke execute on function public.market_mark_handoff(uuid) from anon;
revoke execute on function public.market_confirm_receipt(uuid) from anon;
revoke execute on function public.market_open_dispute(uuid,text,text) from anon;
revoke execute on function public.set_connection_payment_method(uuid,text) from anon;
revoke execute on function public.quote_aspire_fees(integer,uuid,integer) from anon;
revoke execute on function public.mark_notification_read(bigint) from anon;
revoke execute on function public.mark_all_notifications_read() from anon;
revoke execute on function public.upsert_my_profile(text,text,text) from anon;

-- Moderator/admin RPCs are still callable by signed-in users because the functions perform role checks internally.
revoke execute on function public.moderator_review_request(uuid,text,text) from anon;
revoke execute on function public.moderator_remove_request(uuid,text) from anon;
revoke execute on function public.moderator_review_safety_report(uuid,text,text) from anon;
revoke execute on function public.review_school_verification(uuid,text,text) from anon;
revoke execute on function public.set_moderator_by_email(text,boolean) from anon;

-- Anonymous visitors must not discover/read payment, verification, private-media, or internal risk tables.
revoke select on table public.identity_verifications from anon;
revoke select on table public.market_orders from anon;
revoke select on table public.market_disputes from anon;
revoke select on table public.market_order_events from anon;
revoke select on table public.connection_payments from anon;
revoke select on table public.payment_accounts from anon;
revoke select on table public.request_media from anon;
revoke select on table public.request_private_locations from anon;
revoke select on table public.request_ai_assessments from anon;
revoke select on table public.user_trust_profiles from anon;
revoke select on table public.moderation_actions from anon;
revoke select on table public.stripe_webhook_events from anon;
