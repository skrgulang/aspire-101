import type { SupabaseClient, User } from '@supabase/supabase-js';
import { stripeLivemode } from './aspireServer';

type ServiceClient = SupabaseClient;

const ACCOUNT_REQUEST_EXPORT_SELECT = 'id,poster_id,kind,category,title,details,campus,campus_id,city,scheduled_start_at,scheduled_end_at,timezone,meeting_label,amount_cents,currency,payment_method,market_intent,item_condition,price_negotiable,fulfillment_method,fulfillment_methods,shipping_paid_by_preference,shipping_paid_by_default,seller_delivery_mode,seller_delivery_price_cents,seller_area,quantity,language_code,cover_image_url,cover_image_source,cover_image_asset_id,listing_expires_at,moderation_status,moderation_reason,post_review_status,language_review_status,market_review_status,layered_reviewed_at,status,created_at,updated_at' as const;

const ACCOUNT_PROFILE_EXPORT_SELECT = 'id,display_name,school,city,image_url,location,created_at,updated_at,name,phone,email,email_type,avatar_url,username,username_norm,bio,role,full_name,is_moderator,home_campus_id,current_campus_id,campus_last_selected_at,major,graduation_year,interests' as const;
const ACCOUNT_PREFERENCE_EXPORT_SELECT = 'user_id,location_mode,profile_visibility,show_major,show_graduation_year,show_interests,show_completed,show_joined,ai_personalization,notify_messages,notify_connections,notify_post_updates,notify_payments,notify_safety,notify_marketing,created_at,updated_at' as const;
const ACCOUNT_SCHOOL_VERIFICATION_EXPORT_SELECT = 'user_id,school,student_id,status,submitted_at,updated_at,reviewed_at,review_note,university_id,verification_method,school_email,verified_at' as const;
const ACCOUNT_RESPONSE_EXPORT_SELECT = 'id,request_id,responder_id,message,status,created_at' as const;
const ACCOUNT_CONNECTION_EXPORT_SELECT = 'id,request_id,requester_id,responder_id,requester_confirmed,responder_confirmed,status,agreed_amount_cents,agreed_terms,payment_method,scheduled_start_at,scheduled_end_at,timezone,meeting_label,coordination_status,last_coordination_at,created_at,updated_at' as const;
const ACCOUNT_REVIEW_EXPORT_SELECT = 'id,connection_id,reviewer_id,reviewee_id,would_connect_again,tags,note,created_at,updated_at' as const;
const ACCOUNT_PAYMENT_EXPORT_SELECT = 'id,connection_id,request_id,payer_id,payee_id,currency,gross_amount_cents,platform_fee_cents,provider_amount_cents,status,base_amount_cents,requester_fee_cents,provider_fee_cents,tip_amount_cents,tip_fee_cents,customer_total_cents,provider_net_cents,paid_at,released_at,refunded_at,disputed_at,created_at,updated_at' as const;
const ACCOUNT_RESOLUTION_CASE_EXPORT_SELECT = 'id,connection_id,request_id,opened_by,against_user_id,reason,requested_resolution,details,status,payment_status_snapshot,payment_total_cents_snapshot,currency_snapshot,scheduled_start_snapshot,meeting_label_snapshot,coordination_status_snapshot,resolution_note,refund_cents,provider_release_cents,reviewed_at,created_at,updated_at' as const;
const ACCOUNT_RESOLUTION_RESPONSE_EXPORT_SELECT = 'id,case_id,connection_id,author_id,body,created_at' as const;
const ACCOUNT_NOTIFICATION_EXPORT_SELECT = 'id,user_id,kind,actor_id,request_id,response_id,connection_id,message_id,title,body,read_at,created_at' as const;
const ACCOUNT_CIRCLE_EXPORT_SELECT = 'connection_id,user_id,keep_in_circle,created_at,updated_at' as const;
const ACCOUNT_COMPLETION_EXPORT_SELECT = 'connection_id,user_id,confirmed_at' as const;
const ACCOUNT_MESSAGE_EXPORT_SELECT = 'id,connection_id,sender_id,body,created_at' as const;

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
  const livemode = stripeLivemode();

  const [profile, preferences, schoolVerification, identityVerification, requests, responses, connections, reviews, payments, resolutionCases, resolutionResponses, notifications, circleChoices, completionConfirmations, paymentAccount, requestMedia] = await Promise.all([
    expectOk(supabase.from('profiles').select(ACCOUNT_PROFILE_EXPORT_SELECT).eq('id', userId).maybeSingle(), 'profile_export'),
    expectOk(supabase.from('user_preferences').select(ACCOUNT_PREFERENCE_EXPORT_SELECT).eq('user_id', userId).maybeSingle(), 'preferences_export'),
    expectOk(supabase.from('school_verifications').select(ACCOUNT_SCHOOL_VERIFICATION_EXPORT_SELECT).eq('user_id', userId).maybeSingle(), 'school_export'),
    expectOk(supabase.from('identity_verifications').select('status,provider,verified_at,created_at,updated_at').eq('user_id', userId).maybeSingle(), 'identity_export'),
    expectOk(supabase.from('requests').select(ACCOUNT_REQUEST_EXPORT_SELECT).eq('poster_id', userId).order('created_at', { ascending: false }), 'requests_export'),
    expectOk(supabase.from('request_responses').select(ACCOUNT_RESPONSE_EXPORT_SELECT).eq('responder_id', userId).order('created_at', { ascending: false }), 'responses_export'),
    expectOk(supabase.from('connections').select(ACCOUNT_CONNECTION_EXPORT_SELECT).or(`requester_id.eq.${userId},responder_id.eq.${userId}`).order('created_at', { ascending: false }), 'connections_export'),
    // Review notes/tags are private to the reviewer under the product RLS policy.
    // A service-role export must not bypass that boundary just because the user is the reviewee.
    expectOk(supabase.from('connection_reviews').select(ACCOUNT_REVIEW_EXPORT_SELECT).eq('reviewer_id', userId).order('created_at', { ascending: false }), 'reviews_export'),
    expectOk(supabase.from('connection_payments').select(ACCOUNT_PAYMENT_EXPORT_SELECT).or(`payer_id.eq.${userId},payee_id.eq.${userId}`).order('created_at', { ascending: false }), 'payments_export'),
    expectOk(supabase.from('connection_resolution_cases').select(ACCOUNT_RESOLUTION_CASE_EXPORT_SELECT).or(`opened_by.eq.${userId},against_user_id.eq.${userId}`).order('created_at', { ascending: false }), 'resolution_cases_export'),
    expectOk(supabase.from('connection_resolution_responses').select(ACCOUNT_RESOLUTION_RESPONSE_EXPORT_SELECT).eq('author_id', userId).order('created_at', { ascending: false }), 'resolution_responses_export'),
    expectOk(supabase.from('notifications').select(ACCOUNT_NOTIFICATION_EXPORT_SELECT).eq('user_id', userId).order('created_at', { ascending: false }), 'notifications_export'),
    expectOk(supabase.from('connection_circle_choices').select(ACCOUNT_CIRCLE_EXPORT_SELECT).eq('user_id', userId).order('created_at', { ascending: false }), 'circle_export'),
    expectOk(supabase.from('connection_completion_confirmations').select(ACCOUNT_COMPLETION_EXPORT_SELECT).eq('user_id', userId).order('confirmed_at', { ascending: false }), 'completion_export'),
    expectOk(supabase.from('payment_accounts').select('provider,livemode,status,transfers_enabled,requirements_due,created_at,updated_at').eq('user_id', userId).eq('livemode', livemode).maybeSingle(), 'payment_account_export'),
    expectOk(supabase.from('request_media').select('id,request_id,uploader_id,mime_type,sort_order,created_at').eq('uploader_id', userId).order('created_at', { ascending: false }), 'request_media_export')
  ]);

  const connectionIds = ((connections || []) as Array<{ id: string }>).map((connection) => connection.id);
  const messages = connectionIds.length
    ? await expectOk(supabase.from('connection_messages').select(ACCOUNT_MESSAGE_EXPORT_SELECT).in('connection_id', connectionIds).order('created_at', { ascending: true }), 'messages_export')
    : [];

  return {
    export_version: 2,
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
    request_media: requestMedia,
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
  const [
    activeConnections,
    unsettledPayments,
    openCases,
    hasOpenRefundReview,
    activeMarketOrders,
    legacyOrders,
    roleRow,
    staffProfile
  ] = await Promise.all([
    expectOk(supabase.from('connections').select('id,status').or(`requester_id.eq.${userId},responder_id.eq.${userId}`).in('status', ['pending', 'confirmed', 'active']).limit(5), 'active_connections_check'),
    expectOk(supabase.from('connection_payments').select('id,status').or(`payer_id.eq.${userId},payee_id.eq.${userId}`).in('status', ['checkout_created', 'processing', 'secured', 'disputed']).limit(5), 'payment_check'),
    expectOk(supabase.from('connection_resolution_cases').select('id,status').or(`opened_by.eq.${userId},against_user_id.eq.${userId}`).in('status', ['submitted', 'under_review']).limit(5), 'resolution_check'),
    expectOk(supabase.rpc('account_has_open_refund_review', { p_user_id: userId }), 'refund_request_check'),
    expectOk(supabase.from('market_orders').select('id,status').or(`buyer_id.eq.${userId},seller_id.eq.${userId}`).in('status', ['awaiting_payment', 'payment_processing', 'paid', 'handoff_confirmed', 'release_ready', 'disputed']).limit(5), 'market_order_check'),
    expectOk(supabase.from('orders').select('id,status').eq('buyer_id', userId).in('status', ['pending', 'paid']).limit(5), 'legacy_order_check'),
    expectOk(supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle(), 'role_check'),
    expectOk(supabase.from('profiles').select('is_moderator,role').eq('id', userId).maybeSingle(), 'staff_profile_check')
  ]);

  const blockers: AccountDeletionBlocker[] = [];
  if ((activeConnections || []).length) blockers.push({ code: 'ACTIVE_CONNECTIONS', message: 'Finish or cancel your active connections first.', href: '/connections' });
  if ((unsettledPayments || []).length) blockers.push({ code: 'UNSETTLED_PAYMENTS', message: 'A payment is still processing, secured, or disputed. Resolve it before deleting your account.', href: '/transactions' });
  if ((openCases || []).length) blockers.push({ code: 'OPEN_RESOLUTION', message: 'You have an open Resolution Center case. Close the case before deleting your account.', href: '/resolution' });
  if (Boolean(hasOpenRefundReview)) blockers.push({ code: 'OPEN_REFUND_REVIEW', message: 'A payment refund review is still open for a payment you are part of. Finish that review before deleting your account.', href: '/resolution' });
  if ((activeMarketOrders || []).length || (legacyOrders || []).length) blockers.push({ code: 'ACTIVE_ORDERS', message: 'A marketplace order is still active. Finish, cancel, or resolve it first.', href: '/transactions' });

  const authoritativeRole = String((roleRow as { role?: string | null } | null)?.role || '').toLowerCase();
  const profileLooksPrivileged = Boolean(
    staffProfile
    && (
      (staffProfile as { is_moderator?: boolean }).is_moderator
      || ['admin', 'moderator'].includes(String((staffProfile as { role?: string | null }).role || '').toLowerCase())
    )
  );
  if (['admin', 'moderator'].includes(authoritativeRole) || profileLooksPrivileged) {
    blockers.push({ code: 'STAFF_ACCOUNT', message: 'Staff accounts must be handed off before self-service deletion.' });
  }
  return blockers;
}

