import { getSupabaseBrowserClient } from './client';
import type { AspireRequest } from './requests';

export type DiscoverCategory =
  | 'Anything'
  | 'Get me there'
  | 'Pick this up'
  | 'Give me a hand'
  | 'Study / class'
  | 'Gaming / duos'
  | 'Build something'
  | 'People / community'
  | 'Buy & sell';

export type DiscoverRequest = Omit<AspireRequest, 'latitude' | 'longitude'> & {
  campus_id: string;
  latitude: null;
  longitude: null;
};

export async function fetchDiscoverRequests(input: {
  campusId: string;
  query?: string;
  category?: DiscoverCategory;
  limit?: number;
}) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('discover_requests', {
    p_campus_id: input.campusId,
    p_query: input.query?.trim() || null,
    p_category: input.category || 'Anything',
    p_limit: input.limit ?? 40
  });

  if (error) throw error;

  return (data ?? []).map((row: Omit<DiscoverRequest, 'latitude' | 'longitude'>) => ({
    ...row,
    latitude: null,
    longitude: null
  })) as DiscoverRequest[];
}
