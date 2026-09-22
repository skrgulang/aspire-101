-- Let each user choose how their identity appears on campus post cards.
-- Only the chosen public label is exposed; private preference rows remain private.

alter table public.user_preferences
  add column if not exists post_identity_mode text not null default 'campus_user';

alter table public.user_preferences
  drop constraint if exists user_preferences_post_identity_mode_check;

alter table public.user_preferences
  add constraint user_preferences_post_identity_mode_check
  check (post_identity_mode in ('display_name','username','campus_user'));

create or replace function public.get_feed_author_labels(p_user_ids uuid[])
returns table(user_id uuid, author_label text)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as user_id,
    case coalesce(up.post_identity_mode, 'campus_user')
      when 'display_name' then coalesce(
        nullif(btrim(p.display_name), ''),
        nullif(btrim(p.full_name), ''),
        nullif(btrim(p.name), ''),
        'Campus student'
      )
      when 'username' then case
        when nullif(btrim(p.username::text), '') is not null then '@' || btrim(p.username::text)
        else 'Campus student'
      end
      else 'Campus student'
    end as author_label
  from public.profiles p
  left join public.user_preferences up on up.user_id = p.id
  where p.id = any(coalesce(p_user_ids, '{}'::uuid[]));
$$;

revoke all on function public.get_feed_author_labels(uuid[]) from public, anon;
grant execute on function public.get_feed_author_labels(uuid[]) to authenticated;
