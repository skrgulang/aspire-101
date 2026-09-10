-- Aspire 101 V2 RLS hot-path optimization — 2026-09-10
-- Supabase recommends wrapping auth.uid() in SELECT so it is initialized once
-- per statement instead of re-evaluated for every row.

alter policy "participants read connection payments" on public.connection_payments
  using (((select auth.uid()) = payer_id) or ((select auth.uid()) = payee_id));

alter policy "connection participants can read" on public.connections
  using (((select auth.uid()) = requester_id) or ((select auth.uid()) = responder_id));

alter policy "identity_verification_read_own" on public.identity_verifications
  using (user_id = (select auth.uid()));

alter policy "users read own notifications" on public.notifications
  using (user_id = (select auth.uid()));

alter policy "users read own payment account" on public.payment_accounts
  using ((select auth.uid()) = user_id);

alter policy "request_media_delete_own" on public.request_media
  using (uploader_id = (select auth.uid()));

alter policy "request_media_insert_own" on public.request_media
  with check (
    uploader_id = (select auth.uid())
    and exists (
      select 1 from public.requests r
      where r.id = request_media.request_id
        and r.poster_id = (select auth.uid())
    )
  );

alter policy "request_media_read_moderated" on public.request_media
  using (
    uploader_id = (select auth.uid())
    or public.is_moderator()
    or exists (
      select 1 from public.requests r
      where r.id = request_media.request_id
        and r.moderation_status = 'approved'
    )
  );

alter policy "request_media_update_own" on public.request_media
  using (uploader_id = (select auth.uid()))
  with check (uploader_id = (select auth.uid()));

alter policy "responders can withdraw" on public.request_responses
  using ((select auth.uid()) = responder_id)
  with check ((select auth.uid()) = responder_id and status = any (array['pending'::text, 'withdrawn'::text]));

alter policy "response participants can read" on public.request_responses
  using (
    (select auth.uid()) = responder_id
    or exists (
      select 1 from public.requests r
      where r.id = request_responses.request_id
        and r.poster_id = (select auth.uid())
    )
  );

alter policy "users respond as themselves" on public.request_responses
  with check (
    (select auth.uid()) = responder_id
    and exists (
      select 1 from public.requests r
      where r.id = request_responses.request_id
        and r.poster_id <> (select auth.uid())
        and r.status = 'open'
    )
  );

alter policy "approved requests or owner or moderators can read" on public.requests
  using ((select auth.uid()) = poster_id or moderation_status = 'approved' or public.is_moderator());

alter policy "owners delete their requests" on public.requests
  using ((select auth.uid()) = poster_id);

alter policy "owners update their requests" on public.requests
  using ((select auth.uid()) = poster_id)
  with check ((select auth.uid()) = poster_id);

alter policy "verified users create their own requests" on public.requests
  with check (
    (select auth.uid()) = poster_id
    and public.can_post_request()
    and campus_id is not null
    and exists (select 1 from public.universities u where u.id = requests.campus_id and u.active = true)
  );

alter policy "users create their own blocks" on public.user_blocks
  with check ((select auth.uid()) = blocker_id);
alter policy "users read their own blocks" on public.user_blocks
  using ((select auth.uid()) = blocker_id);
alter policy "users remove their own blocks" on public.user_blocks
  using ((select auth.uid()) = blocker_id);

alter policy "users submit their own reports" on public.safety_reports
  with check ((select auth.uid()) = reporter_id);
alter policy "users read their own reports" on public.safety_reports
  using ((select auth.uid()) = reporter_id);

alter policy "school verification owner insert" on public.school_verifications
  with check ((select auth.uid()) = user_id and status = 'pending');
alter policy "school verification owner read" on public.school_verifications
  using ((select auth.uid()) = user_id);
alter policy "school verification owner resubmit" on public.school_verifications
  using ((select auth.uid()) = user_id and status <> 'verified')
  with check ((select auth.uid()) = user_id and status = 'pending');

alter policy "allowed connection participants send messages" on public.connection_messages
  with check ((select auth.uid()) = sender_id and public.can_message_connection(connection_id));
alter policy "connection participants read messages" on public.connection_messages
  using (exists (
    select 1 from public.connections c
    where c.id = connection_messages.connection_id
      and ((select auth.uid()) = c.requester_id or (select auth.uid()) = c.responder_id)
  ));
