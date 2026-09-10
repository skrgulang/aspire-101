import { getSupabaseBrowserClient } from './client';
import type { AspireRequest, RequestLanguageCode } from './requests';
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

async function attachMedia(rows: Omit<DiscoverRequest, 'latitude' | 'longitude' | 'media'>[]) {
  let media: RequestMedia[] = [];
  try {
    media = await fetchRequestMedia(rows.map((row) => row.id));
  } catch {
    // Keep the feed usable if signed media URLs are temporarily unavailable.
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

function localCategory(item: Pick<DiscoverRequest, 'title' | 'category' | 'kind'>): DiscoverCategory {
  const text = `${item.category || ''} ${item.title || ''}`.toLowerCase();
  if (item.kind === 'buy_sell' || /buy|sell|market|for sale|wanted/.test(text)) return 'Buy & sell';
  if (/\bride\b|transport|airport|\bind\b|chicago|indy|carpool|driver/.test(text)) return 'Get me there';
  if (/pickup|errand|target order|package/.test(text)) return 'Pick this up';
  if (/moving|move|repair|clean|photograph|photographer|assemble|fix|carry|help/.test(text)) return 'Give me a hand';
  if (/study|class|tutor|math|calc|exam|homework|notes|course|quiz/.test(text)) return 'Study / class';
  if (/gaming|game|valorant|league|fortnite|duo|queue|cs2|playstation|xbox/.test(text)) return 'Gaming / duos';
  if (/project|collab|designer|hackathon|build|startup|code|teammate/.test(text)) return 'Build something';
  return 'People / community';
}

function matchesLocalFilters(item: DiscoverRequest, query?: string, category?: DiscoverCategory, language?: RequestLanguageCode | 'all') {
  if (category && category !== 'Anything' && localCategory(item) !== category) return false;
  if (language && language !== 'all' && (item.language_code || 'en') !== language) return false;
  const needle = query?.trim().toLowerCase();
  if (!needle) return true;
  return `${item.title} ${item.details || ''} ${item.category || ''}`.toLowerCase().includes(needle);
}

export async function fetchDiscoverRequests(input: {
  campusId: string;
  query?: string;
  category?: DiscoverCategory;
  language?: RequestLanguageCode | 'all';
  limit?: number;
}) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('discover_requests', {
    p_campus_id: input.campusId,
    p_query: input.query?.trim() || null,
    p_category: input.category || 'Anything',
    p_limit: input.limit ?? 40,
    p_language: input.language && input.language !== 'all' ? input.language : null
  });
  if (error) throw error;

  const rows = (data ?? []) as Omit<DiscoverRequest, 'latitude' | 'longitude' | 'media'>[];
  return attachMedia(rows);
}

export async function fetchCampusFeedRequests(input: {
  campusId: string;
  query?: string;
  category?: DiscoverCategory;
  language?: RequestLanguageCode | 'all';
  limit?: number;
}) {
  const supabase = getSupabaseBrowserClient();
  const limit = input.limit ?? 40;

  const [{ data: authData }, publicItems] = await Promise.all([
    supabase.auth.getUser(),
    fetchDiscoverRequests(input)
  ]);

  if (!authData.user) return publicItems;

  let ownRows: Omit<DiscoverRequest, 'latitude' | 'longitude' | 'media'>[] = [];
  try {
    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .eq('poster_id', authData.user.id)
      .eq('campus_id', input.campusId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    ownRows = ((data ?? []) as AspireRequest[])
      .filter((item) => item.moderation_status !== 'rejected' && item.moderation_status !== 'blocked')
      .map((item) => ({ ...item, campus_id: input.campusId } as Omit<DiscoverRequest, 'latitude' | 'longitude' | 'media'>));
  } catch {
    // Public discovery should still render even if the user's private rows cannot be loaded.
  }

  const ownItems = (await attachMedia(ownRows)).filter((item) => matchesLocalFilters(item, input.query, input.category, input.language));
  const merged = new Map<string, DiscoverRequest>();
  publicItems.forEach((item) => merged.set(item.id, item));
  ownItems.forEach((item) => merged.set(item.id, item));

  return Array.from(merged.values())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}
