-- Browser roles never need ownership-style privileges on PostGIS metadata.
revoke truncate, references, trigger on table public.spatial_ref_sys, public.geography_columns, public.geometry_columns from anon, authenticated;
