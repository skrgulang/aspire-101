-- Participants need the original request to render their private connection and
-- marketplace order, even when the request is still awaiting moderation.
-- This does not expose pending requests to users outside that connection.
create policy "connection participants can read linked requests"
on public.requests
for select
to authenticated
using (
  exists (
    select 1
    from public.connections c
    where c.request_id = requests.id
      and (
        c.requester_id = (select auth.uid())
        or c.responder_id = (select auth.uid())
      )
  )
);
