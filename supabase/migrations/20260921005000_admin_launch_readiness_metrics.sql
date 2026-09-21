create or replace function public.admin_launch_readiness_metrics()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select jsonb_build_object(
    'generatedAt', now(),
    'schoolVerified', (select count(*) from public.school_verifications where status = 'verified'),
    'schoolPending', (select count(*) from public.school_verifications where status = 'pending'),
    'phoneVerified', (select count(*) from auth.users where phone_confirmed_at is not null),
    'livePayoutAccounts', (select count(*) from public.payment_accounts where livemode is true),
    'sandboxPayoutAccounts', (select count(*) from public.payment_accounts where livemode is false),
    'livePayments', (select count(*) from public.connection_payments where stripe_livemode is true),
    'sandboxPayments', (select count(*) from public.connection_payments where stripe_livemode is false),
    'pendingPosts', (
      select count(*) from public.requests
      where moderation_status = 'pending'
        and status in ('open','matched','in_progress')
    ),
    'openSafetyReports', (
      select count(*) from public.safety_reports
      where status in ('submitted','reviewing')
    ),
    'openResolutionCases', (
      select count(*) from public.connection_resolution_cases
      where status in ('submitted','under_review')
    ),
    'openSupportItems', (
      select count(*) from public.support_feedback
      where approved = false and archived = false
    ),
    'emailAttention24h', (
      select count(*) from public.resend_webhook_events
      where event_type in ('email.bounced','email.complained','email.failed','email.suppressed')
        and received_at > now() - interval '24 hours'
        and coalesce(sender_domain,'') <> 'resend.dev'
        and not ('resend.dev' = any(coalesce(recipient_domains, '{}'::text[])))
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_launch_readiness_metrics() from public, anon;
grant execute on function public.admin_launch_readiness_metrics() to authenticated;