async function deleteWhere(supabase: ServiceClient, table: string, column: string, userId: string) {
  const { error } = await supabase.from(table).delete().eq(column, userId);
  if (error) throw new Error(`ACCOUNT_DELETE:${table}:${error.message}`);
}

async function deleteOwnedStorage(supabase: ServiceClient, userId: string) {
  const { data: mediaRows, error: mediaError } = await supabase
    .from('request_media')
    .select('storage_path')
    .eq('uploader_id', userId);
  if (mediaError) throw new Error(`ACCOUNT_DELETE:request_media_list:${mediaError.message}`);

  const mediaPaths = (mediaRows || []).map((row) => String(row.storage_path || '')).filter(Boolean);
  for (let index = 0; index < mediaPaths.length; index += 100) {
    const { error } = await supabase.storage.from('request-media').remove(mediaPaths.slice(index, index + 100));
    if (error) throw new Error(`ACCOUNT_DELETE:request_media_storage:${error.message}`);
  }

  const { error: mediaRowDeleteError } = await supabase.from('request_media').delete().eq('uploader_id', userId);
  if (mediaRowDeleteError) throw new Error(`ACCOUNT_DELETE:request_media_rows:${mediaRowDeleteError.message}`);

  const { data: draftRows, error: draftError } = await supabase
    .from('marketplace_listing_drafts')
    .select('photo_storage_path')
    .eq('user_id', userId);
  if (draftError) throw new Error(`ACCOUNT_DELETE:marketplace_drafts_list:${draftError.message}`);

  const draftPaths = (draftRows || []).map((row) => String(row.photo_storage_path || '')).filter(Boolean);
  for (let index = 0; index < draftPaths.length; index += 100) {
    const { error } = await supabase.storage.from('marketplace-drafts').remove(draftPaths.slice(index, index + 100));
    if (error) throw new Error(`ACCOUNT_DELETE:marketplace_drafts_storage:${error.message}`);
  }
  const { error: draftDeleteError } = await supabase.from('marketplace_listing_drafts').delete().eq('user_id', userId);
  if (draftDeleteError) throw new Error(`ACCOUNT_DELETE:marketplace_drafts_rows:${draftDeleteError.message}`);

  const { data: avatarFiles, error: avatarListError } = await supabase.storage.from('avatars').list(userId, { limit: 1000 });
  if (avatarListError) throw new Error(`ACCOUNT_DELETE:avatar_list:${avatarListError.message}`);
  const avatarPaths = (avatarFiles || []).filter((file) => file.name).map((file) => `${userId}/${file.name}`);
  if (avatarPaths.length) {
    const { error: avatarRemoveError } = await supabase.storage.from('avatars').remove(avatarPaths);
    if (avatarRemoveError) throw new Error(`ACCOUNT_DELETE:avatar_storage:${avatarRemoveError.message}`);
  }
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

  await deleteOwnedStorage(supabase, userId);

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
    ['saved_requests', 'user_id'],
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