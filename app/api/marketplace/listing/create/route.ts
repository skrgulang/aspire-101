import { NextResponse } from 'next/server';
import {
  apiError,
  getAuthenticatedUser,
  getStripePayoutState,
  getSupabaseServiceClient,
  stripeLivemode
} from '../../../../../lib/server/aspireServer';

const itemConditions = new Set(['new', 'like_new', 'good', 'fair', 'for_parts']);
const fulfillmentMethods = new Set(['campus_pickup', 'shipping', 'seller_delivery', 'aspirer_delivery']);
const shippingPayers = new Set(['buyer', 'seller', 'either']);
const sellerDeliveryModes = new Set(['free', 'fixed', 'negotiable']);
const languages = new Set(['en', 'zh', 'es', 'ko', 'ja', 'fr', 'hi', 'ar', 'vi', 'other']);

function cleanText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

function badRequest(error: string, code = 'INVALID_LISTING') {
  return NextResponse.json({ error, code }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    if (!user.phone_confirmed_at) throw new Error('PHONE_REQUIRED');

    const body = await request.json().catch(() => ({}));
    const campusId = cleanText(body?.campusId, 80);
    const title = cleanText(body?.title, 180);
    const details = typeof body?.details === 'string' ? body.details.trim().slice(0, 5000) : '';
    const sellerArea = cleanText(body?.sellerArea, 120);
    const priceCents = Number(body?.priceCents);
    const itemCondition = cleanText(body?.itemCondition, 32);
    const requestedMethods = Array.isArray(body?.fulfillmentMethods) ? body.fulfillmentMethods : [];
    const methods = Array.from(new Set(requestedMethods.filter((value): value is string => typeof value === 'string' && fulfillmentMethods.has(value)))).slice(0, 4);
    const shippingPaidBy = cleanText(body?.shippingPaidBy, 20) || 'buyer';
    const sellerDeliveryMode = cleanText(body?.sellerDeliveryMode, 20) || 'negotiable';
    const sellerDeliveryPriceCents = body?.sellerDeliveryPriceCents == null ? null : Number(body.sellerDeliveryPriceCents);
    const languageCode = languages.has(cleanText(body?.languageCode, 12)) ? cleanText(body?.languageCode, 12) : 'en';

    if (!campusId) return badRequest('Choose a campus before publishing.');
    if (!title) return badRequest('Add an item title.');
    if (!Number.isInteger(priceCents) || priceCents <= 0) return badRequest('Add a price greater than $0.');
    if (!itemConditions.has(itemCondition)) return badRequest('Choose a valid item condition.');
    if (!sellerArea) return badRequest('Add a public selling area such as West Lafayette, IN.');
    if (!methods.length) return badRequest('Choose at least one delivery option.');
    if (methods.includes('shipping') && !shippingPayers.has(shippingPaidBy)) return badRequest('Choose who can cover shipping.');
    if (methods.includes('seller_delivery') && !sellerDeliveryModes.has(sellerDeliveryMode)) return badRequest('Choose valid seller delivery terms.');
    if (methods.includes('seller_delivery') && sellerDeliveryMode === 'fixed' && (!Number.isInteger(sellerDeliveryPriceCents) || sellerDeliveryPriceCents! <= 0)) {
      return badRequest('Add a seller delivery price greater than $0.');
    }

    const supabase = getSupabaseServiceClient();
    const livemode = stripeLivemode();

    const [
      { data: verification, error: verificationError },
      { data: enforcement, error: enforcementError },
      { data: payoutAccount, error: payoutError }
    ] = await Promise.all([
      supabase.from('school_verifications').select('status').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_enforcement_states').select('state,expires_at').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('payment_accounts')
        .select('stripe_account_id,status,transfers_enabled')
        .eq('user_id', user.id)
        .eq('livemode', livemode)
        .maybeSingle()
    ]);

    if (verificationError) throw verificationError;
    if (enforcementError) throw enforcementError;
    if (payoutError) throw payoutError;
    if (verification?.status !== 'verified') throw new Error('SCHOOL_REQUIRED');

    const enforcementExpired = enforcement?.expires_at
      ? new Date(enforcement.expires_at).getTime() <= Date.now()
      : false;
    if (!enforcementExpired && enforcement?.state === 'suspended') throw new Error('ACCOUNT_SUSPENDED');
    if (!enforcementExpired && enforcement?.state === 'restricted') throw new Error('ACCOUNT_RESTRICTED');
    if (!payoutAccount?.stripe_account_id) throw new Error('PAYOUT_NOT_READY');

    const payoutState = await getStripePayoutState(payoutAccount.stripe_account_id);
    await supabase
      .from('payment_accounts')
      .update({
        status: payoutState.status,
        transfers_enabled: payoutState.ready,
        requirements_due: payoutState.requirementsDue,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id)
      .eq('livemode', livemode);

    if (!payoutState.ready) throw new Error('PAYOUT_NOT_READY');

    const primaryFulfillment = methods.includes('campus_pickup')
      ? 'campus_pickup'
      : methods.includes('shipping')
        ? 'shipping'
        : null;
    const shippingPolicy = methods.includes('shipping') ? shippingPaidBy : null;

    const { data, error } = await supabase
      .from('requests')
      .insert({
        poster_id: user.id,
        kind: 'buy_sell',
        category: 'Buy & sell',
        title,
        details: details || null,
        campus_id: campusId,
        latitude: null,
        longitude: null,
        seller_area: sellerArea,
        amount_cents: priceCents,
        currency: 'USD',
        payment_method: 'aspire',
        market_intent: 'sell',
        item_condition: itemCondition,
        price_negotiable: false,
        fulfillment_method: primaryFulfillment,
        fulfillment_methods: methods,
        shipping_paid_by_default: shippingPolicy,
        shipping_paid_by_preference: shippingPolicy,
        seller_delivery_mode: methods.includes('seller_delivery') ? sellerDeliveryMode : null,
        seller_delivery_price_cents: methods.includes('seller_delivery') && sellerDeliveryMode === 'fixed'
          ? sellerDeliveryPriceCents
          : null,
        quantity: 1,
        language_code: languageCode,
        cover_image_url: null,
        cover_image_source: 'none',
        cover_image_asset_id: null,
        listing_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      })
      .select('id,title,moderation_status')
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    const raw = error instanceof Error ? error.message : '';
    const detail = error && typeof error === 'object'
      ? `${raw} ${'details' in error ? String((error as { details?: unknown }).details || '') : ''} ${'hint' in error ? String((error as { hint?: unknown }).hint || '') : ''}`
      : raw;

    if (/POST_RATE_LIMIT/i.test(detail)) {
      return NextResponse.json({ error: 'You are listing items too quickly. Wait a little and try again.', code: 'POST_RATE_LIMIT' }, { status: 429 });
    }
    if (/ACCOUNT_SUSPENDED/i.test(detail)) {
      return NextResponse.json({ error: 'This Aspire account is suspended from publishing new listings.', code: 'ACCOUNT_SUSPENDED' }, { status: 403 });
    }
    if (/ACCOUNT_RESTRICTED/i.test(detail)) {
      return NextResponse.json({ error: 'This Aspire account is temporarily restricted from publishing new listings.', code: 'ACCOUNT_RESTRICTED' }, { status: 403 });
    }

    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
