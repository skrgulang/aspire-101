-- Safety acknowledgements are written only for the user's newly-created request.
-- Bind the browser insert policy to that owner context and make duplicate acknowledgements idempotent.

alter table public.safety_acknowledgements
  drop constraint if exists safety_acknowledgements_context_bounds;

alter table public.safety_acknowledgements
  add constraint safety_acknowledgements_context_bounds check (
    request_id is not null
    and char_length(btrim(context_type)) between 1 and 120
    and acknowledgement_version = 'v1'
  );

drop policy if exists "users create acknowledgements" on public.safety_acknowledgements;
create policy "users create acknowledgements"
on public.safety_acknowledgements
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.requests r
    where r.id = request_id
      and r.poster_id = (select auth.uid())
  )
);

create unique index if not exists safety_ack_user_request_version_uq
  on public.safety_acknowledgements(user_id, request_id, acknowledgement_version);
