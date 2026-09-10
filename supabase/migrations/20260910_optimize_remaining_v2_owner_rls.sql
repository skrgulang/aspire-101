-- Preserve owner-only semantics while allowing PostgreSQL to evaluate auth.uid() once per statement.

alter policy "request owners read private location"
  on public.request_private_locations
  to authenticated
  using ((select auth.uid()) = owner_id);

alter policy "users create acknowledgements"
  on public.safety_acknowledgements
  to authenticated
  with check ((select auth.uid()) = user_id);

alter policy "users read acknowledgements"
  on public.safety_acknowledgements
  to authenticated
  using ((select auth.uid()) = user_id);

alter policy ul_read_own
  on public.user_locations
  to authenticated
  using ((select auth.uid()) = user_id);

alter policy ul_upsert_own
  on public.user_locations
  to authenticated
  with check ((select auth.uid()) = user_id);
