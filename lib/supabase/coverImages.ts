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

export async function fetchRecommendedCovers(campusId: string, category: string, limit = 6) {
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
    .filter((item) => item.category_key == null || item.category_key === category)
    .sort((a, b) => scoreCover(b, campusId, category) - scoreCover(a, campusId, category))
    .slice(0, Math.max(1, Math.min(limit, 12)));
}

export async function fetchRecommendedCover(campusId: string, category: string) {
  const rows = await fetchRecommendedCovers(campusId, category, 1);
  return rows[0] ?? null;
}
