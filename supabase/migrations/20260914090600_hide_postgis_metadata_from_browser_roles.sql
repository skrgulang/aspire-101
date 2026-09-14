-- Aspire does not expose PostGIS metadata through its browser Data API.
revoke select on table public.spatial_ref_sys, public.geography_columns, public.geometry_columns from anon, authenticated;
