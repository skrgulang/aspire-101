-- Aspire 101 V2 trust-policy consolidation + auxiliary RLS optimization — 2026-09-10

-- Consolidate equivalent owner/staff read policies.
drop policy if exists "users read own avatar reviews" on public.avatar_moderation_reviews;
drop policy if exists "moderators read avatar reviews" on public.avatar_moderation_reviews;
drop policy if exists "avatar reviews owner or moderator read" on public.avatar_moderation_reviews;
create policy "avatar reviews owner or moderator read"
on public.avatar_moderation_reviews for select to authenticated
using ((select auth.uid()) = user_id or public.is_moderator());

drop policy if exists "users read own enforcement state" on public.user_enforcement_states;
drop policy if exists "moderators read enforcement states" on public.user_enforcement_states;
drop policy if exists "enforcement owner or moderator read" on public.user_enforcement_states;
create policy "enforcement owner or moderator read"
on public.user_enforcement_states for select to authenticated
using ((select auth.uid()) = user_id or public.is_moderator());

drop policy if exists "users read own trust profile" on public.user_trust_profiles;
drop policy if exists "moderators read trust profiles" on public.user_trust_profiles;
drop policy if exists "trust profile owner or moderator read" on public.user_trust_profiles;
create policy "trust profile owner or moderator read"
on public.user_trust_profiles for select to authenticated
using ((select auth.uid()) = user_id or public.is_moderator());

drop policy if exists "users read own role" on public.user_roles;
drop policy if exists "admins read roles" on public.user_roles;
drop policy if exists "role owner or admin read" on public.user_roles;
create policy "role owner or admin read"
on public.user_roles for select to authenticated
using ((select auth.uid()) = user_id or public.is_admin());

drop policy if exists "users read their own reports" on public.safety_reports;
drop policy if exists "moderators read safety reports" on public.safety_reports;
drop policy if exists "safety report owner or moderator read" on public.safety_reports;
create policy "safety report owner or moderator read"
on public.safety_reports for select to authenticated
using ((select auth.uid()) = reporter_id or public.is_moderator());

drop policy if exists "school verification owner read" on public.school_verifications;
drop policy if exists "moderators read school verification queue" on public.school_verifications;
drop policy if exists "school verification owner or moderator read" on public.school_verifications;
create policy "school verification owner or moderator read"
on public.school_verifications for select to authenticated
using ((select auth.uid()) = user_id or public.is_moderator());

-- Optimize remaining V2 participant/owner policies by initializing auth.uid() once.
alter policy "Users can read own AI sessions" on public.aspire_ai_sessions
  using (user_id = (select auth.uid()));
alter policy "Users can update own AI session outcome" on public.aspire_ai_sessions
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "connection participants read circle choices" on public.connection_circle_choices
  using (exists (
    select 1 from public.connections c
    where c.id = connection_circle_choices.connection_id
      and ((select auth.uid()) = c.requester_id or (select auth.uid()) = c.responder_id)
  ));

alter policy "participants confirm own completion" on public.connection_completion_confirmations
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.connections c
      where c.id = connection_completion_confirmations.connection_id
        and ((select auth.uid()) = c.requester_id or (select auth.uid()) = c.responder_id)
        and c.status = any (array['confirmed'::text, 'active'::text])
    )
  );
alter policy "participants read completion confirmations" on public.connection_completion_confirmations
  using (exists (
    select 1 from public.connections c
    where c.id = connection_completion_confirmations.connection_id
      and ((select auth.uid()) = c.requester_id or (select auth.uid()) = c.responder_id)
  ));

alter policy "users read own message cursor" on public.connection_message_reads
  using (user_id = (select auth.uid()));

alter policy "connection_payment_agreements_participants" on public.connection_payment_agreements
  using (
    exists (
      select 1 from public.connections c
      where c.id = connection_payment_agreements.connection_id
        and ((select auth.uid()) = c.requester_id or (select auth.uid()) = c.responder_id)
    )
    or public.is_moderator((select auth.uid()))
  );

alter policy "connection participants read reviews" on public.connection_reviews
  using (exists (
    select 1 from public.connections c
    where c.id = connection_reviews.connection_id
      and ((select auth.uid()) = c.requester_id or (select auth.uid()) = c.responder_id)
  ));

alter policy "market_delivery_links_select_participants" on public.market_delivery_links
  using (
    buyer_id = (select auth.uid())
    or exists (
      select 1 from public.market_orders o
      where o.id = market_delivery_links.market_order_id
        and o.seller_id = (select auth.uid())
    )
    or public.is_moderator((select auth.uid()))
  );

alter policy "market_orders_participants_read" on public.market_orders
  using ((select auth.uid()) = buyer_id or (select auth.uid()) = seller_id or public.is_admin());

alter policy "market_disputes_participants_read" on public.market_disputes
  using (exists (
    select 1 from public.market_orders mo
    where mo.id = market_disputes.market_order_id
      and (mo.buyer_id = (select auth.uid()) or mo.seller_id = (select auth.uid()) or public.is_admin())
  ));

alter policy "market_order_events_participants_read" on public.market_order_events
  using (exists (
    select 1 from public.market_orders mo
    where mo.id = market_order_events.market_order_id
      and (mo.buyer_id = (select auth.uid()) or mo.seller_id = (select auth.uid()) or public.is_admin())
  ));

alter policy "payment_ledger_participant_read" on public.payment_ledger_events
  using ((select auth.uid()) = payer_id or (select auth.uid()) = payee_id or public.is_admin());

alter policy "payment_refund_select_participants" on public.payment_refund_requests
  using (
    exists (
      select 1 from public.connection_payments p
      where p.id = payment_refund_requests.payment_id
        and ((select auth.uid()) = p.payer_id or (select auth.uid()) = p.payee_id)
    )
    or public.is_moderator((select auth.uid()))
  );
