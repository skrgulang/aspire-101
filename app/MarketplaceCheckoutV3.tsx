'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchCampusFeedRequests, type DiscoverRequest } from '../lib/supabase/discovery';
import { fetchActiveUniversities, type University } from '../lib/supabase/universities';
import { createRequest, respondToRequest } from '../lib/supabase/requests';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import {
  purchaseMarketplaceListingWithOptions,
  setMarketplaceDeliveryAddress,
  type MarketplaceDeliveryAddress,
  type MarketplacePaymentMethod,
  type ShippingPaidBy
} from '../lib/supabase/marketplacePurchase';
import AppDock from './AppDock';
import UiIcon from './UiIcon';

type DeliveryChoice = 'meet' | 'ship' | 'seller' | 'aspirer';
type AspirerReward = 'free' | '5' | '10' | 'negotiable';
type FulfillmentMethod = 'campus_pickup' | 'shipping' | 'aspirer_delivery';
type MarketplaceItem = Omit<DiscoverRequest, 'fulfillment_method'> & {
  fulfillment_method?: FulfillmentMethod | null;
  fulfillment_methods?: FulfillmentMethod[];
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

function methodsFor(item: MarketplaceItem): FulfillmentMethod[] {
  if (Array.isArray(item.fulfillment_methods) && item.fulfillment_methods.length) return item.fulfillment_methods;
  if (item.fulfillment_method === 'shipping') return ['shipping'];
  if (item.fulfillment_method === 'aspirer_delivery') return ['aspirer_delivery'];
  return ['campus_pickup'];
}

function supports(item: MarketplaceItem, choice: DeliveryChoice) {
  const methods = methodsFor(item);
  if (choice === 'meet') return methods.includes('campus_pickup');
  if (choice === 'ship') return methods.includes('shipping');
  if (choice === 'aspirer') return methods.includes('aspirer_delivery');
  return true;
}

function methodSummary(item: MarketplaceItem) {
  const result: string[] = [];
  if (supports(item, 'meet')) result.push('Meet up');
  if (supports(item, 'ship')) result.push('Shipping');
  result.push('Ask seller');
  if (supports(item, 'aspirer')) result.push('Aspirer delivery');
  return result.join(' · ');
}

function defaultChoice(item: MarketplaceItem): DeliveryChoice {
  if (supports(item, 'meet')) return 'meet';
  if (supports(item, 'ship')) return 'ship';
  if (supports(item, 'aspirer')) return 'aspirer';
  return 'seller';
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

function formatAddress(address: AddressState) {
  return [
    address.street1.trim(),
    address.street2?.trim(),
    `${address.city.trim()}, ${address.state.trim()} ${address.zip.trim()}`,
    address.country.trim()
  ].filter(Boolean).join(', ');
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
  const [pickupArea, setPickupArea] = useState('');
  const [publicDropoffArea, setPublicDropoffArea] = useState('');
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
    setShippingPaidBy('buyer');
    setAspirerReward('negotiable');
    setPickupArea('');
    setPublicDropoffArea('');
    setAddress(EMPTY_ADDRESS);
    setModalError('');
    setNotice('');
  }

  function chooseDelivery(choice: DeliveryChoice) {
    setDeliveryChoice(choice);
    setModalError('');
  }

  function requireAddress() {
    if (addressComplete(address)) return true;
    setModalError('Add the delivery address below before continuing.');
    window.setTimeout(() => document.getElementById('market-delivery-name')?.focus(), 0);
    return false;
  }

  async function askSeller(item: MarketplaceItem) {
    if (!requireAddress()) return;
    setBusy(`seller-${item.id}`);
    setModalError('');
    try {
      const instructions = address.instructions.trim() ? ` Delivery notes: ${address.instructions.trim()}.` : '';
      await respondToRequest(
        item.id,
        `Would you be willing to deliver “${item.title}” directly? Delivery address: ${formatAddress(address)}.${instructions} Please reply with whether delivery is free or what delivery price you would want. I can pay through Aspire after we agree.`
      );
      setDeliveryFor(null);
      setNotice('Delivery request sent to the seller. The item is not reserved yet; buy after the seller agrees on delivery and price.');
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

    const fulfillmentMethod: FulfillmentMethod = deliveryChoice === 'meet'
      ? 'campus_pickup'
      : deliveryChoice === 'ship'
        ? 'shipping'
        : 'aspirer_delivery';
    const paymentMethod: MarketplacePaymentMethod = deliveryChoice === 'meet' ? meetPayment : 'aspire';

    setBusy(item.id);
    setModalError('');
    try {
      const connectionId = await purchaseMarketplaceListingWithOptions({
        requestId: item.id,
        fulfillmentMethod,
        paymentMethod,
        shippingPaidBy: deliveryChoice === 'ship' ? shippingPaidBy : null
      });

      if (deliveryChoice === 'ship' || deliveryChoice === 'aspirer') {
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

      if (deliveryChoice === 'aspirer') {
        const supabase = getSupabaseBrowserClient();
        const { data: order, error: orderError } = await supabase.from('market_orders').select('id').eq('connection_id', connectionId).maybeSingle();
        if (orderError) throw orderError;
        if (!order?.id) throw new Error('The order was reserved, but Aspire could not attach the delivery request. Open Orders to continue.');

        const amountCents = aspirerReward === '5' ? 500 : aspirerReward === '10' ? 1000 : undefined;
        const rewardLabel = aspirerReward === 'free' ? 'Free' : aspirerReward === '5' ? '$5' : aspirerReward === '10' ? '$10' : 'Negotiable';
        const safeDropoff = publicDropoffArea.trim() || `${address.city.trim()}, ${address.state.trim()}`;
        const request = await createRequest({
          kind: aspirerReward === 'free' ? 'community' : 'paid_help',
          category: 'Pickup / errand',
          title: `Deliver ${item.title}`,
          details: `Linked marketplace delivery for “${item.title}”. Pickup area: ${pickupArea.trim() || 'coordinate privately with the seller'}. Drop-off area: ${safeDropoff}. Reward: ${rewardLabel}. Exact delivery address stays private until a helper is chosen.`,
          campusId: campus!.id,
          meeting_label: `${pickupArea.trim() || 'Seller area'} → ${safeDropoff}`,
          amount_cents: amountCents,
          currency: 'USD'
        });

        const compensationMode = aspirerReward === 'free' ? 'free' : aspirerReward === 'negotiable' ? 'discuss' : 'fixed';
        const protectionMode = compensationMode === 'fixed' ? 'aspire' : 'none';
        const { error: linkError } = await supabase.rpc('link_market_delivery_request', {
          p_market_order_id: order.id,
          p_delivery_request_id: request.id,
          p_compensation_mode: compensationMode,
          p_protection_mode: protectionMode,
          p_requested_amount_cents: amountCents || null,
          p_pickup_area: pickupArea.trim() || 'Seller pickup area',
          p_dropoff_area: safeDropoff
        });
        if (linkError) throw linkError;
      }

      const params = new URLSearchParams({ connection: connectionId, delivery: deliveryChoice });
      if (deliveryChoice === 'ship') params.set('shippingPayer', shippingPaidBy);
      if (deliveryChoice === 'meet') params.set('paymentMethod', meetPayment);
      router.push(`/transactions?${params.toString()}`);
    } catch (error) {
      setModalError(error instanceof Error ? error.message : 'Could not continue with this item.');
    } finally {
      setBusy('');
    }
  }

  const itemAmount = deliveryFor?.amount_cents || 0;
  const protectedPayment = deliveryChoice !== 'meet' || meetPayment === 'aspire';
  const itemServiceFee = protectedPayment ? buyerFee(itemAmount, feePolicy) : 0;
  const itemCheckoutTotal = itemAmount + itemServiceFee;
  const fixedAspirerReward = aspirerReward === '5' ? 500 : aspirerReward === '10' ? 1000 : 0;
  const deliveryPaymentFee = deliveryChoice === 'aspirer' && fixedAspirerReward > 0
    ? buyerFee(fixedAspirerReward, feePolicy)
    : 0;
  const estimatedAspirerTotal = itemCheckoutTotal + fixedAspirerReward + deliveryPaymentFee;

  const needsAddress = deliveryChoice === 'ship' || deliveryChoice === 'seller' || deliveryChoice === 'aspirer';
  const addressTitle = deliveryChoice === 'ship' ? 'Shipping address' : deliveryChoice === 'seller' ? 'Delivery address for seller' : 'Delivery address (private)';

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
              <button className={deliveryChoice === 'seller' ? 'active' : ''} onClick={() => chooseDelivery('seller')}>
                <div><b>Ask seller to deliver</b><em>Free / quote</em></div>
                <span>Enter where you need it delivered, then ask the seller.</span>
              </button>
              <button className={deliveryChoice === 'aspirer' ? 'active' : ''} disabled={!supports(deliveryFor, 'aspirer')} onClick={() => chooseDelivery('aspirer')}>
                <div><b>Ask an Aspirer</b><em>Free · $5 · $10 · negotiate</em></div>
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
                <label><input type="radio" name="shipping-payer" checked={shippingPaidBy === 'buyer'} onChange={() => setShippingPaidBy('buyer')} /><span><b>Buyer pays shipping</b><small>The selected carrier rate is added to the protected checkout.</small></span></label>
                <label><input type="radio" name="shipping-payer" checked={shippingPaidBy === 'seller'} onChange={() => setShippingPaidBy('seller')} /><span><b>Seller covers shipping</b><small>The buyer does not pay the carrier rate; it comes from seller proceeds.</small></span></label>
              </div>
            )}

            {needsAddress && (
              <div className="marketV2Config marketV2AddressBlock">
                <div className="marketV2AddressHeading">
                  <h3>{addressTitle}</h3>
                  <span>{deliveryChoice === 'aspirer' ? 'Exact address is kept private from the public delivery post.' : 'Required before continuing.'}</span>
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
                <p>This does not reserve the item yet. The seller can say yes, offer free delivery, or quote a delivery price. Then you return to checkout.</p>
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
                  {(['free','5','10','negotiable'] as AspirerReward[]).map((reward) => (
                    <button type="button" key={reward} className={aspirerReward === reward ? 'active' : ''} onClick={() => setAspirerReward(reward)}>
                      {reward === 'free' ? 'Free' : reward === '5' ? '$5' : reward === '10' ? '$10' : 'Negotiable'}
                    </button>
                  ))}
                </div>
                <p className="marketV2Fine">Only the general area is public. The exact delivery address is stored privately on the order.</p>
              </div>
            )}

            <div className="marketV2Money">
              <div className="marketV2MoneyHead"><span>YOUR COST</span><b>{deliveryChoice === 'seller' ? 'Before seller reply' : protectedPayment ? 'Aspire Protected' : 'Pay in person'}</b></div>
              <div><span>Item</span><strong>{money(itemAmount)}</strong></div>
              {deliveryChoice === 'meet' && <div><span>Meetup delivery</span><strong>$0.00</strong></div>}
              {deliveryChoice === 'ship' && <div><span>Shipping</span><strong>{shippingPaidBy === 'buyer' ? 'Carrier rate added next' : 'Seller covers'}</strong></div>}
              {deliveryChoice === 'seller' && <div><span>Seller delivery</span><strong>Free or seller quote</strong></div>}
              {deliveryChoice === 'aspirer' && <div><span>Aspirer delivery reward</span><strong>{aspirerReward === 'free' ? '$0.00' : aspirerReward === 'negotiable' ? 'Negotiable' : money(fixedAspirerReward)}</strong></div>}
              {protectedPayment && deliveryChoice !== 'seller' && <div><span>Aspire service fee on item</span><strong>{money(itemServiceFee)}</strong></div>}
              {deliveryChoice === 'aspirer' && fixedAspirerReward > 0 && <div><span>Estimated Aspire fee on delivery payment</span><strong>{money(deliveryPaymentFee)}</strong></div>}

              {deliveryChoice === 'aspirer' && fixedAspirerReward > 0 ? (
                <div className="marketV2Total"><span>Estimated all-in total</span><strong>{money(estimatedAspirerTotal)}</strong></div>
              ) : deliveryChoice === 'aspirer' && aspirerReward === 'negotiable' ? (
                <div className="marketV2Total"><span>Item checkout now</span><strong>{money(itemCheckoutTotal)} + agreed delivery</strong></div>
              ) : deliveryChoice === 'ship' && shippingPaidBy === 'buyer' ? (
                <div className="marketV2Total"><span>Estimated total</span><strong>{money(itemCheckoutTotal)} + shipping</strong></div>
              ) : deliveryChoice === 'seller' ? (
                <div className="marketV2Total"><span>Item price</span><strong>{money(itemAmount)} + seller quote</strong></div>
              ) : (
                <div className="marketV2Total"><span>You pay</span><strong>{money(itemCheckoutTotal)}</strong></div>
              )}

              {deliveryChoice === 'aspirer' && fixedAspirerReward > 0 && <small>Item checkout is {money(itemCheckoutTotal)} now. The {money(fixedAspirerReward)} helper reward and its estimated fee are a separate payment after a helper is chosen.</small>}
              {deliveryChoice === 'ship' && shippingPaidBy === 'seller' && <small>The carrier rate will reduce seller proceeds after a shipping rate is selected.</small>}
            </div>

            {modalError && <div className="marketV2ModalError" role="alert">{modalError}</div>}

            <button className="marketV2Primary marketV2Continue" type="button" disabled={busy !== ''} onClick={() => void reserve(deliveryFor)}>
              {busy ? 'Working…' : deliveryChoice === 'seller' ? 'Ask seller about delivery →' : deliveryChoice === 'ship' ? 'Continue to shipping setup →' : deliveryChoice === 'aspirer' ? 'Reserve item + post delivery request →' : meetPayment === 'in_person' ? 'Reserve for meetup →' : 'Continue to protected checkout →'}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
