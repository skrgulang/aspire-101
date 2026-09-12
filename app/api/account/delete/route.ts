import { NextResponse } from 'next/server';
import { eraseDirectAccountData, getAccountDeletionBlockers } from '../../../../lib/server/accountData';
import { apiError, getAuthenticatedUser, getSupabaseServiceClient } from '../../../../lib/server/aspireServer';

const RECENT_SIGN_IN_MS = 30 * 60 * 1000;

export async function DELETE(request: Request) {
  try {
    const { user, accessToken } = await getAuthenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    const confirmation = typeof body?.confirmation === 'string' ? body.confirmation.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (confirmation !== 'DELETE') {
      return NextResponse.json({ error: 'Type DELETE to confirm account deletion.', code: 'CONFIRMATION_REQUIRED' }, { status: 400 });
    }
    if (!user.email || email !== user.email.toLowerCase()) {
      return NextResponse.json({ error: 'Enter the email address on this account to confirm.', code: 'EMAIL_CONFIRMATION_REQUIRED' }, { status: 400 });
    }

    const lastSignIn = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : 0;
    if (!lastSignIn || Date.now() - lastSignIn > RECENT_SIGN_IN_MS) {
      return NextResponse.json({
        error: 'For security, sign out and sign back in before deleting your account.',
        code: 'RECENT_AUTH_REQUIRED'
      }, { status: 401 });
    }

    const supabase = getSupabaseServiceClient();
    const blockers = await getAccountDeletionBlockers(supabase, user.id);
    if (blockers.length) {
      return NextResponse.json({
        error: 'Your account cannot be deleted while active obligations are still open.',
        code: 'ACCOUNT_DELETE_BLOCKED',
        blockers
      }, { status: 409 });
    }

    await eraseDirectAccountData(supabase, user.id);

    const { error: signOutError } = await supabase.auth.admin.signOut(accessToken, 'global');
    if (signOutError) console.warn('Account deletion session revocation warning:', signOutError.message);

    const { error: authError } = await supabase.auth.admin.deleteUser(user.id, true);
    if (authError) throw new Error(`ACCOUNT_DELETE:auth:${authError.message}`);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'UNKNOWN';
    if (raw.startsWith('ACCOUNT_DELETE:') || raw.startsWith('ACCOUNT_DATA:')) {
      return NextResponse.json({
        error: 'Account deletion could not finish. Please retry or contact Aspire support if the problem continues.',
        code: 'ACCOUNT_DELETE_FAILED'
      }, { status: 500 });
    }
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
