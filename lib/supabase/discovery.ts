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
type DiscoverTimeFilter = 'any' | 'today' | 'tonight' | 'tomorrow' | 'week';
type DiscoverSortMode = 'best' | 'soonest' | 'newest' | 'highest';

type ParsedNaturalQuery = {
  raw: string;
  groups: string[][];
  time: DiscoverTimeFilter;
  priceIntent: DiscoverPriceFilter;
  minCents: number | null;
  maxCents: number | null;
};

const discoverLanguageKey = 'aspire:discover-language';
const discoverKeywordKey = 'aspire:discover-keywords';
const discoverPriceKey = 'aspire:discover-price';
const discoverPhotoOnlyKey = 'aspire:discover-photo-only';
const discoverTimeKey = 'aspire:discover-time';
const discoverSortKey = 'aspire:discover-sort';
const supportedLanguages = new Set<RequestLanguageCode>(['en','zh','es','ko','ja','fr','hi','ar','vi','other']);
const seededCorecImage = '/seeded/corec.webp?v=5';
const seededGamingImage = '/seeded/gaming.webp?v=5';

const smartSearchAliases: Record<string, string[]> = {
  airport: ['airport', 'ind', 'flight', 'terminal'],
  ind: ['airport', 'ind', 'flight', 'terminal'],
  ride: ['ride', 'rideshare', 'carpool', 'driver', 'transport'],
  rides: ['ride', 'rideshare', 'carpool', 'driver', 'transport'],
  pickup: ['pickup', 'pick up', 'errand', 'package', 'order'],
  study: ['study', 'tutor', 'class', 'homework', 'exam', 'quiz', 'course'],
  tutor: ['study', 'tutor', 'class', 'homework', 'exam', 'quiz', 'course'],
  gaming: ['gaming', 'game', 'valorant', 'league', 'fortnite', 'duo', 'cs2', 'overwatch', 'minecraft'],
  game: ['gaming', 'game', 'valorant', 'league', 'fortnite', 'duo', 'cs2', 'overwatch', 'minecraft'],
  moving: ['moving', 'move', 'carry', 'furniture', 'desk', 'chair'],
  move: ['moving', 'move', 'carry', 'furniture', 'desk', 'chair'],
  photographer: ['photographer', 'photography', 'photo', 'camera'],
  photography: ['photographer', 'photography', 'photo', 'camera'],
  project: ['project', 'collab', 'hackathon', 'startup', 'developer', 'designer', 'build'],
  projects: ['project', 'collab', 'hackathon', 'startup', 'developer', 'designer', 'build'],
  roommate: ['roommate', 'room mate', 'housing', 'apartment'],
  food: ['food', 'meal', 'dinner', 'lunch', 'restaurant']
};

const fillerWords = new Set([
  'a','an','the','to','for','at','around','near','nearby','on','in','of','with','from','and','or',
  'i','im','i’m','need','needs','needed','looking','look','want','wanted','someone','somebody','anyone',
  'please','help','me','my','our','who','can','could','would','is','are','be','get','find'
]);

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

function resolveTimeFilter(): DiscoverTimeFilter {
  if (typeof window === 'undefined') return 'any';
  const stored = window.localStorage.getItem(discoverTimeKey);
  return stored === 'today' || stored === 'tonight' || stored === 'tomorrow' || stored === 'week' ? stored : 'any';
}

function resolveSortMode(): DiscoverSortMode {
  if (typeof window === 'undefined') return 'best';
  const stored = window.localStorage.getItem(discoverSortKey);
  return stored === 'soonest' || stored === 'newest' || stored === 'highest' ? stored : 'best';
}

