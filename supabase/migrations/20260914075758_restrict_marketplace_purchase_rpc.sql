revoke execute on function public.purchase_marketplace_listing(uuid) from anon;
revoke execute on function public.purchase_marketplace_listing(uuid) from public;
grant execute on function public.purchase_marketplace_listing(uuid) to authenticated;
