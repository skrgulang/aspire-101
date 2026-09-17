-- Supabase grants EXECUTE on new functions to anon/authenticated/service_role by
-- default. These privacy RPCs should not be callable anonymously, and the
-- sanitizer helper does not need to be called directly by browser roles.

revoke execute on function public.get_my_activity_requests() from anon;
revoke execute on function public.moderator_fetch_requests(integer) from anon;

revoke execute on function public.aspire_user_visible_review_flags(text[]) from anon;
revoke execute on function public.aspire_user_visible_review_flags(text[]) from authenticated;
