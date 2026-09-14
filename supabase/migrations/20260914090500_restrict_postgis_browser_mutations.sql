-- PostGIS metadata may remain readable, but browser roles must never mutate it.
revoke insert, update, delete on table public.spatial_ref_sys from anon, authenticated;
revoke insert, update, delete on table public.geography_columns, public.geometry_columns from anon, authenticated;
