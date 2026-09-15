-- Use cryptographic randomness for 4-digit handoff codes.
-- The code space intentionally stays human-friendly; attempt limits remain the online-guessing control.

create or replace function public.delivery_new_code()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  with entropy as (
    select extensions.gen_random_bytes(2) as bytes
  )
  select lpad(
    (((get_byte(bytes, 0) * 256) + get_byte(bytes, 1)) % 10000)::text,
    4,
    '0'
  )
  from entropy;
$$;

revoke all on function public.delivery_new_code() from public;
