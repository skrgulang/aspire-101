revoke insert, update on table public.request_responses from authenticated;
grant insert (request_id, responder_id, message) on table public.request_responses to authenticated;
grant update (status) on table public.request_responses to authenticated;

alter policy "responders can withdraw" on public.request_responses
  using (
    (select auth.uid()) = responder_id
    and status in ('pending','withdrawn')
  )
  with check (
    (select auth.uid()) = responder_id
    and status in ('pending','withdrawn')
  );
