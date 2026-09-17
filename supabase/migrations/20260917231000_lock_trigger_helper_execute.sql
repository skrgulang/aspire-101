-- Trigger helpers should only execute through their database triggers.
-- They are not browser RPCs. Removing application-role EXECUTE closes an
-- unnecessary SECURITY DEFINER surface without affecting trigger execution.

revoke execute on function public.audit_request_moderation_layers() from public, anon, authenticated;
revoke execute on function public.bridge_marketplace_seller_delivery_response() from public, anon, authenticated;
revoke execute on function public.notify_request_review_change() from public, anon, authenticated;
revoke execute on function public.sync_request_market_review_summary() from public, anon, authenticated;
revoke execute on function public.sync_request_moderation_layers() from public, anon, authenticated;

grant execute on function public.audit_request_moderation_layers() to service_role;
grant execute on function public.bridge_marketplace_seller_delivery_response() to service_role;
grant execute on function public.notify_request_review_change() to service_role;
grant execute on function public.sync_request_market_review_summary() to service_role;
grant execute on function public.sync_request_moderation_layers() to service_role;
