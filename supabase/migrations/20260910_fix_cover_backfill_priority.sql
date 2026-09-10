with picks as (
  select r.id as request_id, pick.id as asset_id, pick.campus_id, pick.category_key, pick.image_url
  from public.requests r
  cross join lateral (
    select c.id, c.campus_id, c.category_key, c.image_url
    from public.campus_cover_images c
    where c.active = true
      and (c.campus_id = r.campus_id or c.campus_id is null)
      and (c.category_key = r.category or c.category_key is null)
    order by
      coalesce(c.campus_id = r.campus_id, false) desc,
      coalesce(c.category_key = r.category, false) desc,
      c.priority desc,
      c.created_at asc
    limit 1
  ) pick
  where not exists (select 1 from public.request_media rm where rm.request_id = r.id)
)
update public.requests r
set cover_image_url = p.image_url,
    cover_image_asset_id = p.asset_id,
    cover_image_source = case when p.category_key is not null then 'system_recommended'
                              when p.campus_id is not null then 'campus_default'
                              else 'global_default' end
from picks p
where p.request_id = r.id
  and coalesce(r.cover_image_source, 'none') <> 'user';
