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

type DiscoverPriceFilter = 'any' | 'free' | 'paid';

const discoverLanguageKey = 'aspire:discover-language';
const discoverKeywordKey = 'aspire:discover-keywords';
const discoverPriceKey = 'aspire:discover-price';
const discoverPhotoOnlyKey = 'aspire:discover-photo-only';
const supportedLanguages = new Set<RequestLanguageCode>(['en','zh','es','ko','ja','fr','hi','ar','vi','other']);
const seededCorecImage = '/seeded/corec.webp?v=5';
const seededGamingImage = '/seeded/gaming.webp?v=5';

const smartSearchAliases: Record<string, string[]> = {
  airport: ['airport', 'ind', 'flight', 'terminal'],
  ind: ['airport', 'ind', 'flight', 'terminal'],
  ride: ['ride', 'rideshare', 'carpool', 'driver', 'transport'],
  rides: ['ride', 'rideshare', 'carpool', 'driver', 'transport'],
  study: ['study', 'tutor', 'class', 'homework', 'exam', 'quiz', 'course'],
  tutor: ['study', 'tutor', 'class', 'homework', 'exam', 'quiz', 'course'],
  gaming: ['gaming', 'game', 'valorant', 'league', 'fortnite', 'duo', 'cs2', 'overwatch', 'minecraft'],
  game: ['gaming', 'game', 'valorant', 'league', 'fortnite', 'duo', 'cs2', 'overwatch', 'minecraft'],
  moving: ['moving', 'move', 'carry', 'furniture', 'desk', 'chair'],
  move: ['moving', 'move', 'carry', 'furniture', 'desk', 'chair'],
  photographer: ['photographer', 'photography', 'photo', 'camera'],
  photography: ['photographer', 'photography', 'photo', 'camera'],
  project: ['project', 'collab', 'hackathon', 'startup', 'developer', 'designer', 'build'],
  projects: ['project', 'collab', 'hackathon', 'startup', 'developer', 'designer', 'build']
};

function resolveLanguageFilter(value?: RequestLanguageCode | 'all'): RequestLanguageCode | 'all' {
  if (value) return value;
  if (typeof window === 'undefined') return 'all';
  const stored = window.localStorage.getItem(discoverLanguageKey);
  if (!stored || stored === 'all') return 'all';
  return supportedLanguages.has(stored as RequestLanguageCode) ? stored as RequestLanguageCode : 'all';
}

function resolveKeywordFilters() {
  if (typeof window === 'undefined') return [] as string[];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(discoverKeywordKey) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim())
      .slice(0, 8);
  } catch {
    return [];
  }
}

function resolvePriceFilter(): DiscoverPriceFilter {
  if (typeof window === 'undefined') return 'any';
  const stored = window.localStorage.getItem(discoverPriceKey);
  return stored === 'free' || stored === 'paid' ? stored : 'any';
}

function resolvePhotoOnlyFilter() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(discoverPhotoOnlyKey) === '1';
}

function seededMedia(row: Pick<DiscoverRequest, 'id' | 'title' | 'poster_id' | 'created_at'>): RequestMedia[] {
  const normalized = row.title.trim().toLowerCase();
  const image = normalized === 'anyone want to go to corec together?'
    ? seededCorecImage
    : normalized === 'anyone want to game tonight?'
      ? seededGamingImage
      : null;
  if (!image) return [];
  return [{
    id: `seeded-${row.id}`,
    request_id: row.id,
    uploader_id: row.poster_id,
    storage_path: `seeded/${row.id}.webp`,
    mime_type: 'image/webp',
    sort_order: 0,
    created_at: row.created_at,
    public_url: image
  }];
}

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
    media: byRequest.get(row.id)?.length ? byRequest.get(row.id)! : seededMedia(row as DiscoverRequest)
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

function searchableText(item: Pick<DiscoverRequest, 'title' | 'details' | 'category' | 'kind'>) {
  return `${item.title || ''} ${item.details || ''} ${item.category || ''} ${item.kind || ''}`.toLowerCase();
}

function queryNeedles(query?: string) {
  const normalized = query?.trim().toLowerCase();
  if (!normalized) return [];
  return smartSearchAliases[normalized] ?? [normalized];
}

function smartServerQuery(query?: string) {
  const normalized = query?.trim().toLowerCase();
  if (!normalized) return null;
  const aliases = smartSearchAliases[normalized];
  if (!aliases) return query!.trim();
  return aliases.join(' OR ');
}

