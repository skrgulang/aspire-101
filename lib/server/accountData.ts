import type { SupabaseClient, User } from '@supabase/supabase-js';

type ServiceClient = SupabaseClient;

export type AccountDeletionBlocker = {
  code: string;
  message: string;
  href?: string;
};

async function expectOk<T>(promise: PromiseLike<{ data: T; error: { message: string } | null }>, label: string) {
  const { data, error } = await promise;
  if (error) throw new Error(`ACCOUNT_DATA:${label}:${error.message}`);
  return data;
}

export async function buildAccountExport(supabase: ServiceClient, user: User) {
  const userId = user.id;

  const [profile, preferences, schoolVerification, identityVerification, requests, responses, connections, reviews, payments, resolutionCases, resolutionResponses, notifications, circleChoices, completionConfirmations, paymentAccount] = await Promise.all([
    expectOk(supabase.from('profiles').select('*').eq('id', userId).maybeSingle(), 'profile_export'),
    expectOk(supabase.from('user_preferences').select('*').eq('user_id', userId).maybeSingle(), 'preferences_export'),
    expectOk(supabase.from('school_verifications').select('*').eq('user_id', userId).maybeSingle(), 'school_export'),
    expectOk(supabase.from('identity_verifications').select('status,provider,verified_at,created_at,updated_at').eq('user_id', userId).maybeSingle(), 'identity_export'),
    expectOk(supabase.from('requests').select('*').eq('poster_id', userId).order('created_at', { ascending: false }), 'requests_export'),
    expectOk(supabase.from('request_responses').select('*').eq('responder_id', userId).order('created_at', { ascending: false }), 'responses_export'),
    expectOk(supabase.from('connections').select('*').or(`requester_id.eq.${userId},responder_id.eq.${userId}`).order('created_at', { ascending: false }), 'connections_export'),
    expectOk(supabase.from('connection_reviews').select('*').or(`reviewer_id.eq.${userId},reviewee_id.eq.${userId}`).order('created_at', { ascending: false }), 'reviews_export'),
    expectOk(supabase.from('connection_payments').select('*').or(`payer_id.eq.${userId},payee_id.eq.${userId}`).order('created_at', { ascending: false }), 'payments_export'),
    expectOk(supabase.from('connection_resolution_cases').select('*').or(`opened_by.eq.${userId},against_user_id.eq.${userId}`).order('created_at', { ascending: false }), 'resolution_cases_export'),
    expectOk(supabase.from('connection_resolution_responses').select('*').eq('author_id', userId).order('created_at', { ascending: false }), 'resolution_responses_export'),
    expectOk(supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }), 'notifications_export'),
    expectOk(supabase.from('connection_circle_choices').select('*').eq('user_id', userId).order('created_at', { ascending: false }), 'circle_export'),
    expectOk(supabase.from('connection_completion_confirmations').select('*').eq('user_id', userId).order('created_at', { ascending: false }), 'completion_export'),
    expectOk(supabase.from('payment_accounts').select('provider,status,transfers_enabled,requirements_due,created_at,updated_at').eq('user_id', userId).maybeSingle(), 'payment_account_export')
  ]);

  const connectionIds = ((connections || []) as Array<{ id: string }>).map((connection) => connection.id);
  const messages = connectionIds.length
    ? await expectOk(supabase.from('connection_messages').select('*').in('connection_id', connectionIds).order('created_at', { ascending: true }), 'messages_export')
    : [];

  return {
    export_version: 1,
    generated_at: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at ?? null
    },
    profile,
    preferences,
    verification: {
      school: schoolVerification,
      identity: identityVerification
    },
    requests,
    responses_authored: responses,
    connections,
    messages,
    reviews,
    payments,
    payment_account: paymentAccount,
    resolution_cases: resolutionCases,
    resolution_responses_authored: resolutionResponses,
    notifications,
    circle_choices: circleChoices,
    completion_confirmations: completionConfirmations
  };
}

export async function getAccountDeletionBlockers(supabase: ServiceClient, userId: string): Promise<AccountDeletionBlocker[]> {
  const [activeConnections, unsettledPayments, openCases, activeMarketOrders, legacyOrders, staffProfile] = await Promise.all([
    expectOk(supabase.from('connections').select('id,status').or(`requester_id.eq.${userId},responder_id.eq.${userId}`).in('status', ['pending', 'confirmed', 'active']).limit(5), 'active_connections_check'),
    expectOk(supabase.from('connection_payments').select('id,status').or(`payer_id.eq.${userId},payee_id.eq.${userId}`).in('status', ['checkout_created', 'processing', 'secured', 'disputed']).limit(5), 'payment_check'),
    expectOk(supabase.from('connection_resolution_cases').select('id,status').or(`opened_by.eq.${userId},against_user_id.eq.${userId}`).in('status', ['submitted', 'under_review']).limit(5), 'resolution_check'),
    expectOk(supabase.from('market_orders').select('id,status').or(`buyer_id.eq.${userId},seller_id.eq.${userId}`).in('status', ['awaiting_payment', 'payment_processing', 'paid', 'handoff_confirmed', 'release_ready', 'disputed']).limit(5), 'market_order_check'),
    expectOk(supabase.from('orders').select('id,status').eq('buyer_id', userId).in('status', ['pending', 'paid']).limit(5), 'legacy_order_check'),
    expectOk(supabase.from('profiles').select('is_moderator,role').eq('id', userId).maybeSingle(), 'staff_check')
  ]);

  const blockers: AccountDeletionBlocker[] = [];
  if ((activeConnections || []).length) blockers.push({ code: 'ACTIVE_CONNECTIONS', message: 'Finish or cancel your active connections first.', href: '/connections' });
  if ((unsettledPayments || []).length) blockers.push({ code: 'UNSETTLED_PAYMENTS', message: 'A payment is still processing, secured, or disputed. Resolve it before deleting your account.', href: '/transactions' });
  if ((openCases || []).length) blockers.push({ code: 'OPEN_RESOLUTION', message: 'You have an open Resolution Center case. Close the case before deleting your account.', href: '/resolution' });
  if ((activeMarketOrders || []).length || (legacyOrders || []).length) blockers.push({ code: 'ACTIVE_ORDERS', message: 'A marketplace order is still active. Finish, cancel, or resolve it first.', href: '/transactions' });
  if (staffProfile && ((staffProfile as { is_moderator?: boolean; role?: string | null }).is_moderator || ['admin', 'moderator'].includes(String((staffProfile as { role?: string | null }).role || '').toLowerCase()))) {
    blockers.push({ code: 'STAFF_ACCOUNT', message: 'Staff accounts must be handed off before self-service deletion.' });
  }
  return blockers;
}

