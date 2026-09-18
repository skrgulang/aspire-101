-- Retire legacy nearby content/profile RPCs from browser roles.
-- The current Next.js product uses campus/request discovery; these functions are referenced only by the old static site.
-- Keep service-role execution available for controlled maintenance while preventing accidental location/profile exposure.

revoke all on function public.nearby_posts(double precision,double precision,double precision) from PUBLIC, anon, authenticated;
revoke all on function public.nearby_profiles(double precision,double precision,double precision) from PUBLIC, anon, authenticated;
revoke all on function public.nearby_tasks(double precision,double precision,double precision) from PUBLIC, anon, authenticated;
revoke all on function public.nearby_tasks(double precision,double precision,integer) from PUBLIC, anon, authenticated;

grant execute on function public.nearby_posts(double precision,double precision,double precision) to service_role;
grant execute on function public.nearby_profiles(double precision,double precision,double precision) to service_role;
grant execute on function public.nearby_tasks(double precision,double precision,double precision) to service_role;
grant execute on function public.nearby_tasks(double precision,double precision,integer) to service_role;
