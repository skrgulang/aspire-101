-- Keep reconnect-review data internally consistent.
-- Positive trust tags only apply when the reviewer says they would connect again.

create or replace function public.submit_connection_review(
  p_connection_id uuid,
  p_would_connect_again boolean,
  p_tags text[] default '{}'::text[],
  p_note text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.connections;
  v_reviewee uuid;
  v_id bigint;
  v_tags text[] := '{}'::text[];
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_connection
  from public.connections
  where id = p_connection_id;

  if not found then raise exception 'Connection not found'; end if;
  if auth.uid() <> v_connection.requester_id and auth.uid() <> v_connection.responder_id then
    raise exception 'Not authorized';
  end if;
  if v_connection.status <> 'completed' then
    raise exception 'Complete the connection before reviewing';
  end if;

  v_reviewee := case
    when auth.uid() = v_connection.requester_id then v_connection.responder_id
    else v_connection.requester_id
  end;

  if p_would_connect_again then
    select coalesce(array_agg(distinct tag), '{}'::text[])
      into v_tags
    from unnest(coalesce(p_tags, '{}'::text[])) tag
    where tag in ('reliable','friendly','on_time','good_communication','helpful');
  end if;

  insert into public.connection_reviews(
    connection_id, reviewer_id, reviewee_id, would_connect_again, tags, note, updated_at
  )
  values (
    p_connection_id,
    auth.uid(),
    v_reviewee,
    p_would_connect_again,
    v_tags,
    nullif(left(btrim(coalesce(p_note,'')),500),''),
    now()
  )
  on conflict (connection_id, reviewer_id) do update
    set would_connect_again = excluded.would_connect_again,
        tags = excluded.tags,
        note = excluded.note,
        updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;
