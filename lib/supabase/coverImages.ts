import { getSupabaseBrowserClient } from './client';

export type CampusCoverImage = {
  id: string;
  campus_id: string | null;
  category_key: string | null;
  image_url: string;
  title: string | null;
  alt_text: string | null;
  source: 'curated' | 'campus_default' | 'global_default';
  priority: number;
  active: boolean;
};

export type RequestCoverSource = 'none' | 'user' | 'system_recommended' | 'campus_default' | 'global_default';

export type StoredPostCoverPreference =
  | { mode: 'auto'; campus_id: string }
  | { mode: 'none'; campus_id: string }
  | {
      mode: 'asset';
      campus_id: string;
      asset_id: string;
      image_url: string;
      source: RequestCoverSource;
      title?: string | null;
    };

const postCoverPreferenceKey = 'aspire:post-cover-choice';
const postCoverPreferenceEvent = 'aspire:post-cover-choice-changed';

function scoreCover(item: CampusCoverImage, campusId: string, category: string) {
  let score = item.priority || 0;
  if (item.campus_id === campusId) score += 1000;
  if (item.category_key === category) score += 500;
  if (item.category_key == null) score += 100;
  return score;
}

export function coverSourceForAsset(asset: CampusCoverImage): RequestCoverSource {
  if (asset.category_key) return 'system_recommended';
  if (asset.campus_id) return 'campus_default';
  return 'global_default';
}

export function readPostCoverPreference(campusId: string) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(postCoverPreferenceKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPostCoverPreference;
    if (!parsed || parsed.campus_id !== campusId) return null;
    if (parsed.mode === 'auto' || parsed.mode === 'none') return parsed;
    if (parsed.mode === 'asset' && parsed.asset_id && parsed.image_url) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function savePostCoverPreference(preference: StoredPostCoverPreference) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(postCoverPreferenceKey, JSON.stringify(preference));
  window.dispatchEvent(new Event(postCoverPreferenceEvent));
}

export function clearPostCoverPreference() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(postCoverPreferenceKey);
  window.dispatchEvent(new Event(postCoverPreferenceEvent));
}

export function postCoverChoiceEventName() {
  return postCoverPreferenceEvent;
}

export async function fetchRecommendedCovers(campusId: string, category?: string | null, limit = 6) {
  const supabase = getSupabaseBrowserClient();
  const [{ data: campusRows, error: campusError }, { data: globalRows, error: globalError }] = await Promise.all([
    supabase
      .from('campus_cover_images')
      .select('id,campus_id,category_key,image_url,title,alt_text,source,priority,active')
      .eq('active', true)
      .eq('campus_id', campusId),
    supabase
      .from('campus_cover_images')
      .select('id,campus_id,category_key,image_url,title,alt_text,source,priority,active')
      .eq('active', true)
      .is('campus_id', null)
  ]);

  if (campusError) throw campusError;
  if (globalError) throw globalError;

  const rows = [...(campusRows ?? []), ...(globalRows ?? [])] as CampusCoverImage[];
  return rows
    .filter((item) => !category || item.category_key == null || item.category_key === category)
    .sort((a, b) => scoreCover(b, campusId, category || '') - scoreCover(a, campusId, category || ''))
    .slice(0, Math.max(1, Math.min(limit, 12)));
}

export async function fetchRecommendedCover(campusId: string, category: string) {
  const rows = await fetchRecommendedCovers(campusId, category, 1);
  return rows[0] ?? null;
}
