-- Calibrate internal trust bands so a normal new account is not labeled caution.
-- Caution/restricted are reserved for materially negative history; positive verification/activity raises the band.

create or replace function public.refresh_user_trust_profile(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school boolean := false;
  v_identity boolean := false;
  v_orders integer := 0;
  v_positive integer := 0;
  v_negative integer := 0;
  v_rejected integer := 0;
  v_removed integer := 0;
  v_high_rejected integer := 0;
  v_score integer := 35;
  v_band text := 'new';
begin
  if p_user_id is null or not exists(select 1 from public.profiles p where p.id=p_user_id) then return; end if;
  select exists(select 1 from public.school_verifications s where s.user_id=p_user_id and s.status='verified') into v_school;
  select exists(select 1 from public.identity_verifications i where i.user_id=p_user_id and i.status='verified') into v_identity;
  select count(*)::integer from public.market_orders m where (m.buyer_id=p_user_id or m.seller_id=p_user_id) and m.status='released' into v_orders;
  select count(*)::integer from public.connection_reviews r where r.reviewee_id=p_user_id and r.would_connect_again=true into v_positive;
  select count(*)::integer from public.connection_reviews r where r.reviewee_id=p_user_id and r.would_connect_again=false into v_negative;
  select count(*)::integer from public.moderation_actions a where a.target_user_id=p_user_id and a.action='reject_request' into v_rejected;
  select count(*)::integer from public.moderation_actions a where a.target_user_id=p_user_id and a.action='remove_request' into v_removed;
  select count(*)::integer from public.requests r where r.poster_id=p_user_id and r.moderation_status in ('rejected','blocked') and r.ai_risk_level in ('high','critical') into v_high_rejected;

  v_score := 35
    + case when v_school then 20 else 0 end
    + case when v_identity then 10 else 0 end
    + least(v_orders * 3, 15)
    + least(v_positive * 2, 10)
    - least(v_negative * 3, 12)
    - least(v_rejected * 8, 24)
    - least(v_removed * 12, 36)
    - least(v_high_rejected * 6, 18);
  v_score := greatest(0, least(100, v_score));

  v_band := case
    when v_score <= 20 then 'restricted'
    when v_score <= 34 then 'caution'
    when v_score <= 60 then 'new'
    when v_score <= 80 then 'established'
    else 'trusted'
  end;

  insert into public.user_trust_profiles(
    user_id, trust_score, trust_band, school_verified, identity_verified,
    completed_market_orders, positive_reviews, negative_reviews, rejected_posts,
    removed_posts, high_risk_rejections, factors, updated_at
  ) values (
    p_user_id, v_score, v_band, v_school, v_identity,
    v_orders, v_positive, v_negative, v_rejected, v_removed, v_high_rejected,
    jsonb_build_object(
      'base',35,'school_verified',v_school,'identity_verified',v_identity,
      'completed_market_orders',v_orders,'positive_reviews',v_positive,
      'negative_reviews',v_negative,'rejected_posts',v_rejected,
      'removed_posts',v_removed,'high_risk_rejections',v_high_rejected
    ), now()
  ) on conflict (user_id) do update set
    trust_score=excluded.trust_score,
    trust_band=excluded.trust_band,
    school_verified=excluded.school_verified,
    identity_verified=excluded.identity_verified,
    completed_market_orders=excluded.completed_market_orders,
    positive_reviews=excluded.positive_reviews,
    negative_reviews=excluded.negative_reviews,
    rejected_posts=excluded.rejected_posts,
    removed_posts=excluded.removed_posts,
    high_risk_rejections=excluded.high_risk_rejections,
    factors=excluded.factors,
    updated_at=now();
end;
$$;

revoke all on function public.refresh_user_trust_profile(uuid) from public;
grant execute on function public.refresh_user_trust_profile(uuid) to authenticated, service_role;

do $$ declare r record; begin
  for r in select id from public.profiles loop
    perform public.refresh_user_trust_profile(r.id);
  end loop;
end $$;
