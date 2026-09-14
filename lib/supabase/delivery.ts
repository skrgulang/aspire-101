import { getSupabaseBrowserClient } from './client';
import { createRequest } from './requests';
import type { DeliveryRewardMode } from './marketplacePurchase';

export type DeliveryStatus =
  | 'looking_for_aspirer'
  | 'offer_received'
  | 'matched'
  | 'heading_to_pickup'
  | 'picked_up'
  | 'on_the_way'
  | 'delivered'
  | 'completed'
  | 'cancelled';

export type DeliveryJob = {
  id: string;
  request_id: string;
  market_order_id: string | null;
  requester_id: string;
  pickup_party_id: string | null;
  dropoff_party_id: string | null;
  matched_aspirer_id: string | null;
  connection_id: string | null;
  campus_id: string;
  pickup_area: string;
  dropoff_area: string;
  approx_distance_miles: number | null;
  preferred_at: string | null;
  reward_mode: DeliveryRewardMode;
  reward_cents: number | null;
  agreed_reward_cents: number | null;
  status: DeliveryStatus;
  picked_up_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DeliveryOffer = {
  id: string;
  delivery_job_id: string;
  aspirer_id: string;
  amount_cents: number;
  message: string | null;
  status: 'pending' | 'countered' | 'accepted' | 'declined' | 'withdrawn';
  last_actor_id: string;
  created_at: string;
  updated_at: string;
};

export type DeliveryRequestSummary = {
  id: string;
  title: string;
  details: string | null;
  status: string;
  moderation_status: string;
  amount_cents: number | null;
  currency: string;
  poster_id: string;
  category: string;
};

export type DeliveryProfile = {
  id: string;
  display_name: string | null;
  full_name: string | null;
  name: string | null;
  avatar_url: string | null;
};

export type DeliveryBoardData = {
  jobs: DeliveryJob[];
  requests: Map<string, DeliveryRequestSummary>;
  offers: DeliveryOffer[];
  profiles: Map<string, DeliveryProfile>;
};

export type CreateStandaloneDeliveryInput = {
  campusId: string;
  title: string;
  details?: string;
  pickupArea: string;
  dropoffArea: string;
  pickupInstructions?: string;
  dropoffInstructions?: string;
  preferredAt?: string | null;
  rewardMode: DeliveryRewardMode;
  rewardCents?: number | null;
  approxDistanceMiles?: number | null;
};

export function deliveryStatusLabel(status: DeliveryStatus) {
  switch (status) {
    case 'looking_for_aspirer': return 'Looking for Aspirer';
    case 'offer_received': return 'Offer received';
    case 'matched': return 'Matched';
    case 'heading_to_pickup': return 'Heading to pickup';
    case 'picked_up': return 'Picked up';
    case 'on_the_way': return 'On the way';
    case 'delivered': return 'Delivered';
    case 'completed': return 'Completed';
    case 'cancelled': return 'Cancelled';
  }
}

export function rewardLabel(mode: DeliveryRewardMode, cents?: number | null) {
  if (mode === 'free') return 'Free / Volunteer';
  if (mode === 'negotiable') return 'Negotiable';
  return `$${((cents || 0) / 100).toFixed(2)}`;
}

export async function fetchDeliveryBoard(campusId: string): Promise<DeliveryBoardData> {
  const supabase = getSupabaseBrowserClient();
  const { data: jobsData, error: jobsError } = await supabase
    .from('delivery_jobs')
    .select('*')
    .eq('campus_id', campusId)
    .order('created_at', { ascending: false })
    .limit(80);
  if (jobsError) throw jobsError;
  const jobs = (jobsData ?? []) as DeliveryJob[];

  const requestIds = [...new Set(jobs.map((job) => job.request_id))];
  const jobIds = jobs.map((job) => job.id);
  const [{ data: requestsData, error: requestsError }, { data: offersData, error: offersError }] = await Promise.all([
    requestIds.length
      ? supabase.from('requests').select('id,title,details,status,moderation_status,amount_cents,currency,poster_id,category').in('id', requestIds)
      : Promise.resolve({ data: [], error: null }),
    jobIds.length
      ? supabase.from('delivery_offers').select('*').in('delivery_job_id', jobIds).order('updated_at', { ascending: false })
      : Promise.resolve({ data: [], error: null })
  ]);
  if (requestsError) throw requestsError;
  if (offersError) throw offersError;

  const offers = (offersData ?? []) as DeliveryOffer[];
  const userIds = [...new Set([
    ...offers.map((offer) => offer.aspirer_id),
    ...jobs.map((job) => job.matched_aspirer_id).filter(Boolean) as string[]
  ])];
  const { data: profileData, error: profileError } = userIds.length
    ? await supabase.from('profiles').select('id,display_name,full_name,name,avatar_url').in('id', userIds)
    : { data: [], error: null };
  if (profileError) throw profileError;

  return {
    jobs,
    requests: new Map(((requestsData ?? []) as DeliveryRequestSummary[]).map((request) => [request.id, request])),
    offers,
    profiles: new Map(((profileData ?? []) as DeliveryProfile[]).map((profile) => [profile.id, profile]))
  };
}

export async function createStandaloneDelivery(input: CreateStandaloneDeliveryInput) {
  const fixedReward = input.rewardMode === 'fixed' ? Math.max(0, Math.round(input.rewardCents || 0)) : null;
  if (input.rewardMode === 'fixed' && (!fixedReward || fixedReward <= 0)) {
    throw new Error('Choose a paid reward greater than $0.');
  }

  const request = await createRequest({
    kind: input.rewardMode === 'fixed' ? 'paid_help' : 'community',
    category: 'Delivery / Errand',
    title: input.title,
    details: input.details || `${input.pickupArea} → ${input.dropoffArea}`,
    campusId: input.campusId,
    amount_cents: fixedReward || undefined,
    currency: 'USD'
  });

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('create_delivery_job_for_request', {
    p_request_id: request.id,
    p_pickup_area: input.pickupArea,
    p_dropoff_area: input.dropoffArea,
    p_preferred_at: input.preferredAt || null,
    p_reward_mode: input.rewardMode,
    p_reward_cents: fixedReward,
    p_pickup_instructions: input.pickupInstructions || null,
    p_dropoff_instructions: input.dropoffInstructions || null,
    p_approx_distance_miles: input.approxDistanceMiles ?? null
  });
  if (error) throw error;
  return data as DeliveryJob;
}

export async function makeDeliveryOffer(deliveryJobId: string, amountCents: number, message?: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('delivery_make_offer', {
    p_delivery_job_id: deliveryJobId,
    p_amount_cents: Math.max(0, Math.round(amountCents)),
    p_message: message?.trim() || null
  });
  if (error) throw error;
  return data as DeliveryOffer;
}

export async function counterDeliveryOffer(offerId: string, amountCents: number) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('delivery_counter_offer', {
    p_offer_id: offerId,
    p_amount_cents: Math.max(0, Math.round(amountCents))
  });
  if (error) throw error;
  return data as DeliveryOffer;
}

