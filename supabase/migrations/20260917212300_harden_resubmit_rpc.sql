-- Supabase installations may have default function grants for anon/auth roles.
-- Keep the correction RPC off the anonymous API surface explicitly.
revoke all on function public.resubmit_request_for_review(uuid,text,text,text,integer,text,boolean,text[],text,text,text,integer) from public;
revoke all on function public.resubmit_request_for_review(uuid,text,text,text,integer,text,boolean,text[],text,text,text,integer) from anon;
grant execute on function public.resubmit_request_for_review(uuid,text,text,text,integer,text,boolean,text[],text,text,text,integer) to authenticated;
