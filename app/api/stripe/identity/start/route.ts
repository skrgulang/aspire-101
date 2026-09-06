import { NextResponse } from 'next/server';
import { apiError, getAuthenticatedUser, getSupabaseServiceClient, publicOrigin, stripeFormRequest, stripeGet } from '../../../../../lib/server/aspireServer';

type StripeIdentitySession = {
  id: string;
  object: 'identity.verification_session';
  status: 'requires_input' | 'processing' | 'verified' | 'canceled';
  url?: string | null;
};

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const supabase = getSupabaseServiceClient();
    const { data: existing } = await supabase
      .from('identity_verifications')
      .select('status,provider_session_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing?.status === 'verified') {
      return NextResponse.json({ status: 'verified' });
    }

    if (existing?.provider_session_id && existing.status === 'pending') {
      try {
        const current = await stripeGet<StripeIdentitySession>(`/v1/identity/verification_sessions/${encodeURIComponent(existing.provider_session_id)}`);
        if (current.status === 'verified') {
          await supabase.from('identity_verifications').upsert({
            user_id: user.id,
            status: 'verified',
            provider: 'stripe_identity',
            provider_session_id: current.id,
            verified_at: new Date().toISOString(),
            last_error: null,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });
          return NextResponse.json({ status: 'verified' });
        }
        if (current.url && current.status === 'requires_input') {
          return NextResponse.json({ status: 'pending', url: current.url });
        }
      } catch {
        // If an old session cannot be reused, start a fresh hosted verification session.
      }
    }

    const session = await stripeFormRequest<StripeIdentitySession>('/v1/identity/verification_sessions', {
      type: 'document',
      return_url: `${publicOrigin(request)}/profile?identity=returned`,
      'options[document][require_matching_selfie]': true,
      'metadata[aspire_user_id]': user.id,
      'metadata[product]': 'aspire101'
    });

    await supabase.from('identity_verifications').upsert({
      user_id: user.id,
      status: session.status === 'verified' ? 'verified' : 'pending',
      provider: 'stripe_identity',
      provider_session_id: session.id,
      verified_at: session.status === 'verified' ? new Date().toISOString() : null,
      last_error: null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    return NextResponse.json({
      status: session.status === 'verified' ? 'verified' : 'pending',
      url: session.url ?? null
    });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
