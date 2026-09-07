import { NextResponse } from 'next/server';
import { getAuthenticatedUser, getSupabaseServiceClient } from '../../../../../lib/server/aspireServer';

export const runtime = 'nodejs';

type ReviewRow = {
  id: string;
  user_id: string;
  storage_path: string;
  mime_type: string;
  status: string;
  model: string | null;
  model_flagged: boolean | null;
  risk_level: string;
  risk_score: number | null;
  categories: Record<string, boolean> | null;
  ai_summary: string | null;
  created_at: string;
  updated_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  full_name: string | null;
  name: string | null;
  school: string | null;
  avatar_moderation_review_id: string | null;
};

async function requireModerator(userId: string, supabase: ReturnType<typeof getSupabaseServiceClient>) {
  const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (data?.role !== 'moderator' && data?.role !== 'admin') throw new Error('MODERATOR_REQUIRED');
}

export async function GET(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const supabase = getSupabaseServiceClient();
    await requireModerator(user.id, supabase);

    const { data: reviewData, error: reviewError } = await supabase
      .from('avatar_moderation_reviews')
      .select('id,user_id,storage_path,mime_type,status,model,model_flagged,risk_level,risk_score,categories,ai_summary,created_at,updated_at')
      .in('status', ['review', 'scanning'])
      .order('created_at', { ascending: true })
      .limit(80);
    if (reviewError) throw reviewError;

    const rows = (reviewData ?? []) as ReviewRow[];
    const userIds = Array.from(new Set(rows.map((row) => row.user_id)));
    let profiles: ProfileRow[] = [];
    if (userIds.length > 0) {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id,display_name,full_name,name,school,avatar_moderation_review_id')
        .in('id', userIds);
      if (profileError) throw profileError;
      profiles = (profileData ?? []) as ProfileRow[];
    }

    const profileMap = new Map<string, ProfileRow>();
    for (const profile of profiles) profileMap.set(profile.id, profile);

    const currentRows = rows.filter((row) => profileMap.get(row.user_id)?.avatar_moderation_review_id === row.id);
    const paths: string[] = currentRows.map((row) => row.storage_path);
    const signedMap = new Map<string, string>();

    if (paths.length > 0) {
      const { data: signedRows, error: signedError } = await supabase.storage.from('avatar-review').createSignedUrls(paths, 10 * 60);
      if (signedError) throw signedError;
      for (let index = 0; index < (signedRows ?? []).length; index += 1) {
        const item = signedRows?.[index];
        const path = paths[index];
        if (item?.signedUrl && path) signedMap.set(path, item.signedUrl);
      }
    }

    const reviews = currentRows.map((row) => {
      const profile = profileMap.get(row.user_id);
      return {
        id: row.id,
        userId: row.user_id,
        displayName: profile?.display_name || profile?.full_name || profile?.name || 'Aspire student',
        school: profile?.school || 'Campus',
        mimeType: row.mime_type,
        status: row.status,
        model: row.model,
        modelFlagged: row.model_flagged,
        riskLevel: row.risk_level,
        riskScore: row.risk_score,
        categories: row.categories || {},
        summary: row.ai_summary,
        previewUrl: signedMap.get(row.storage_path) || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    });

    return NextResponse.json({ reviews });
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'UNKNOWN';
    if (raw === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });
    if (raw === 'MODERATOR_REQUIRED') return NextResponse.json({ error: 'Moderator access required.' }, { status: 403 });
    return NextResponse.json({ error: raw }, { status: 500 });
  }
}