export async function acceptDeliveryOffer(offerId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('delivery_accept_offer', { p_offer_id: offerId });
  if (error) throw error;
  return data as DeliveryJob;
}

export async function setDeliveryStatus(deliveryJobId: string, nextStatus: 'heading_to_pickup' | 'on_the_way') {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('delivery_set_status', {
    p_delivery_job_id: deliveryJobId,
    p_next_status: nextStatus
  });
  if (error) throw error;
  return data as DeliveryJob;
}

export async function getDeliveryConfirmationCode(deliveryJobId: string, kind: 'pickup' | 'delivery') {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('delivery_get_confirmation_code', {
    p_delivery_job_id: deliveryJobId,
    p_kind: kind
  });
  if (error) throw error;
  return String(data || '');
}

export async function verifyDeliveryConfirmationCode(deliveryJobId: string, kind: 'pickup' | 'delivery', code: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('delivery_verify_confirmation_code', {
    p_delivery_job_id: deliveryJobId,
    p_kind: kind,
    p_code: code
  });
  if (error) throw error;
  return data as { ok: boolean; status?: DeliveryStatus; error?: string; attempts_remaining?: number };
}

export async function completeDelivery(deliveryJobId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('delivery_complete', { p_delivery_job_id: deliveryJobId });
  if (error) throw error;
  return data as DeliveryJob;
}

export async function getPrivateDeliveryLocations(deliveryJobId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('delivery_get_private_locations', { p_delivery_job_id: deliveryJobId });
  if (error) throw error;
  return data as { pickup_instructions: string | null; dropoff_instructions: string | null };
}

export async function setPrivateDeliveryLocations(deliveryJobId: string, pickupInstructions?: string, dropoffInstructions?: string) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc('delivery_set_private_locations', {
    p_delivery_job_id: deliveryJobId,
    p_pickup_instructions: pickupInstructions?.trim() || null,
    p_dropoff_instructions: dropoffInstructions?.trim() || null
  });
  if (error) throw error;
}
