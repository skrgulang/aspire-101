-- Aspire 101 message/Circle notifications and private Realtime room authorization.

create or replace function public.notify_connection_message_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_connection public.connections; v_target uuid;
begin
  select * into v_connection from public.connections where id=new.connection_id;
  if not found then return new; end if;
  v_target := case when new.sender_id=v_connection.requester_id then v_connection.responder_id else v_connection.requester_id end;
  if v_target is not null and v_target<>new.sender_id then
    perform public.push_notification(v_target,'message','message:'||new.id::text,'New private message',left(new.body,180),
      new.sender_id,v_connection.request_id,null,new.connection_id,new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.notify_connection_message_insert() from public;
drop trigger if exists notify_connection_message_after_insert on public.connection_messages;
create trigger notify_connection_message_after_insert after insert on public.connection_messages
for each row execute function public.notify_connection_message_insert();

create or replace function public.notify_mutual_circle_choice()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_connection public.connections; v_other_choice boolean;
begin
  if new.keep_in_circle is not true then return new; end if;
  select * into v_connection from public.connections where id=new.connection_id;
  if not found then return new; end if;
  select keep_in_circle into v_other_choice from public.connection_circle_choices
  where connection_id=new.connection_id and user_id<>new.user_id
    and user_id in (v_connection.requester_id,v_connection.responder_id)
  limit 1;
  if coalesce(v_other_choice,false) then
    perform public.push_notification(v_connection.requester_id,'circle_mutual',
      'circle-mutual:'||new.connection_id::text||':'||v_connection.requester_id::text,
      'You are both in My Circle','You can keep messaging after the completed connection.',new.user_id,
      v_connection.request_id,null,new.connection_id,null);
    perform public.push_notification(v_connection.responder_id,'circle_mutual',
      'circle-mutual:'||new.connection_id::text||':'||v_connection.responder_id::text,
      'You are both in My Circle','You can keep messaging after the completed connection.',new.user_id,
      v_connection.request_id,null,new.connection_id,null);
  end if;
  return new;
end;
$$;
revoke all on function public.notify_mutual_circle_choice() from public;
drop trigger if exists notify_circle_choice_after_change on public.connection_circle_choices;
create trigger notify_circle_choice_after_change after insert or update of keep_in_circle on public.connection_circle_choices
for each row execute function public.notify_mutual_circle_choice();

-- Private Realtime rooms use topics shaped as connection:<connection uuid>.
drop policy if exists "connection participants receive realtime room" on realtime.messages;
create policy "connection participants receive realtime room"
on realtime.messages for select to authenticated
using (
  realtime.topic() like 'connection:%'
  and exists (
    select 1 from public.connections c
    where c.id::text=split_part(realtime.topic(),':',2)
      and (auth.uid()=c.requester_id or auth.uid()=c.responder_id)
      and c.status in ('confirmed','active','completed')
  )
);

drop policy if exists "connection participants send realtime room" on realtime.messages;
create policy "connection participants send realtime room"
on realtime.messages for insert to authenticated
with check (
  realtime.topic() like 'connection:%'
  and exists (
    select 1 from public.connections c
    where c.id::text=split_part(realtime.topic(),':',2)
      and (auth.uid()=c.requester_id or auth.uid()=c.responder_id)
      and (
        c.status in ('confirmed','active')
        or (c.status='completed' and public.can_message_connection(c.id))
      )
  )
);

do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname='supabase_realtime' and schemaname='public' and tablename='notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
