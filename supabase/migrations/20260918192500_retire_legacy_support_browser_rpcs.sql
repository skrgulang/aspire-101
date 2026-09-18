-- The current Next.js product has no support-feedback browser route or RPC caller.
-- Retire the remaining anonymous SECURITY DEFINER support surface until a first-class
-- support route is reintroduced with server-side abuse controls.

revoke all on function public.get_public_support_feedback(integer) from PUBLIC, anon, authenticated;
grant execute on function public.get_public_support_feedback(integer) to service_role;

revoke all on function public.submit_support_feedback(text,text,text,text,text,text,text,text) from PUBLIC, anon, authenticated;
grant execute on function public.submit_support_feedback(text,text,text,text,text,text,text,text) to service_role;
