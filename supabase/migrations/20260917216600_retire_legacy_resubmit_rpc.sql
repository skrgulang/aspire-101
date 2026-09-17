-- The browser now uses resubmit_request_for_review_v2(), which returns only the
-- request id and performs selected media-row removals transactionally. Retire the
-- legacy full-row RPC from browser roles so it cannot expose moderation internals.
revoke all on function public.resubmit_request_for_review(uuid,text,text,text,integer,text,boolean,text[],text,text,text,integer) from public;
revoke all on function public.resubmit_request_for_review(uuid,text,text,text,integer,text,boolean,text[],text,text,text,integer) from anon;
revoke execute on function public.resubmit_request_for_review(uuid,text,text,text,integer,text,boolean,text[],text,text,text,integer) from authenticated;
