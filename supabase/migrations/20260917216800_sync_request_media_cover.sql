-- Keep request cover presentation metadata consistent with request_media.
-- Browser users no longer have UPDATE access to cover_image_* request columns;
-- the database owns this invariant instead.

create or replace function public.sync_request_cover_for_media()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid := coalesce(new.request_id, old.request_id);
begin
  if tg_op = 'INSERT' then
    update public.requests
    set cover_image_source = 'user',
        cover_image_url = null,
        cover_image_asset_id = null
    where id = v_request_id;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if not exists (
      select 1 from public.request_media rm where rm.request_id = v_request_id
    ) then
      update public.requests
      set cover_image_source = 'none',
          cover_image_url = null,
          cover_image_asset_id = null
      where id = v_request_id;
    end if;
    return old;
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.sync_request_cover_for_media() from public;
revoke all on function public.sync_request_cover_for_media() from anon;
revoke all on function public.sync_request_cover_for_media() from authenticated;

drop trigger if exists request_media_sync_cover_tg on public.request_media;
create trigger request_media_sync_cover_tg
after insert or delete on public.request_media
for each row execute function public.sync_request_cover_for_media();

-- Repair any pre-existing metadata drift without changing moderation state.
update public.requests r
set cover_image_source = 'user',
    cover_image_url = null,
    cover_image_asset_id = null
where exists (select 1 from public.request_media rm where rm.request_id = r.id)
  and (
    r.cover_image_source is distinct from 'user'
    or r.cover_image_url is not null
    or r.cover_image_asset_id is not null
  );

update public.requests r
set cover_image_source = 'none',
    cover_image_url = null,
    cover_image_asset_id = null
where r.cover_image_source = 'user'
  and not exists (select 1 from public.request_media rm where rm.request_id = r.id);
