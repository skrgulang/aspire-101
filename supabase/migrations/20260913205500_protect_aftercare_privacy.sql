-- Keep post-connection choices private while preserving aggregate lifecycle behavior.
-- My Circle and trust logic continue to use SECURITY DEFINER functions, so users do not
-- need direct visibility into the other participant's individual choice/review row.

drop policy if exists "connection participants read circle choices" on public.connection_circle_choices;
drop policy if exists "users read own circle choice" on public.connection_circle_choices;
create policy "users read own circle choice" on public.connection_circle_choices
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "connection participants read reviews" on public.connection_reviews;
drop policy if exists "reviewers read own connection reviews" on public.connection_reviews;
create policy "reviewers read own connection reviews" on public.connection_reviews
for select to authenticated
using (reviewer_id = (select auth.uid()));
