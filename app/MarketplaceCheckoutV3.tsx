'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchCampusFeedRequests, type DiscoverRequest } from '../lib/supabase/discovery';
import { fetchActiveUniversities, type University } from '../lib/supabase/universities';
import { respondToRequest } from '../lib/supabase/requests';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { runRequestAiSafety } from '../lib/supabase/trust';
import {
  cancelUnpaidMarketplaceReservation,
  purchaseMarketplaceListingWithOptions,
  purchaseMarketplaceWithAspirerDelivery,
  setMarketplaceDeliveryAddress,
  type MarketplaceDeliveryAddress,
  type MarketplacePaymentMethod,
  type ShippingPaidBy
} from '../lib/supabase/marketplacePurchase';
import AppDock from './AppDock';
import UiIcon from './UiIcon';

type DeliveryChoice = 'meet' | 'ship' | 'seller' | 'aspirer';
type AspirerReward = 'free' | '5' | '10' | 'custom' | 'negotiable';
type FulfillmentMethod = 'campus_pickup' | 'shipping' | 'aspirer_delivery';
type ListingDeliveryMethod = FulfillmentMethod | 'seller_delivery';
type ShippingPolicy = 'buyer' | 'seller' | 'either';
type SellerDeliveryMode = 'free' | 'fixed' | 'negotiable';
type MarketplaceItem = Omit<DiscoverRequest, 'fulfillment_method'> & {
  fulfillment_method?: FulfillmentMethod | null;
  fulfillment_methods?: ListingDeliveryMethod[];
  shipping_paid_by_preference?: ShippingPolicy | null;
  seller_delivery_mode?: SellerDeliveryMode | null;
  seller_delivery_price_cents?: number | null;
};
type FeePolicy = {
  campus_id: string | null;
  requester_fee_bps: number;
  requester_fee_fixed_cents: number;
  requester_fee_min_cents: number;
  requester_fee_max_cents: number;
  provider_fee_bps: number;
};

type AddressState = MarketplaceDeliveryAddress & { instructions: string };

const EMPTY_ADDRESS: AddressState = {
  name: '',
  street1: '',
  street2: '',
  city: '',
  state: 'IN',
  zip: '',
  country: 'US',
  instructions: ''
};

function money(cents: number | null | undefined) {
  if (cents == null) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function methodsFor(item: MarketplaceItem): ListingDeliveryMethod[] {
  if (Array.isArray(item.fulfillment_methods) && item.fulfillment_methods.length) return item.fulfillment_methods;
  if (item.fulfillment_method === 'shipping') return ['shipping'];
  if (item.fulfillment_method === 'aspirer_delivery') return ['aspirer_delivery'];
  return ['campus_pickup'];
}

function supports(item: MarketplaceItem, choice: DeliveryChoice) {
  const methods = methodsFor(item);
  if (choice === 'meet') return methods.includes('campus_pickup');
  if (choice === 'ship') return methods.includes('shipping');
  if (choice === 'seller') return methods.includes('seller_delivery');
  return methods.includes('aspirer_delivery');
}

function methodSummary(item: MarketplaceItem) {
  const result: string[] = [];
  if (supports(item, 'meet')) result.push('Meet up');
  if (supports(item, 'ship')) result.push('Shipping');
  if (supports(item, 'seller')) result.push('Seller delivery');
  if (supports(item, 'aspirer')) result.push('Aspirer delivery');
  return result.join(' · ');
}

function defaultChoice(item: MarketplaceItem): DeliveryChoice {
  if (supports(item, 'meet')) return 'meet';
  if (supports(item, 'ship')) return 'ship';
  if (supports(item, 'seller')) return 'seller';
  if (supports(item, 'aspirer')) return 'aspirer';
  return 'meet';
}

function shippingPolicyFor(item: MarketplaceItem): ShippingPolicy {
  return item.shipping_paid_by_preference === 'seller' || item.shipping_paid_by_preference === 'either'
    ? item.shipping_paid_by_preference
    : 'buyer';
}

function initialShippingPayer(item: MarketplaceItem): ShippingPaidBy {
  return shippingPolicyFor(item) === 'seller' ? 'seller' : 'buyer';
}

function sellerDeliveryPrice(item: MarketplaceItem) {
  if (item.seller_delivery_mode === 'free') return 'Free';
  if (item.seller_delivery_mode === 'fixed' && Number(item.seller_delivery_price_cents || 0) > 0) {
    return money(item.seller_delivery_price_cents);
  }
  return 'Negotiable';
}

function buyerFee(amount: number, policy: FeePolicy | null) {
  if (!policy || amount <= 0) return 0;
  let fee = Math.round((amount * policy.requester_fee_bps) / 10000) + policy.requester_fee_fixed_cents;
  fee = Math.max(policy.requester_fee_min_cents, fee);
  if (policy.requester_fee_max_cents > 0) fee = Math.min(policy.requester_fee_max_cents, fee);
  return fee;
}

function addressComplete(address: AddressState) {
  return Boolean(
    address.name?.trim() &&
    address.street1.trim() &&
    address.city.trim() &&
    address.state.trim() &&
    address.zip.trim() &&
    address.country.trim()
  );
}

function customRewardCents(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100);
}

