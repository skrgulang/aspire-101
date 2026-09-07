import { NextResponse } from 'next/server';
import { getAuthenticatedUser, getSupabaseServiceClient } from '../../../../../lib/server/aspireServer';

export const runtime = 'nodejs';

async function requireModerator(userId: string, supabase: ReturnType<typeof getSupabaseServiceClient>) {
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle();
  if (data?.role !== 'moderator' && data?.role !== 'admin') throw new Error('MODERATOR_REQUIRED');
  return data.role as 'moderator' | 'admin';
}

export async function GET(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const supabase = getSupabaseServiceClient();
    await requireModerator(user.id, supabase);

    const { data: reviews, error } = await supabase
      .from('avatar_moderation_reviews')
      .select('id,user_id,storage_path,mime_type,status,model,model_flagged,risk_level,risk_score,categories,ai_summary,created_at,updated_at')
      .in('status', ['review', 'scanning'])
      .order('created_at', { ascending: true })
      .limit(80);
    if (error) throw error;

    const rows = reviews ?? [];
    const userIds = [...new Set(rows.map((row) => row.user_id))];
    const { data: profiles } = userIds.length
      ? await supabase.from('profiles').select('id,display_name,full_name,name,school,avatar_moderation_review_id').in('id', userIds)
      : { data: [] as Array<Record<string, unknown>> };
    const profileMap = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));

    const paths = rows.map((row) => row.storage_path).filter(Boolean);
    const signedMap = new Map<string, string>();
    if (paths.length) {
      const { data: signedRows } = await supabase.storage.from('avatar-review').createSignedUrls(paths, 10 * 60);
      (signedRows ?? []).forEach((item, index) => {
        if (item.signedUrl && paths[index]) signedMap.set(paths[index], item.signedUrl);
      });
    }

    return NextResponse.json({
      reviews: rows.map((row) => {
        const profile: any = profileMap.get(row.user_id) || {};
        const current = profile.avatar_moderation_review_id === row.id;
        return {
          id: row.id,
          userId: row.user_id,
          displayName: profile.display_name || profile.full_name || profile.name || 'Aspire student',
          school: profile.school || 'Campus',
          mimeType: row.mime_type,
          status: current ? row.status : 'superseded',
          model: row.model,
          modelFlagged: row.model_flagged,
          riskLevel: row.risk_level,
          riskScore: row.risk_score,
          categories: row.categories || {},
          summary: row.ai_summary,
          previewUrl: current ? signedMap.get(row.storage_path) || null : null,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      }).filter((row) => row.status !== 'superseded')
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'UNKNOWN';
    if (raw === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });
    if (raw === 'MODERATOR_REQUIRED') return NextResponse.json({ error: 'Moderator access required.' }, { status: 403 });
    return NextResponse.json({ error: raw }, { status: 500 });
  }
}
