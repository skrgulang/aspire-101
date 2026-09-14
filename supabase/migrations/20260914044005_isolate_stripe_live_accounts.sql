-- Preserve existing connected accounts as Sandbox records, while allowing each
-- user to onboard a separate Stripe account in Live mode.
alter table public.payment_accounts
  add column if not exists livemode boolean;

update public.payment_accounts
set livemode = false
where livemode is null;

alter table public.payment_accounts
  alter column livemode set default false,
  alter column livemode set not null;

do $$
declare
  current_pk text;
begin
  select pg_get_constraintdef(oid)
  into current_pk
  from pg_constraint
  where conrelid = 'public.payment_accounts'::regclass
    and contype = 'p';

  if current_pk is distinct from 'PRIMARY KEY (user_id, livemode)' then
    alter table public.payment_accounts drop constraint if exists payment_accounts_pkey;
    alter table public.payment_accounts
      add constraint payment_accounts_pkey primary key (user_id, livemode);
  end if;
end
$$;

comment on column public.payment_accounts.livemode is
  'False for Stripe Sandbox/Test accounts and true for Stripe Live accounts.';
