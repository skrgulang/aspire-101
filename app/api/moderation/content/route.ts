import { NextResponse } from 'next/server';
import { getAuthenticatedUser, getSupabaseServiceClient } from '../../../../lib/server/aspireServer';
import { moderateAspireContent, type AspireSafetyContext } from '../../../../lib/server/contentSafety';

export const runtime = 'nodejs';

const contexts = new Set<AspireSafetyContext>([
  'signup_name',
  'profile_name',
  'avatar',
  'request',
  'response',
  'message',
  'review'
]);

function safeMessage(context: AspireSafetyContext) {
  if (context === 'avatar') return 'That profile photo cannot be used on Aspire. Choose a different image.';
  if (context === 'signup_name' || context === 'profile_name') return 'That name cannot be used on Aspire. Use your normal campus name without links, contact handles, or unsafe content.';
  if (context === 'message') return 'That message cannot be sent on Aspire. Edit it and try again.';
  if (context === 'response') return 'That response cannot be sent on Aspire. Edit it and try again.';
  if (context === 'review') return 'That review note cannot be published on Aspire. Edit it and try again.';
  return 'That content cannot be published on Aspire. Edit it and try again.';
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as {
      context?: AspireSafetyContext;
      text?: string;
      avatarStoragePath?: string;
    };
    const context = body.context;
    if (!context || !contexts.has(context)) return NextResponse.json({ error: 'Invalid safety context.' }, { status: 400 });

    // Signup-name screening must happen before an account exists. Every other context requires auth.
    let userId: string | null = null;
    if (context !== 'signup_name') {
      const { user } = await getAuthenticatedUser(request);
      userId = user.id;
    }

    let imageUrls: string[] = [];
    if (context === 'avatar') {
      if (!userId || !body.avatarStoragePath) return NextResponse.json({ error: 'Avatar path is required.' }, { status: 400 });
      if (!body.avatarStoragePath.startsWith(`${userId}/`)) return NextResponse.json({ error: 'That avatar does not belong to this account.' }, { status: 403 });
      const supabase = getSupabaseServiceClient();
      const { data, error } = await supabase.storage.from('avatars').createSignedUrl(body.avatarStoragePath, 10 * 60);
      if (error || !data?.signedUrl) return NextResponse.json({ error: 'Could not inspect that profile photo.' }, { status: 400 });
      imageUrls = [data.signedUrl];
    }

    const text = String(body.text || '').trim();
    if ((context === 'signup_name' || context === 'profile_name') && text.length > 80) {
      return NextResponse.json({ error: safeMessage(context), code: 'CONTENT_BLOCKED' }, { status: 422 });
    }
    if (!text && !imageUrls.length) return NextResponse.json({ error: 'Nothing to review.' }, { status: 400 });

    const decision = await moderateAspireContent({ context, text, imageUrls });
    if (!decision.allowed) {
      return NextResponse.json({
        error: safeMessage(context),
        code: 'CONTENT_BLOCKED',
        decision: decision.decision,
        policyFlags: decision.policyFlags
      }, { status: 422 });
    }

    return NextResponse.json({ ok: true, decision: 'allow' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    if (message === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
    if (message.startsWith('MISSING_ENV:OPENAI_API_KEY')) return NextResponse.json({ error: 'Aspire safety checks are temporarily unavailable. Try again shortly.', code: 'SAFETY_UNAVAILABLE' }, { status: 503 });
    if (message.startsWith('OPENAI_MODERATION:')) return NextResponse.json({ error: 'Aspire could not finish its safety check. Try again shortly.', code: 'SAFETY_UNAVAILABLE' }, { status: 502 });
    return NextResponse.json({ error: 'Aspire could not finish its safety check. Try again shortly.' }, { status: 500 });
  }
}
