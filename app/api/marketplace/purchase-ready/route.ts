import { NextResponse } from 'next/server';
import {
  apiError,
  getAuthenticatedUser,
  getStripePayoutState,
  getSupabaseServiceClient,
  requireStripeLivePilotUser,
  stripeLivemode
} from '../../../../lib/server/aspireServer';

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    requireStripeLivePilotUser(user.id);

    const body = await request.json().catch(() => ({}));
    const requestId = typeof body?.requestId === 'string' ? body.requestId : '';
    const paymentMethod = body?.paymentMethod === 'in_person' ? 'in_person' : 'aspire';

    if (!requestId) {
      return NextResponse.json({ error: 'Missing marketplace listing.', code: 'LISTING_REQUIRED' }, { status: 400 });
    }
    if (paymentMethod === 'in_person') {
      return NextResponse.json({ ready: true, paymentMethod });
    }

    const supabase = getSupabaseServiceClient();
    const { data: listing, error: listingError } = await supabase
      .from('requests')
      .select('id,poster_id,status,kind,market_intent,payment_method')
      .eq('id', requestId)
      .maybeSingle();

    if (listingError) throw listingError;
    if (!listing || listing.kind !== 'buy_sell' || listing.market_intent !== 'sell') {
      return NextResponse.json({ error: 'Marketplace listing not found.', code: 'LISTING_NOT_FOUND' }, { status: 404 });
    }
    if (listing.poster_id === user.id) {
      return NextResponse.json({ error: 'You cannot buy your own listing.', code: 'CANNOT_BUY_OWN_LISTING' }, { status: 409 });
    }
    if (listing.status !== 'open') {
      return NextResponse.json({ error: 'This item is no longer available.', code: 'LISTING_UNAVAILABLE' }, { status: 409 });
    }
    if (listing.payment_method !== 'aspire') {
      return NextResponse.json({ error: 'This listing is not configured for Aspire Protected checkout.', code: 'MARKETPLACE_REQUIRES_ASPIRE' }, { status: 409 });
    }

    const livemode = stripeLivemode();
    const { data: payoutAccount, error: payoutError } = await supabase
      .from('payment_accounts')
      .select('stripe_account_id')
      .eq('user_id', listing.poster_id)
      .eq('livemode', livemode)
      .maybeSingle();

    if (payoutError) throw payoutError;
    if (!payoutAccount?.stripe_account_id) {
      return NextResponse.json({
        error: 'The seller has not finished payout setup yet. This item was not reserved and no payment was started.',
        code: 'SELLER_PAYOUT_NOT_READY'
      }, { status: 409 });
    }

    const payoutState = await getStripePayoutState(payoutAccount.stripe_account_id);
    const now = new Date().toISOString();
    await supabase
      .from('payment_accounts')
      .update({
        status: payoutState.status,
        transfers_enabled: payoutState.ready,
        requirements_due: payoutState.requirementsDue,
        last_synced_at: now,
        updated_at: now
      })
      .eq('user_id', listing.poster_id)
      .eq('livemode', livemode);

    if (!payoutState.ready) {
      return NextResponse.json({
        error: 'The seller must finish Stripe payout verification before this item can be reserved. No payment was started.',
        code: 'SELLER_PAYOUT_NOT_READY'
      }, { status: 409 });
    }

    return NextResponse.json({ ready: true, paymentMethod, livemode });
  } catch (error) {
    const result = apiError(error);
    return NextResponse.json(result.body, { status: result.status });
  }
}
