-- Review notes/tags are private to the reviewer.
-- Browser clients only need the current user's own saved reviews.

create or replace function public.get_my_connection_reviews(p_connection_ids uuid[])
returns table(
  id bigint,
  connection_id uuid,
  reviewer_id uuid,
  reviewee_id uuid,
  would_connect_again boolean,
  tags text[],
  note text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.connection_id,
    r.reviewer_id,
    r.reviewee_id,
    r.would_connect_again,
    r.tags,
    r.note,
    r.created_at,
    r.updated_at
  from public.connection_reviews r
  where auth.uid() is not null
    and coalesce(array_length(p_connection_ids,1),0) between 1 and 200
    and r.connection_id = any(p_connection_ids)
    and r.reviewer_id = auth.uid()
  order by r.created_at asc;
$$;

revoke all on function public.get_my_connection_reviews(uuid[]) from public, anon;
grant execute on function public.get_my_connection_reviews(uuid[]) to authenticated, service_role;
