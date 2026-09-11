import { getSupabaseBrowserClient } from './client';

export type PublicProfileView = {
  user_id: string;
  can_view: boolean;
  visibility: 'private' | 'connections' | 'campus';
  display_name: string | null;
  school: string | null;
  avatar_url: string | null;
  bio: string | null;
  major: string | null;
  graduation_year: number | null;
  interests: string[] | null;
  completed_count: number | null;
  joined_at: string | null;
  school_verified: boolean;
  is_connection: boolean;
  same_campus: boolean;
  owner_view: boolean;
};

export async function fetchPublicProfile(userId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('get_public_profile', { p_target_user_id: userId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row || null) as PublicProfileView | null;
}
