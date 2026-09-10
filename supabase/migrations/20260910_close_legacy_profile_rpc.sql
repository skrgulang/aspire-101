-- Aspire 101 RPC surface cleanup — 2026-09-10

-- V2 does not use this legacy profile RPC. It bypasses the profile column ACL
-- and could rewrite the display school field, so it must not be client-callable.
revoke execute on function public.upsert_my_profile(text, text, text)
  from public, anon, authenticated;

-- This overload is an internal helper used by can_post_request(). Keep only the
-- current-user zero-argument function exposed to signed-in clients.
revoke execute on function public.can_post_request(uuid)
  from public, anon, authenticated;

grant execute on function public.can_post_request() to authenticated;
