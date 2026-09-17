-- These SECURITY DEFINER helpers exist only for database triggers. They should
-- never be callable as RPC endpoints by browser roles.
revoke all on function public.invalidate_request_moderation_for_media() from public;
revoke all on function public.invalidate_request_moderation_for_media() from anon;
revoke all on function public.invalidate_request_moderation_for_media() from authenticated;

revoke all on function public.invalidate_request_review_sensitive_fields() from public;
revoke all on function public.invalidate_request_review_sensitive_fields() from anon;
revoke all on function public.invalidate_request_review_sensitive_fields() from authenticated;
