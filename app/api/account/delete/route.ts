import { NextResponse } from 'next/server';
import { apiError, getAuthenticatedUser, getSupabaseServiceClient } from '../../../../lib/server/aspireServer';

const directPersonalTables: Array<{ table: string; column: string }> = [
  { table: 'avatar_moderation_reviews', column: 'user_id' },
  { table: 'aspire_ai_sessions', column: 'user_id' },
  { table: 'connection_circle_choices', column: 'user_id' },
  { table: 'connection_completion_confirmations', column: 'user_id' },
  { table: 'connection_message_reads', column: 'user_id' },
  { table: 'identity_verifications', column: 'user_id' },
  { table: 'notifications', column: 'user_id' },
  { table: 'safety_acknowledgements', column: 'user_id' },
  { table: 'school_verifications', column: 'user_id' },
  { table: 'task_claims', column: 'user_id' },
  { table: 'task_swipes', column: 'user_id' },
  { table: 'user_daily_activity', column: 'user_id' },
  { table: 'user_locations', column: 'user_id' },
  { table: 'user_roles', column: 'user_id' },
  { table: 'user_trust_profiles', column: 'user_id' }
];

export async function DELETE(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    const confirmation = typeof body?.confirmation === 'string' ? body.confirmation.trim() : '';

    if (confirmation !== 'DELETE') {
      return NextResponse.json({ error: 'Type DELETE to confirm account deletion.' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();

    // Remove direct personal/account data first. Historical marketplace, payment-ledger,
    // payout, dispute, moderation, fraud-prevention, and enforcement records are retained
    // where Aspire may need them for accounting, legal obligations, refunds, or platform integrity.
    for (const item of directPersonalTables) {
      const { error } = await supabase.from(item.table).delete().eq(item.column, user.id);
      if (error) throw new Error(`ACCOUNT_DELETE:${item.table}:${error.message}`);
    }

    const { error: profileError } = await supabase.from('profiles').delete().eq('id', user.id);
    if (profileError) throw new Error(`ACCOUNT_DELETE:profiles:${profileError.message}`);

    const { error: authError } = await supabase.auth.admin.deleteUser(user.id);
    if (authError) throw new Error(`ACCOUNT_DELETE:auth:${authError.message}`);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'UNKNOWN';
    if (raw.startsWith('ACCOUNT_DELETE:')) {
      return NextResponse.json(
        { error: 'Could not fully delete the account. Nothing else should be submitted; contact Aspire support if this continues.' },
        { status: 500 }
      );
    }
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