export default function MarketplaceCheckoutV3() {
  const router = useRouter();
  const [campus, setCampus] = useState<University | null>(null);
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [deliveryFor, setDeliveryFor] = useState<MarketplaceItem | null>(null);
  const [deliveryChoice, setDeliveryChoice] = useState<DeliveryChoice>('meet');
  const [meetPayment, setMeetPayment] = useState<MarketplacePaymentMethod>('aspire');
  const [shippingPaidBy, setShippingPaidBy] = useState<ShippingPaidBy>('buyer');
  const [aspirerReward, setAspirerReward] = useState<AspirerReward>('negotiable');
  const [customRewardDollars, setCustomRewardDollars] = useState('');
  const [pickupArea, setPickupArea] = useState('');
  const [publicDropoffArea, setPublicDropoffArea] = useState('');
  const [sellerDeliveryArea, setSellerDeliveryArea] = useState('');
  const [address, setAddress] = useState<AddressState>(EMPTY_ADDRESS);
  const [feePolicy, setFeePolicy] = useState<FeePolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [modalError, setModalError] = useState('');
  const [directItemId, setDirectItemId] = useState('');

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace('/login?next=%2Fmarketplace');
        return;
      }

      const [{ data: profile }, universities] = await Promise.all([
        supabase.from('profiles').select('current_campus_id,home_campus_id').eq('id', data.user.id).maybeSingle(),
        fetchActiveUniversities()
      ]);
      const campusId = profile?.current_campus_id || profile?.home_campus_id;
      const nextCampus = universities.find((entry) => entry.id === campusId) || universities[0] || null;
      setCampus(nextCampus);

      if (nextCampus) {
        const [{ data: policies }, rows] = await Promise.all([
          supabase.from('fee_policies')
            .select('campus_id,requester_fee_bps,requester_fee_fixed_cents,requester_fee_min_cents,requester_fee_max_cents,provider_fee_bps,updated_at')
            .eq('active', true)
            .order('updated_at', { ascending: false }),
          fetchCampusFeedRequests({ campusId: nextCampus.id, category: 'Buy & sell', limit: 60 })
        ]);

        const eligiblePolicies = (policies || []) as Array<FeePolicy & { updated_at?: string }>;
        setFeePolicy(
          eligiblePolicies.find((entry) => entry.campus_id === nextCampus.id)
          || eligiblePolicies.find((entry) => entry.campus_id == null)
          || null
        );

        const visible = (rows as MarketplaceItem[]).filter((item) =>
          item.kind === 'buy_sell' &&
          item.market_intent === 'sell' &&
          item.payment_method === 'aspire' &&
          item.poster_id !== data.user!.id
        );
        setItems(visible);

        const directId = new URLSearchParams(window.location.search).get('item') || '';
        setDirectItemId(directId);
        const directItem = directId ? visible.find((item) => item.id === directId) : undefined;
        if (directItem) openDelivery(directItem);
      }
      setLoading(false);
    }).catch((error) => {
      setNotice(error instanceof Error ? error.message : 'Could not load the market.');
      setLoading(false);
    });
  }, [router]);

  function openDelivery(item: MarketplaceItem) {
    setDeliveryFor(item);
    setDeliveryChoice(defaultChoice(item));
    setMeetPayment('aspire');
    setShippingPaidBy(initialShippingPayer(item));
    setAspirerReward('negotiable');
    setCustomRewardDollars('');
    setPickupArea('');
    setPublicDropoffArea('');
    setSellerDeliveryArea('');
    setAddress(EMPTY_ADDRESS);
    setModalError('');
    setNotice('');
  }

  function chooseDelivery(choice: DeliveryChoice) {
    if (deliveryFor && !supports(deliveryFor, choice)) return;
    setDeliveryChoice(choice);
    if (choice === 'ship' && deliveryFor) setShippingPaidBy(initialShippingPayer(deliveryFor));
    setModalError('');
  }

  function requireAddress() {
    if (addressComplete(address)) return true;
    setModalError('Add the delivery address below before continuing.');
    window.setTimeout(() => document.getElementById('market-delivery-name')?.focus(), 0);
    return false;
  }

  async function askSeller(item: MarketplaceItem) {
    if (!supports(item, 'seller')) {
      setModalError('Seller delivery is not offered for this item.');
      return;
    }
    const area = sellerDeliveryArea.trim().replace(/\s+/g, ' ');
    if (!area) {
      setModalError('Add a general delivery area before asking the seller.');
      window.setTimeout(() => document.getElementById('market-seller-delivery-area')?.focus(), 0);
      return;
    }

    setBusy(`seller-${item.id}`);
    setModalError('');
    try {
      const terms = item.seller_delivery_mode === 'free'
        ? 'Your listing says seller delivery is free.'
        : item.seller_delivery_mode === 'fixed' && Number(item.seller_delivery_price_cents || 0) > 0
          ? `Your listing shows a ${money(item.seller_delivery_price_cents)} seller-delivery price.`
          : 'Please tell me what delivery price you would want.';
      await respondToRequest(
        item.id,
        `Would you be willing to deliver “${item.title}” to the ${area} area? ${terms} I will share the exact address privately after we agree.`
      );
      setDeliveryFor(null);
      setNotice('Delivery request sent. Only the general area was shared; your exact address was not sent to the seller.');
    } catch (error) {
      setModalError(error instanceof Error ? error.message : 'Could not ask the seller about delivery.');
    } finally {
      setBusy('');
    }
  }

  async function reserve(item: MarketplaceItem) {
    if (deliveryChoice === 'seller') {
      await askSeller(item);
      return;
    }
    if (!supports(item, deliveryChoice)) {
      setModalError('That delivery method is not offered by this seller.');
      return;
    }
    if ((deliveryChoice === 'ship' || deliveryChoice === 'aspirer') && !requireAddress()) return;

    const customCents = aspirerReward === 'custom' ? customRewardCents(customRewardDollars) : 0;
    if (deliveryChoice === 'aspirer' && aspirerReward === 'custom' && customCents <= 0) {
      setModalError('Enter a custom delivery reward greater than $0 before reserving the item.');
      return;
    }

    const fulfillmentMethod: FulfillmentMethod = deliveryChoice === 'meet'
      ? 'campus_pickup'
      : deliveryChoice === 'ship'
        ? 'shipping'
        : 'aspirer_delivery';
    const paymentMethod: MarketplacePaymentMethod = deliveryChoice === 'meet' ? meetPayment : 'aspire';

    setBusy(item.id);
    setModalError('');
    let reservedConnectionId = '';
    try {
      if (deliveryChoice === 'aspirer') {
        const amountCents = aspirerReward === '5' ? 500 : aspirerReward === '10' ? 1000 : aspirerReward === 'custom' ? customCents : null;
        const compensationMode = aspirerReward === 'free' ? 'free' : aspirerReward === 'negotiable' ? 'discuss' : 'fixed';
        const safeDropoff = publicDropoffArea.trim() || `${address.city.trim()}, ${address.state.trim()}`;
        const linked = await purchaseMarketplaceWithAspirerDelivery({
          requestId: item.id,
          address: {
            name: address.name,
            street1: address.street1,
            street2: address.street2,
            city: address.city,
            state: address.state,
            zip: address.zip,
            country: address.country
          },
          instructions: address.instructions,
          compensationMode,
          requestedAmountCents: amountCents,
          pickupArea: pickupArea.trim() || 'Seller pickup area',
          dropoffArea: safeDropoff
        });
        void runRequestAiSafety(linked.deliveryRequestId).catch(() => undefined);
        router.push(`/transactions?connection=${encodeURIComponent(linked.connectionId)}&delivery=aspirer`);
        return;
      }

      const connectionId = await purchaseMarketplaceListingWithOptions({
        requestId: item.id,
        fulfillmentMethod,
        paymentMethod,
        shippingPaidBy: deliveryChoice === 'ship' ? shippingPaidBy : null
      });
      reservedConnectionId = connectionId;

      if (deliveryChoice === 'ship') {
        await setMarketplaceDeliveryAddress({
          connectionId,
          address: {
            name: address.name,
            street1: address.street1,
            street2: address.street2,
            city: address.city,
            state: address.state,
            zip: address.zip,
            country: address.country
          },
          instructions: address.instructions
        });
      }

      const params = new URLSearchParams({ connection: connectionId, delivery: deliveryChoice });
      if (deliveryChoice === 'ship') params.set('shippingPayer', shippingPaidBy);
      if (deliveryChoice === 'meet') params.set('paymentMethod', meetPayment);
      router.push(`/transactions?${params.toString()}`);
    } catch (error) {
      if (reservedConnectionId) {
        await cancelUnpaidMarketplaceReservation(reservedConnectionId).catch(() => false);
      }
      setModalError(error instanceof Error ? error.message : 'Could not continue with this item.');
    } finally {
      setBusy('');
    }
  }

  const itemAmount = deliveryFor?.amount_cents || 0;
  const protectedPayment = deliveryChoice !== 'meet' || meetPayment === 'aspire';
  const itemServiceFee = protectedPayment ? buyerFee(itemAmount, feePolicy) : 0;
  const itemCheckoutTotal = itemAmount + itemServiceFee;
  const customCents = customRewardCents(customRewardDollars);
  const fixedAspirerReward = aspirerReward === '5' ? 500 : aspirerReward === '10' ? 1000 : aspirerReward === 'custom' ? customCents : 0;
  const deliveryPaymentFee = deliveryChoice === 'aspirer' && fixedAspirerReward > 0
    ? buyerFee(fixedAspirerReward, feePolicy)
    : 0;
  const estimatedAspirerTotal = itemCheckoutTotal + fixedAspirerReward + deliveryPaymentFee;

  const needsAddress = deliveryChoice === 'ship' || deliveryChoice === 'aspirer';
  const addressTitle = deliveryChoice === 'ship' ? 'Shipping address' : 'Delivery address (private)';
  const shippingPolicy = deliveryFor ? shippingPolicyFor(deliveryFor) : 'buyer';

  return (
    <main className="marketV2Page">
      <AppDock active="discover" />
      <div className="marketV2Shell">
        <header className="marketV2Header">
          <p>ASPIRE MARKET · {campus?.short_name || 'CAMPUS'}</p>
          <h1>Buy it. Then choose exactly how you get it.</h1>
          <span>Meet up, carrier shipping, seller delivery, or another Aspirer — with the money shown before you commit.</span>
        </header>

        {notice && <div className="marketV2Notice" role="status">{notice}</div>}

        {loading ? <div className="marketV2Empty">Loading campus listings…</div> : (
          <div className="marketV2Grid">
            {items.map((item) => {
              const media = (item as any).media?.[0]?.public_url || (item as any).cover_image_url;
              return (
                <article className="marketV2Product" key={item.id}>
                  <div className="marketV2Media">
                    {media ? <img src={media} alt="" /> : <UiIcon name="tag" />}
                    <span>{item.id === directItemId ? 'Test item' : 'For sale'}</span>
                  </div>
                  <div className="marketV2Body">
                    <h2>{item.title}</h2>
                    <strong>{money(item.amount_cents)}</strong>
                    <small>{(item as any).item_condition?.replace('_', ' ') || 'Good'} · {methodSummary(item)}</small>
                    <button className="marketV2Primary" type="button" onClick={() => openDelivery(item)}>Buy now →</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {deliveryFor && (
        <div className="marketV2Backdrop" role="dialog" aria-modal="true" aria-label="Choose how to receive this item">
          <section className="marketV2Checkout">
            <button className="marketV2Close" type="button" aria-label="Close" onClick={() => setDeliveryFor(null)}>×</button>
            <div className="marketV2CheckoutHead">
              <p>BUY NOW · DELIVERY + PAYMENT</p>
              <h2>How do you want to get it?</h2>
              <span>{deliveryFor.title} · {money(itemAmount)}</span>
            </div>

            <div className="marketV2Choices">
              <button className={deliveryChoice === 'meet' ? 'active' : ''} disabled={!supports(deliveryFor, 'meet')} onClick={() => chooseDelivery('meet')}>
                <div><b>Meet up</b><em>Delivery $0</em></div>
                <span>Meet the seller on campus or nearby.</span>
              </button>
              <button className={deliveryChoice === 'ship' ? 'active' : ''} disabled={!supports(deliveryFor, 'ship')} onClick={() => chooseDelivery('ship')}>
                <div><b>Ship to me</b><em>+ carrier rate</em></div>
                <span>Enter your address, then choose a shipping rate.</span>
              </button>
              <button className={deliveryChoice === 'seller' ? 'active' : ''} disabled={!supports(deliveryFor, 'seller')} onClick={() => chooseDelivery('seller')}>
                <div><b>Ask seller to deliver</b><em>{supports(deliveryFor, 'seller') ? sellerDeliveryPrice(deliveryFor) : 'Not offered'}</em></div>
                <span>{supports(deliveryFor, 'seller') ? 'Share only a general delivery area first.' : 'This seller did not enable direct delivery.'}</span>
              </button>
              <button className={deliveryChoice === 'aspirer' ? 'active' : ''} disabled={!supports(deliveryFor, 'aspirer')} onClick={() => chooseDelivery('aspirer')}>
                <div><b>Ask an Aspirer</b><em>Free · $5 · $10 · custom</em></div>
                <span>Another student picks it up and brings it to your address.</span>
              </button>
            </div>

            {deliveryChoice === 'meet' && (
              <div className="marketV2Config">
                <h3>How do you want to pay?</h3>
                <label><input type="radio" name="meet-pay" checked={meetPayment === 'aspire'} onChange={() => setMeetPayment('aspire')} /><span><b>Aspire Protected</b><small>Pay online. Payment trail, refund/dispute tools, and seller payout stay in Aspire.</small></span></label>
                <label><input type="radio" name="meet-pay" checked={meetPayment === 'in_person'} onChange={() => setMeetPayment('in_person')} /><span><b>Pay in person</b><small>Pay the seller when you meet. No Aspire payment protection or Stripe checkout.</small></span></label>
              </div>
            )}

            {deliveryChoice === 'ship' && (
              <div className="marketV2Config">
                <h3>Who covers shipping?</h3>
                {(shippingPolicy === 'buyer' || shippingPolicy === 'either') && <label><input type="radio" name="shipping-payer" checked={shippingPaidBy === 'buyer'} onChange={() => setShippingPaidBy('buyer')} /><span><b>Buyer pays shipping</b><small>The selected live carrier rate is added to the protected checkout.</small></span></label>}
                {(shippingPolicy === 'seller' || shippingPolicy === 'either') && <label><input type="radio" name="shipping-payer" checked={shippingPaidBy === 'seller'} onChange={() => setShippingPaidBy('seller')} /><span><b>Seller covers shipping</b><small>The buyer does not pay the carrier rate; it comes from seller proceeds.</small></span></label>}
                {shippingPolicy !== 'either' && <p className="marketV2Fine">This is the shipping-payment option enabled by the seller for this listing.</p>}
              </div>
            )}

            {needsAddress && (
              <div className="marketV2Config marketV2AddressBlock">
                <div className="marketV2AddressHeading">
                  <h3>{addressTitle}</h3>
                  <span>{deliveryChoice === 'aspirer' ? 'Exact address is kept private from the public delivery post.' : 'Stored privately on the order for carrier shipping.'}</span>
                </div>
                <div className="marketV2AddressGrid">
                  <label className="marketV2Wide"><span>Recipient name *</span><input id="market-delivery-name" value={address.name || ''} onChange={(e) => setAddress((v) => ({ ...v, name: e.target.value }))} placeholder="Full name" /></label>
                  <label className="marketV2Wide"><span>Street address *</span><input value={address.street1} onChange={(e) => setAddress((v) => ({ ...v, street1: e.target.value }))} placeholder="123 Main St" /></label>
                  <label className="marketV2Wide"><span>Apt / dorm / room</span><input value={address.street2 || ''} onChange={(e) => setAddress((v) => ({ ...v, street2: e.target.value }))} placeholder="Optional" /></label>
                  <label><span>City *</span><input value={address.city} onChange={(e) => setAddress((v) => ({ ...v, city: e.target.value }))} placeholder="West Lafayette" /></label>
                  <label><span>State *</span><input value={address.state} onChange={(e) => setAddress((v) => ({ ...v, state: e.target.value.toUpperCase() }))} placeholder="IN" maxLength={2} /></label>
                  <label><span>ZIP *</span><input value={address.zip} onChange={(e) => setAddress((v) => ({ ...v, zip: e.target.value }))} placeholder="47906" /></label>
                  <label><span>Country *</span><input value={address.country} onChange={(e) => setAddress((v) => ({ ...v, country: e.target.value.toUpperCase() }))} placeholder="US" maxLength={2} /></label>
                  <label className="marketV2Wide"><span>Delivery instructions</span><input value={address.instructions} onChange={(e) => setAddress((v) => ({ ...v, instructions: e.target.value }))} placeholder="Front desk, call on arrival, etc." /></label>
                </div>
              </div>
            )}

            {deliveryChoice === 'seller' && (
              <div className="marketV2Config marketV2SellerAsk">
                <h3>Ask before you buy</h3>
                <label className="marketV2Wide"><span>General delivery area *</span><input id="market-seller-delivery-area" value={sellerDeliveryArea} onChange={(event) => setSellerDeliveryArea(event.target.value)} placeholder="e.g. Chauncey, WALC area, Purdue West" /></label>
                <p>Only this general area is sent with your request. Your exact street, dorm, room, or apartment address stays private until you and the seller agree.</p>
                <p>Seller delivery terms: <strong>{sellerDeliveryPrice(deliveryFor)}</strong>. Asking does not reserve the item yet.</p>
              </div>
            )}

            {deliveryChoice === 'aspirer' && (
              <div className="marketV2Config">
                <h3>Set up the public delivery request</h3>
                <div className="marketV2TwoCols">
                  <label><span>Pickup area (public)</span><input value={pickupArea} onChange={(event) => setPickupArea(event.target.value)} placeholder="Seller / dorm area" /></label>
                  <label><span>Drop-off area shown publicly</span><input value={publicDropoffArea} onChange={(event) => setPublicDropoffArea(event.target.value)} placeholder="e.g. WALC area" /></label>
                </div>
                <div className="marketV2RewardRow">
                  {(['free','5','10','custom','negotiable'] as AspirerReward[]).map((reward) => (
                    <button type="button" key={reward} className={aspirerReward === reward ? 'active' : ''} onClick={() => { setAspirerReward(reward); setModalError(''); }}>
                      {reward === 'free' ? 'Free' : reward === '5' ? '$5' : reward === '10' ? '$10' : reward === 'custom' ? 'Custom' : 'Negotiable'}
                    </button>
                  ))}
                </div>
                {aspirerReward === 'custom' && <label className="marketV2Wide"><span>Custom reward ($)</span><input inputMode="decimal" value={customRewardDollars} onChange={(event) => setCustomRewardDollars(event.target.value.replace(/[^0-9.]/g, ''))} placeholder="7.50" /></label>}
                <p className="marketV2Fine">Only the general area is public. The exact delivery address is stored privately on the order.</p>
              </div>
            )}

            <div className="marketV2Money">
              <div className="marketV2MoneyHead"><span>YOUR COST</span><b>{deliveryChoice === 'seller' ? 'Before seller reply' : protectedPayment ? 'Aspire Protected' : 'Pay in person'}</b></div>
              <div><span>Item</span><strong>{money(itemAmount)}</strong></div>
              {deliveryChoice === 'meet' && <div><span>Meetup delivery</span><strong>$0.00</strong></div>}
              {deliveryChoice === 'ship' && <div><span>Shipping</span><strong>{shippingPaidBy === 'buyer' ? 'Live carrier rate selected next' : 'Seller covers'}</strong></div>}
              {deliveryChoice === 'seller' && <div><span>Seller delivery</span><strong>{sellerDeliveryPrice(deliveryFor)}</strong></div>}
              {deliveryChoice === 'aspirer' && <div><span>Aspirer delivery reward</span><strong>{aspirerReward === 'free' ? '$0.00' : aspirerReward === 'negotiable' ? 'Negotiable' : aspirerReward === 'custom' && fixedAspirerReward <= 0 ? 'Enter amount' : money(fixedAspirerReward)}</strong></div>}
              {protectedPayment && deliveryChoice !== 'seller' && <div><span>Aspire service fee on item</span><strong>{money(itemServiceFee)}</strong></div>}
              {deliveryChoice === 'aspirer' && fixedAspirerReward > 0 && <div><span>Estimated Aspire fee on delivery payment</span><strong>{money(deliveryPaymentFee)}</strong></div>}

              {deliveryChoice === 'aspirer' && fixedAspirerReward > 0 ? (
                <div className="marketV2Total"><span>Estimated all-in total</span><strong>{money(estimatedAspirerTotal)}</strong></div>
              ) : deliveryChoice === 'aspirer' && aspirerReward === 'negotiable' ? (
                <div className="marketV2Total"><span>Item checkout now</span><strong>{money(itemCheckoutTotal)} + agreed delivery</strong></div>
              ) : deliveryChoice === 'aspirer' && aspirerReward === 'custom' ? (
                <div className="marketV2Total"><span>Item checkout now</span><strong>{money(itemCheckoutTotal)} + custom delivery reward</strong></div>
              ) : deliveryChoice === 'ship' && shippingPaidBy === 'buyer' ? (
                <div className="marketV2Total"><span>Estimated total</span><strong>{money(itemCheckoutTotal)} + live shipping</strong></div>
              ) : deliveryChoice === 'seller' ? (
                <div className="marketV2Total"><span>Item price</span><strong>{money(itemAmount)} + seller delivery terms</strong></div>
              ) : (
                <div className="marketV2Total"><span>You pay</span><strong>{money(itemCheckoutTotal)}</strong></div>
              )}

              {deliveryChoice === 'aspirer' && fixedAspirerReward > 0 && <small>Item checkout is {money(itemCheckoutTotal)} now. The {money(fixedAspirerReward)} helper reward and its estimated fee are a separate payment after a helper is chosen.</small>}
              {deliveryChoice === 'ship' && shippingPaidBy === 'seller' && <small>The selected live carrier rate will reduce seller proceeds instead of being charged to you.</small>}
            </div>

            {modalError && <div className="marketV2ModalError" role="alert">{modalError}</div>}

            <button className="marketV2Primary marketV2Continue" type="button" disabled={busy !== ''} onClick={() => void reserve(deliveryFor)}>
              {busy ? 'Working…' : deliveryChoice === 'seller' ? 'Ask seller about delivery →' : deliveryChoice === 'ship' ? 'Continue to live shipping rates →' : deliveryChoice === 'aspirer' ? 'Reserve item + post delivery request →' : meetPayment === 'in_person' ? 'Reserve for meetup →' : 'Continue to protected checkout →'}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
