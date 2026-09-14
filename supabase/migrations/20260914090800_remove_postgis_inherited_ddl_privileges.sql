-- Prevent browser roles from inheriting ownership-style PostGIS metadata privileges through PUBLIC.
revoke truncate, references, trigger on table public.spatial_ref_sys, public.geography_columns, public.geometry_columns from public;
