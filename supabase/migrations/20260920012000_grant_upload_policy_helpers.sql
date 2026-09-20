-- Storage RLS policies call these SECURITY DEFINER helpers as the authenticated user.
-- The caller still needs EXECUTE privilege on the helper function itself.
-- Keep anon blocked, but allow authenticated policies to evaluate safely.

revoke all on function public.can_upload_request_media_object(text) from public, anon;
revoke all on function public.can_upload_marketplace_draft_object(text) from public, anon;

grant execute on function public.can_upload_request_media_object(text) to authenticated;
grant execute on function public.can_upload_marketplace_draft_object(text) to authenticated;
