-- Server-side cancellation and resolution RPCs notify both participants.
-- The helper remains unavailable to browser roles; service_role executes it
-- from trusted server routes while the RPC uses SECURITY INVOKER.
grant execute on function public.push_notification(uuid,text,text,text,text,uuid,uuid,uuid,uuid,bigint)
  to service_role;