async function deleteWhere(supabase: ServiceClient, table: string, column: string, userId: string) {
  const { error } = await supabase.from(table).delete().eq(column, userId);
  if (error) throw new Error(`ACCOUNT_DELETE:${table}:${error.message}`);
}

export async function eraseDirectAccountData(supabase: ServiceClient, userId: string) {
  const now = new Date().toISOString();

  const { error: cancelRequestError } = await supabase
    .from('requests')
    .update({ status: 'cancelled', updated_at: now })
    .eq('poster_id', userId)
    .in('status', ['open', 'matched', 'in_progress']);
  if (cancelRequestError) throw new Error(`ACCOUNT_DELETE:requests_cancel:${cancelRequestError.message}`);

  const { error: scrubRequestError } = await supabase
    .from('requests')
    .update({
      details: null,
      city: null,
      latitude: null,
      longitude: null,
      meeting_label: null,
      cover_image_url: null,
      cover_image_asset_id: null,
      cover_image_source: 'none',
      updated_at: now
    })
    .eq('poster_id', userId);
  if (scrubRequestError) throw new Error(`ACCOUNT_DELETE:requests_scrub:${scrubRequestError.message}`);

  const { error: responseScrubError } = await supabase.from('request_responses').update({ message: null }).eq('responder_id', userId);
  if (responseScrubError) throw new Error(`ACCOUNT_DELETE:responses:${responseScrubError.message}`);

  const { error: messageScrubError } = await supabase
    .from('connection_messages')
    .update({ body: 'Message removed after account deletion.' })
    .eq('sender_id', userId);
  if (messageScrubError) throw new Error(`ACCOUNT_DELETE:messages:${messageScrubError.message}`);

  const directRows: Array<[string, string]> = [
    ['connection_live_locations', 'user_id'],
    ['user_locations', 'user_id'],
    ['request_private_locations', 'owner_id'],
    ['notifications', 'user_id'],
    ['user_preferences', 'user_id'],
    ['school_verifications', 'user_id'],
    ['identity_verifications', 'user_id'],
    ['aspire_ai_sessions', 'user_id'],
    ['avatar_moderation_reviews', 'user_id'],
    ['safety_acknowledgements', 'user_id'],
    ['user_daily_activity', 'user_id'],
    ['user_roles', 'user_id'],
    ['user_trust_profiles', 'user_id'],
    ['connection_circle_choices', 'user_id'],
    ['connection_message_reads', 'user_id'],
    ['connection_completion_confirmations', 'user_id'],
    ['payment_accounts', 'user_id']
  ];

  for (const [table, column] of directRows) await deleteWhere(supabase, table, column, userId);

  const { error: reviewDeleteError } = await supabase.from('connection_reviews').delete().or(`reviewer_id.eq.${userId},reviewee_id.eq.${userId}`);
  if (reviewDeleteError) throw new Error(`ACCOUNT_DELETE:connection_reviews:${reviewDeleteError.message}`);

  const { error: blockDeleteError } = await supabase.from('user_blocks').delete().or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
  if (blockDeleteError) throw new Error(`ACCOUNT_DELETE:user_blocks:${blockDeleteError.message}`);

  const { error: profileError } = await supabase.from('profiles').update({
    display_name: 'Deleted student',
    name: 'Deleted student',
    full_name: null,
    email: null,
    phone: null,
    email_type: null,
    username: null,
    username_norm: null,
    bio: null,
    avatar_url: null,
    image_url: null,
    city: null,
    location: null,
    school: null,
    home_campus_id: null,
    current_campus_id: null,
    campus_last_selected_at: null,
    major: null,
    graduation_year: null,
    interests: [],
    role: null,
    is_moderator: false,
    avatar_moderation_status: 'none',
    avatar_pending_path: null,
    avatar_moderation_review_id: null,
    avatar_moderation_summary: null,
    avatar_moderation_updated_at: null,
    updated_at: now
  }).eq('id', userId);
  if (profileError) throw new Error(`ACCOUNT_DELETE:profiles:${profileError.message}`);
}
