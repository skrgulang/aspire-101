import { getSupabaseBrowserClient } from './client';

export type University = {
  id: string;
  name: string;
  short_name: string;
  slug: string;
  city: string | null;
  state: string | null;
  country: string;
  cover_image: string | null;
  launch_status: 'live' | 'beta' | 'waitlist';
};

export type NearbyUniversity = University & {
  distance_miles: number;
};

export type NearestUniversity = NearbyUniversity;

export async function resolveUniversityByEmail(email: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('resolve_university_by_email', {
    p_email: email.trim().toLowerCase()
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? null) as University | null;
}

export async function findNearestUniversity(lat: number, lng: number) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('nearest_university', {
    p_lat: lat,
    p_lng: lng
  });
  if (error) throw error;
  const row = ((data ?? [])[0] ?? null) as (Omit<University, 'launch_status'> & { distance_miles: number }) | null;
  return row ? { ...row, launch_status: 'beta' as const } : null;
}

export async function findNearbyUniversities(
  lat: number,
  lng: number,
  options: { limit?: number; maxMiles?: number } = {}
) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('nearby_universities', {
    p_lat: lat,
    p_lng: lng,
    p_limit: options.limit ?? 8,
    p_max_miles: options.maxMiles ?? 250
  });
  if (error) throw error;
  return (data ?? []) as NearbyUniversity[];
}

export async function fetchActiveUniversities() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('universities')
    .select('id,name,short_name,slug,city,state,country,cover_image,launch_status')
    .eq('active', true)
    .order('name');
  if (error) throw error;
  return (data ?? []) as University[];
}
