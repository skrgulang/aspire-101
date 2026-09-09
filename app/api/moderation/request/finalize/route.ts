import { NextResponse } from 'next/server';
import { getAuthenticatedUser, getSupabaseServiceClient } from '../../../../../lib/server/aspireServer';

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const body = await request.json().catch(() => ({})) as { requestId?: string };
    const requestId = String(body.requestId || '').trim();
    if (!requestId) return NextResponse.json({ error: 'Request id is required.' }, { status: 400 });

    const supabase = getSupabaseServiceClient();
    const { data: row, error } = await supabase
      .from('requests')
      .select('id,poster_id,ai_moderation_status,ai_recommended_action,ai_risk_level,ai_risk_score,ai_summary')
      .eq('id', requestId)
      .maybeSingle();
    if (error) throw error;
    if (!row) return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
    if (row.poster_id !== user.id) return NextResponse.json({ error: 'You cannot finalize this request.' }, { status: 403 });
    if (row.ai_moderation_status !== 'complete') return NextResponse.json({ error: 'Safety scan is not complete yet.' }, { status: 409 });

    // Routine public posts do not wait for a human moderation queue. The automated
    // safety result is the publishing gate: low-risk approve; anything the model
    // recommends for review/block stays off-platform until the user edits/reposts.
    const approved = row.ai_recommended_action === 'approve';
    const moderationStatus = approved ? 'approved' : 'blocked';
    const reason = approved
      ? 'Automatically approved by Aspire Safety Intelligence.'
      : `Automatically blocked by Aspire Safety Intelligence${row.ai_risk_level ? ` (${row.ai_risk_level} risk)` : ''}.`;

    const { error: updateError } = await supabase.from('requests').update({
      moderation_status: moderationStatus,
      moderation_reason: reason,
      moderated_by: null,
      moderated_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq('id', requestId);
    if (updateError) throw updateError;

    return NextResponse.json({
      ok: true,
      requestId,
      moderationStatus,
      aiRecommendedAction: row.ai_recommended_action,
      aiRiskLevel: row.ai_risk_level,
      aiRiskScore: row.ai_risk_score,
      summary: row.ai_summary
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    if (message === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
    return NextResponse.json({ error: 'Could not finalize the automatic safety decision.' }, { status: 500 });
  }
}