function currencyToCents(value: string | undefined) {
  if (!value) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

function parseNaturalQuery(query?: string): ParsedNaturalQuery {
  const raw = query?.trim().toLowerCase() || '';
  let working = raw;
  let time: DiscoverTimeFilter = 'any';
  let priceIntent: DiscoverPriceFilter = 'any';
  let minCents: number | null = null;
  let maxCents: number | null = null;

  if (/\btonight\b/.test(working)) time = 'tonight';
  else if (/\btomorrow\b/.test(working)) time = 'tomorrow';
  else if (/\btoday\b/.test(working)) time = 'today';
  else if (/\bthis\s+week\b|\bnext\s+7\s+days\b/.test(working)) time = 'week';

  working = working
    .replace(/\bthis\s+week\b|\bnext\s+7\s+days\b/gi, ' ')
    .replace(/\btonight\b|\btomorrow\b|\btoday\b/gi, ' ');

  const maxMatch = working.match(/(?:\bunder\b|\bbelow\b|\bless\s+than\b|\bup\s+to\b|\bmax(?:imum)?(?:\s+of)?\b|<=|<)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i);
  if (maxMatch) {
    maxCents = currencyToCents(maxMatch[1]);
    working = working.replace(maxMatch[0], ' ');
  }

  const minMatch = working.match(/(?:\bover\b|\babove\b|\bmore\s+than\b|\bat\s+least\b|\bmin(?:imum)?(?:\s+of)?\b|>=|>)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i);
  if (minMatch) {
    minCents = currencyToCents(minMatch[1]);
    working = working.replace(minMatch[0], ' ');
  }

  if (/\bfree\b/.test(working)) {
    priceIntent = 'free';
    working = working.replace(/\bfree\b/g, ' ');
  } else if (/\bpaid\b/.test(working)) {
    priceIntent = 'paid';
    working = working.replace(/\bpaid\b/g, ' ');
  }

  const courseRegex = /\b(?:math|cs|ece|econ|stat|data|chem|bio|phys|ma|engl|mgmt|cgt)\s*\d{2,3}[a-z]?\b/gi;
  const courses = (working.match(courseRegex) || []).map((item) => item.replace(/\s+/g, ' ').trim());
  working = working.replace(courseRegex, ' ');

  const words = working
    .replace(/[.,!?;:()[\]{}"']/g, ' ')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !fillerWords.has(item));

  const terms = [...courses, ...words].filter((item, index, all) => all.indexOf(item) === index);
  const groups = terms.map((term) => smartSearchAliases[term] ?? [term]);

  return { raw, groups, time, priceIntent, minCents, maxCents };
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

async function enrichSchedule<T extends { id: string }>(rows: T[]): Promise<T[]> {
  if (!rows.length) return rows;
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('requests')
      .select('id,scheduled_start_at,scheduled_end_at,timezone,meeting_label')
      .in('id', rows.map((row) => row.id));
    if (error) throw error;

    const byId = new Map((data ?? []).map((item) => [item.id, item]));
    return rows.map((row) => ({ ...row, ...(byId.get(row.id) || {}) }));
  } catch {
    // The scheduling migration may not exist in every preview database yet.
    return rows;
  }
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

function smartServerQuery(query?: string) {
  const parsed = parseNaturalQuery(query);
  if (!parsed.groups.length) return null;
  return Array.from(new Set(parsed.groups.flat())).join(' OR ');
}

function matchesQuery(item: DiscoverRequest, query?: string) {
  const parsed = parseNaturalQuery(query);
  if (!parsed.groups.length) return true;
  const text = searchableText(item);
  return parsed.groups.every((group) => group.some((needle) => text.includes(needle)));
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

function matchesNaturalPrice(item: DiscoverRequest, parsed: ParsedNaturalQuery) {
  const cents = typeof item.amount_cents === 'number' ? item.amount_cents : 0;
  if (parsed.priceIntent === 'free' && cents > 0) return false;
  if (parsed.priceIntent === 'paid' && cents <= 0) return false;
  if (parsed.minCents != null && cents < parsed.minCents) return false;
  if (parsed.maxCents != null && cents > parsed.maxCents) return false;
  return true;
}

function matchesPhotoFilter(item: DiscoverRequest, photoOnly: boolean) {
  return !photoOnly || item.media.length > 0;
}

function sameLocalDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function matchesTimeFilter(item: DiscoverRequest, filter: DiscoverTimeFilter, now = new Date()) {
  if (filter === 'any') return true;
  if (!item.scheduled_start_at) return false;
  const start = new Date(item.scheduled_start_at);
  if (Number.isNaN(start.getTime())) return false;

  if (filter === 'today') return sameLocalDay(start, now) && start.getTime() >= now.getTime();
  if (filter === 'tonight') return sameLocalDay(start, now) && start.getHours() >= 17 && start.getTime() >= now.getTime();
  if (filter === 'tomorrow') {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    return sameLocalDay(start, tomorrow);
  }
  return start.getTime() >= now.getTime() && start.getTime() <= now.getTime() + 7 * 24 * 60 * 60 * 1000;
}

function relevanceScore(item: DiscoverRequest, query: string | undefined, keywords: string[]) {
  const parsed = parseNaturalQuery(query);
  const title = (item.title || '').toLowerCase();
  const details = (item.details || '').toLowerCase();
  const category = `${item.category || ''} ${item.kind || ''}`.toLowerCase();
  let score = 0;

  parsed.groups.forEach((group) => {
    if (group.some((term) => title.includes(term))) score += 12;
    else if (group.some((term) => category.includes(term))) score += 6;
    else if (group.some((term) => details.includes(term))) score += 3;
  });

  keywords.forEach((keyword) => {
    const normalized = keyword.toLowerCase();
    const aliases = smartSearchAliases[normalized] ?? [normalized];
    if (aliases.some((term) => title.includes(term))) score += 5;
    else if (aliases.some((term) => details.includes(term) || category.includes(term))) score += 2;
  });

  if (item.scheduled_start_at) {
    const start = new Date(item.scheduled_start_at).getTime();
    const delta = start - Date.now();
    if (delta >= 0 && delta <= 24 * 60 * 60 * 1000) score += 1.5;
    else if (delta > 0 && delta <= 7 * 24 * 60 * 60 * 1000) score += 0.75;
  }
  if (item.media.length) score += 0.25;
  return score;
}

function sortDiscoverItems(items: DiscoverRequest[], mode: DiscoverSortMode, query: string | undefined, keywords: string[]) {
  const created = (item: DiscoverRequest) => new Date(item.created_at).getTime();
  const scheduled = (item: DiscoverRequest) => {
    if (!item.scheduled_start_at) return Number.POSITIVE_INFINITY;
    const value = new Date(item.scheduled_start_at).getTime();
    return Number.isFinite(value) && value >= Date.now() ? value : Number.POSITIVE_INFINITY;
  };

  return [...items].sort((a, b) => {
    if (mode === 'soonest') {
      const difference = scheduled(a) - scheduled(b);
      if (Number.isFinite(difference) && difference !== 0) return difference;
      if (scheduled(a) !== scheduled(b)) return scheduled(a) < scheduled(b) ? -1 : 1;
      return created(b) - created(a);
    }
    if (mode === 'highest') {
      const payDifference = (b.amount_cents ?? 0) - (a.amount_cents ?? 0);
      return payDifference || created(b) - created(a);
    }
    if (mode === 'newest') return created(b) - created(a);

    const scoreDifference = relevanceScore(b, query, keywords) - relevanceScore(a, query, keywords);
    return scoreDifference || created(b) - created(a);
  });
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
  const time = resolveTimeFilter();
  const sort = resolveSortMode();
  const natural = parseNaturalQuery(input.query);
  const scheduleNeeded = time !== 'any' || natural.time !== 'any' || sort === 'soonest';
  const extraFiltersActive = keywords.length > 0 || price !== 'any' || photoOnly || time !== 'any' || natural.priceIntent !== 'any' || natural.minCents != null || natural.maxCents != null || sort !== 'newest';
  const publicFetchLimit = extraFiltersActive ? Math.max(limit, 80) : limit;

  const [{ data: authData }, rawPublicItems] = await Promise.all([
    supabase.auth.getUser(),
    fetchDiscoverRequests({ ...input, limit: publicFetchLimit, language })
  ]);
  const publicItems = scheduleNeeded ? await enrichSchedule(rawPublicItems) : rawPublicItems;

  const applySmartFilters = (item: DiscoverRequest) =>
    matchesQuery(item, input.query)
    && matchesSmartKeywordFilters(item, keywords)
    && matchesPriceFilter(item, price)
    && matchesNaturalPrice(item, natural)
    && matchesPhotoFilter(item, photoOnly)
    && matchesTimeFilter(item, time)
    && matchesTimeFilter(item, natural.time);

  if (!authData.user) {
    return sortDiscoverItems(publicItems.filter(applySmartFilters), sort, input.query, keywords).slice(0, limit);
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

  return sortDiscoverItems(
    Array.from(merged.values()).filter(applySmartFilters),
    sort,
    input.query,
    keywords
  ).slice(0, limit);
}