function matchesQuery(item: DiscoverRequest, query?: string) {
  const needles = queryNeedles(query);
  if (!needles.length) return true;
  const text = searchableText(item);
  return needles.some((needle) => text.includes(needle));
}

function matchesSmartKeyword(item: DiscoverRequest, keyword: string) {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return true;

  if (normalized === 'free') {
    return item.amount_cents == null || item.amount_cents === 0 || item.kind === 'community' || item.kind === 'collaboration';
  }
  if (normalized === 'paid') {
    return typeof item.amount_cents === 'number' && item.amount_cents > 0;
  }
  if (normalized === 'buildpurdue') {
    return /buildpurdue|nightshift/.test(searchableText(item));
  }
  if (normalized === 'math 55') {
    return /math\s*55/.test(searchableText(item));
  }
  if (normalized === 'valorant') {
    return /valorant/.test(searchableText(item));
  }

  const aliases = smartSearchAliases[normalized] ?? [normalized];
  const text = searchableText(item);
  return aliases.some((alias) => text.includes(alias));
}

function matchesSmartKeywordFilters(item: DiscoverRequest, keywords: string[]) {
  if (!keywords.length) return true;
  return keywords.every((keyword) => matchesSmartKeyword(item, keyword));
}

function matchesPriceFilter(item: DiscoverRequest, price: DiscoverPriceFilter) {
  if (price === 'any') return true;
  const paid = typeof item.amount_cents === 'number' && item.amount_cents > 0;
  return price === 'paid' ? paid : !paid;
}

function matchesPhotoFilter(item: DiscoverRequest, photoOnly: boolean) {
  return !photoOnly || item.media.length > 0;
}

function matchesLocalFilters(item: DiscoverRequest, query?: string, category?: DiscoverCategory, language?: RequestLanguageCode | 'all') {
  if (category && category !== 'Anything' && localCategory(item) !== category) return false;
  if (language && language !== 'all' && (item.language_code || 'en') !== language) return false;
  return matchesQuery(item, query);
}

export async function fetchDiscoverRequests(input: {
  campusId: string;
  query?: string;
  category?: DiscoverCategory;
  language?: RequestLanguageCode | 'all';
  limit?: number;
}) {
  const supabase = getSupabaseBrowserClient();
  const language = resolveLanguageFilter(input.language);
  const { data, error } = await supabase.rpc('discover_requests', {
    p_campus_id: input.campusId,
    p_query: smartServerQuery(input.query),
    p_category: input.category || 'Anything',
    p_limit: input.limit ?? 40,
    p_language: language !== 'all' ? language : null
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
  const language = resolveLanguageFilter(input.language);
  const keywords = resolveKeywordFilters();
  const price = resolvePriceFilter();
  const photoOnly = resolvePhotoOnlyFilter();
  const extraFiltersActive = keywords.length > 0 || price !== 'any' || photoOnly;
  const publicFetchLimit = extraFiltersActive ? Math.max(limit, 80) : limit;

  const [{ data: authData }, publicItems] = await Promise.all([
    supabase.auth.getUser(),
    fetchDiscoverRequests({ ...input, limit: publicFetchLimit, language })
  ]);

  const applySmartFilters = (item: DiscoverRequest) =>
    matchesSmartKeywordFilters(item, keywords)
    && matchesPriceFilter(item, price)
    && matchesPhotoFilter(item, photoOnly);

  if (!authData.user) {
    return publicItems
      .filter(applySmartFilters)
      .slice(0, limit);
  }

  let ownRows: Omit<DiscoverRequest, 'latitude' | 'longitude' | 'media'>[] = [];
  try {
    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .eq('poster_id', authData.user.id)
      .eq('campus_id', input.campusId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(publicFetchLimit);
    if (error) throw error;
    ownRows = ((data ?? []) as AspireRequest[])
      .filter((item) => item.moderation_status !== 'rejected' && item.moderation_status !== 'blocked')
      .map((item) => ({ ...item, campus_id: input.campusId } as Omit<DiscoverRequest, 'latitude' | 'longitude' | 'media'>));
  } catch {
    // Public discovery should still render even if the user's private rows cannot be loaded.
  }

  const ownItems = (await attachMedia(ownRows)).filter((item) => matchesLocalFilters(item, input.query, input.category, language));
  const merged = new Map<string, DiscoverRequest>();
  publicItems.forEach((item) => merged.set(item.id, item));
  ownItems.forEach((item) => merged.set(item.id, item));

  return Array.from(merged.values())
    .filter(applySmartFilters)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}
