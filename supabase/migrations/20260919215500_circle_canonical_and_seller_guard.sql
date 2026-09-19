-- Harden Circle into one writable completed thread per person and require
-- all seller listings to enter through the server-side Stripe verification path.

create or replace function public.can_message_connection(p_connection_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.connections c
    where c.id = p_connection_id
      and (auth.uid() = c.requester_id or auth.uid() = c.responder_id)
      and (
        c.status in ('confirmed','active')
        or (
          c.status = 'completed'
          and exists (
            select 1
            from public.connection_circle_choices a
            join public.connection_circle_choices b
              on b.connection_id = a.connection_id
            where a.connection_id = c.id
              and a.user_id = c.requester_id
              and a.keep_in_circle = true
              and b.user_id = c.responder_id
              and b.keep_in_circle = true
          )
          and not exists (
            select 1
            from public.connections newer
            where newer.id <> c.id
              and newer.status = 'completed'
              and (
                (newer.requester_id = c.requester_id and newer.responder_id = c.responder_id)
                or
                (newer.requester_id = c.responder_id and newer.responder_id = c.requester_id)
              )
              and (
                newer.created_at > c.created_at
                or (newer.created_at = c.created_at and newer.id::text > c.id::text)
              )
              and exists (
                select 1
                from public.connection_circle_choices na
                join public.connection_circle_choices nb
                  on nb.connection_id = na.connection_id
                where na.connection_id = newer.id
                  and na.user_id = newer.requester_id
                  and na.keep_in_circle = true
                  and nb.user_id = newer.responder_id
                  and nb.keep_in_circle = true
              )
          )
        )
      )
      and not exists (
        select 1
        from public.user_blocks ub
        where (ub.blocker_id = c.requester_id and ub.blocked_id = c.responder_id)
           or (ub.blocker_id = c.responder_id and ub.blocked_id = c.requester_id)
      )
  );
$$;

revoke all on function public.can_message_connection(uuid) from public, anon;
grant execute on function public.can_message_connection(uuid) to authenticated;

create or replace function public.get_my_circle()
returns table(connection_id uuid, other_user_id uuid, connected_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with mutual as (
    select
      c.id as connection_id,
      case when auth.uid() = c.requester_id then c.responder_id else c.requester_id end as other_user_id,
      greatest(a.updated_at, b.updated_at) as connected_at,
      c.created_at
    from public.connections c
    join public.connection_circle_choices a
      on a.connection_id = c.id
     and a.user_id = c.requester_id
     and a.keep_in_circle = true
    join public.connection_circle_choices b
      on b.connection_id = c.id
     and b.user_id = c.responder_id
     and b.keep_in_circle = true
    where auth.uid() is not null
      and c.status = 'completed'
      and (auth.uid() = c.requester_id or auth.uid() = c.responder_id)
      and not exists (
        select 1
        from public.user_blocks ub
        where (ub.blocker_id = c.requester_id and ub.blocked_id = c.responder_id)
           or (ub.blocker_id = c.responder_id and ub.blocked_id = c.requester_id)
      )
  ),
  ranked as (
    select
      mutual.*,
      row_number() over (
        partition by other_user_id
        order by created_at desc, connection_id::text desc
      ) as rn
    from mutual
  )
  select ranked.connection_id, ranked.other_user_id, ranked.connected_at
  from ranked
  where ranked.rn = 1
  order by ranked.connected_at desc;
$$;

revoke all on function public.get_my_circle() from public, anon;
grant execute on function public.get_my_circle() to authenticated;

create or replace function public.guard_marketplace_seller_server_path()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_sell boolean;
  v_old_sell boolean := false;
begin
  v_new_sell := new.kind = 'buy_sell' and coalesce(new.market_intent, 'sell') = 'sell';

  if tg_op = 'UPDATE' then
    v_old_sell := old.kind = 'buy_sell' and coalesce(old.market_intent, 'sell') = 'sell';
  end if;

  if v_new_sell
     and (tg_op = 'INSERT' or not v_old_sell)
     and coalesce(auth.role(), '') <> 'service_role'
  then
    raise exception 'SELLER_SERVER_REQUIRED';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_marketplace_seller_server_path() from public, anon, authenticated;

drop trigger if exists guard_marketplace_seller_server_path_tg on public.requests;
create trigger guard_marketplace_seller_server_path_tg
before insert or update of kind, market_intent on public.requests
for each row execute function public.guard_marketplace_seller_server_path();
