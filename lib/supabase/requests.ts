import { getSupabaseBrowserClient } from './client';

export type RequestKind =
  | 'community'
  | 'paid_help'
  | 'split_cost'
  | 'buy_sell'
  | 'collaboration';

export type AspireRequest = {
  id: string;
  poster_id: string;
  kind: RequestKind;
  category: string;
  title: string;
  details: string | null;
  campus: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  amount_cents: number | null;
  currency: string;
  payment_method: 'aspire' | 'in_person' | 'none';
  status: 'open' | 'matched' | 'in_progress' | 'completed' | 'cancelled' | 'expired';
  created_at: string;
  updated_at: string;
};

export type CreateRequestInput = Pick<AspireRequest, 'kind' | 'category' | 'title'> & {
  details?: string;
  campus?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  amount_cents?: number;
  currency?: string;
  payment_method?: AspireRequest['payment_method'];
};

export async function fetchOpenRequests(limit = 24) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('requests')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as AspireRequest[];
}

export async function createRequest(input: CreateRequestInput) {
  const supabase = getSupabaseBrowserClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error('You must be signed in to post a request.');

  const { data: allowed, error: accessError } = await supabase.rpc('can_post_request');
  if (accessError) throw accessError;
  if (!allowed) throw new Error('Verify your school ID in Profile before posting.');

  const { data, error } = await supabase
    .from('requests')
    .insert({
      poster_id: authData.user.id,
      kind: input.kind,
      category: input.category,
      title: input.title.trim(),
      details: input.details?.trim() || null,
      campus: input.campus || null,
      city: input.city || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      amount_cents: input.amount_cents ?? null,
      currency: input.currency || 'USD',
      payment_method: input.payment_method || 'none'
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as AspireRequest;
}

export async function respondToRequest(requestId: string, message?: string) {
  const supabase = getSupabaseBrowserClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error('You must be signed in to respond.');

  const { data, error } = await supabase
    .from('request_responses')
    .insert({
      request_id: requestId,
      responder_id: authData.user.id,
      message: message?.trim() || null
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}
