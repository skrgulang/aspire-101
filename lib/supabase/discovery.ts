import { getSupabaseBrowserClient } from './client';
import type { AspireRequest } from './requests';
import { fetchRequestMedia, RequestMedia } from './requestMedia';

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
  media: RequestMedia[];
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

  const rows = (data ?? []) as Omit<DiscoverRequest, 'latitude' | 'longitude' | 'media'>[];
  let media: RequestMedia[] = [];
  try {
    media = await fetchRequestMedia(rows.map((row) => row.id));
  } catch {
    // The feed must remain usable if media is temporarily unavailable.
  }
  const byRequest = new Map<string, RequestMedia[]>();
  media.forEach((item) => {
    const list = byRequest.get(item.request_id) ?? [];
    list.push(item);
    byRequest.set(item.request_id, list);
  });

  return rows.map((row) => ({
    ...row,
    latitude: null,
    longitude: null,
    media: byRequest.get(row.id) ?? []
  })) as DiscoverRequest[];
}
