'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchCampusFeedRequests, type DiscoverRequest } from '../lib/supabase/discovery';
import { fetchActiveUniversities, type University } from '../lib/supabase/universities';
import { respondToRequest } from '../lib/supabase/requests';
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
type FulfillmentMethod = 'campus_pickup' | 'shipping' | 'seller_delivery' | 'aspirer_delivery';
type MarketFilter = 'all' | 'meet' | 'ship' | 'seller' | 'aspirer';
type MarketSort = 'newest' | 'price_asc' | 'price_desc';
type SellerDeliveryMode = 'free' | 'fixed' | 'negotiable';
type ShippingPolicy = 'buyer' | 'seller' | 'either';
type MarketplaceItem = Omit<DiscoverRequest, 'fulfillment_method'> & {
  fulfillment_method?: 'campus_pickup' | 'shipping' | null;
  fulfillment_methods?: FulfillmentMethod[];
  seller_area?: string | null;
  shipping_paid_by_default?: ShippingPolicy | null;
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
  name: '', street1: '', street2: '', city: '', state: '', zip: '', country: 'US', instructions: ''
};

function money(cents: number | null | undefined) {
  if (cents == null) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function methodsFor(item: MarketplaceItem): FulfillmentMethod[] {
  if (Array.isArray(item.fulfillment_methods) && item.fulfillment_methods.length) return item.fulfillment_methods;
  if (item.fulfillment_method === 'shipping') return ['shipping'];
  return ['campus_pickup'];
}

function supports(item: MarketplaceItem, choice: DeliveryChoice) {
  const methods = methodsFor(item);
  if (choice === 'meet') return methods.includes('campus_pickup');
  if (choice === 'ship') return methods.includes('shipping');
  if (choice === 'seller') return methods.includes('seller_delivery');
  return methods.includes('aspirer_delivery');
}

function defaultChoice(item: MarketplaceItem): DeliveryChoice {
  if (supports(item, 'meet')) return 'meet';
  if (supports(item, 'ship')) return 'ship';
  if (supports(item, 'seller')) return 'seller';
  return 'aspirer';
}

function shippingPolicyFor(item: MarketplaceItem): ShippingPolicy {
  const policy = item.shipping_paid_by_default || item.shipping_paid_by_preference;
  return policy === 'seller' || policy === 'either' ? policy : 'buyer';
}

function sellerDeliverySummary(item: MarketplaceItem) {
  if (item.seller_delivery_mode === 'free') return 'Free';
  if (item.seller_delivery_mode === 'fixed' && item.seller_delivery_price_cents != null) return money(item.seller_delivery_price_cents);
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
  return Boolean(address.name?.trim() && address.street1.trim() && address.city.trim() && address.state.trim() && address.zip.trim() && address.country.trim());
}

function sellerAreaComplete(address: AddressState) {
  return Boolean(address.city.trim() && address.state.trim());
}

function conditionLabel(value?: string | null) {
  if (!value) return 'Good';
  return value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function deliveryLabel(method: FulfillmentMethod) {
  if (method === 'campus_pickup') return 'Meet up';
  if (method === 'shipping') return 'Shipping';
  if (method === 'seller_delivery') return 'Seller delivery';
  return 'Aspirer delivery';
}

export default function MarketplaceCheckoutV5() {
  const router = useRouter();
  const [campus, setCampus] = useState<University | null>(null);
  const [viewerId, setViewerId] = useState('');
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
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<MarketFilter>('all');
  const [sort, setSort] = useState<MarketSort>('newest');

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace('/login?next=%2Fmarketplace');
        return;
      }
      setViewerId(data.user.id);

      const [{ data: profile }, universities] = await Promise.all([
        supabase.from('profiles').select('current_campus_id,home_campus_id').eq('id', data.user.id).maybeSingle(),
        fetchActiveUniversities()
      ]);
      const validIds = new Set(universities.map((entry) => entry.id));
      const storedCampusId = window.sessionStorage.getItem('aspire-active-campus-id');
      const campusId = storedCampusId && validIds.has(storedCampusId)
        ? storedCampusId
        : profile?.current_campus_id || profile?.home_campus_id;
      const nextCampus = universities.find((entry) => entry.id === campusId) || universities[0] || null;
      setCampus(nextCampus);

      if (nextCampus) {
        const [{ data: policies }, rows] = await Promise.all([
          supabase.from('fee_policies')
            .select('campus_id,requester_fee_bps,requester_fee_fixed_cents,requester_fee_min_cents,requester_fee_max_cents,provider_fee_bps,updated_at')
            .eq('active', true)
            .order('updated_at', { ascending: false }),
          fetchCampusFeedRequests({ campusId: nextCampus.id, category: 'Buy & sell', limit: 80 })
        ]);

        const eligiblePolicies = (policies || []) as Array<FeePolicy & { updated_at?: string }>;
        setFeePolicy(
          eligiblePolicies.find((entry) => entry.campus_id === nextCampus.id)
          || eligiblePolicies.find((entry) => entry.campus_id == null)
          || null
        );

        const ids = rows.map((item) => item.id);
        let listingMeta = new Map<string, Partial<MarketplaceItem>>();
        if (ids.length) {
          const { data: metaRows } = await supabase.from('requests')
            .select('id,seller_area,fulfillment_method,fulfillment_methods,shipping_paid_by_default,shipping_paid_by_preference,seller_delivery_mode,seller_delivery_price_cents')
            .in('id', ids);
          listingMeta = new Map((metaRows || []).map((row) => [row.id as string, row as Partial<MarketplaceItem>]));
        }

        const visible = (rows as MarketplaceItem[])
          .map((item) => ({ ...item, ...(listingMeta.get(item.id) || {}) }))
          .filter((item) =>
            item.kind === 'buy_sell' &&
            item.market_intent === 'sell' &&
            item.payment_method === 'aspire' &&
            (item.poster_id !== data.user!.id || item.moderation_status === 'approved')
          );
        setItems(visible);

        const directId = new URLSearchParams(window.location.search).get('item') || '';
        setDirectItemId(directId);
        const directItem = directId ? visible.find((item) => item.id === directId) : undefined;
        if (directItem?.poster_id === data.user.id) {
          setNotice('This is your listing. Use My Activity to manage or close it.');
        } else if (directItem) {
          openDelivery(directItem);
        } else if (directId) {
          setNotice('That listing is no longer available on this campus.');
        }
      }
      setLoading(false);
    }).catch((error) => {
      setNotice(error instanceof Error ? error.message : 'Could not load the market.');
      setLoading(false);
    });
  }, [router]);

  useEffect(() => {
    if (!deliveryFor) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setDeliveryFor(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [deliveryFor, busy]);

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const next = items.filter((item) => {
      if (needle && !`${item.title} ${item.details || ''} ${item.category || ''} ${item.seller_area || ''}`.toLowerCase().includes(needle)) return false;
      if (filter === 'meet' && !supports(item, 'meet')) return false;
      if (filter === 'ship' && !supports(item, 'ship')) return false;
      if (filter === 'seller' && !supports(item, 'seller')) return false;
      if (filter === 'aspirer' && !supports(item, 'aspirer')) return false;
      return true;
    });
    return next.sort((a, b) => {
      if (sort === 'price_asc') return (a.amount_cents ?? Number.MAX_SAFE_INTEGER) - (b.amount_cents ?? Number.MAX_SAFE_INTEGER);
      if (sort === 'price_desc') return (b.amount_cents ?? -1) - (a.amount_cents ?? -1);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [items, query, filter, sort]);

  function openItem(item: MarketplaceItem) {
    if (item.poster_id === viewerId) {
      router.push('/activity');
      return;
    }
    openDelivery(item);
  }

  function openDelivery(item: MarketplaceItem) {
    setDeliveryFor(item);
    setDeliveryChoice(defaultChoice(item));
    setMeetPayment('aspire');
    setShippingPaidBy(shippingPolicyFor(item) === 'seller' ? 'seller' : 'buyer');
    setAspirerReward('negotiable');
    setPickupArea(item.seller_area || '');
    setPublicDropoffArea('');
    setAddress(EMPTY_ADDRESS);
    setModalError('');
    setNotice('');
  }

  function chooseDelivery(choice: DeliveryChoice) {
    if (deliveryFor && !supports(deliveryFor, choice)) return;
    setDeliveryChoice(choice);
    setModalError('');
  }

  function requireAddress() {
    if (addressComplete(address)) return true;
    setModalError('Add the delivery address below before continuing.');
    window.setTimeout(() => document.getElementById('market-delivery-name')?.focus(), 0);
    return false;
  }

  function requireSellerArea() {
    if (sellerAreaComplete(address)) return true;
    setModalError('Add the city and state where you want seller delivery.');
    window.setTimeout(() => document.getElementById('market-seller-city')?.focus(), 0);
    return false;
  }

  async function askSeller(item: MarketplaceItem) {
    if (!supports(item, 'seller')) {
      setModalError('Seller delivery is not offered on this listing.');
      return;
    }
    if (!requireSellerArea()) return;
    setBusy(`seller-${item.id}`);
    setModalError('');
    try {
      const instructions = address.instructions.trim() ? ` Notes: ${address.instructions.trim()}.` : '';
      const deliveryTerm = item.seller_delivery_mode === 'free'
        ? 'Your listing says seller delivery is free.'
        : item.seller_delivery_mode === 'fixed' && item.seller_delivery_price_cents != null
          ? `Your listing shows a delivery price of ${money(item.seller_delivery_price_cents)}.`
          : 'Please confirm the delivery price.';
      await respondToRequest(
        item.id,
        `Would you be willing to deliver “${item.title}” to the ${address.city.trim()}, ${address.state.trim().toUpperCase()} area? ${deliveryTerm}${instructions} I’ll share the exact address privately after we agree.`
      );
      setDeliveryFor(null);
      setNotice('Delivery request sent. The exact address was not shared. The item is not reserved until you and the seller agree.');
    } catch (error) {
      setModalError(error instanceof Error ? error.message : 'Could not ask the seller about delivery.');
    } finally {
      setBusy('');
    }
  }

  async function reserve(item: MarketplaceItem) {
    if (!supports(item, deliveryChoice)) {
      setModalError('That delivery method is not offered by this seller.');
      return;
    }
    if (deliveryChoice === 'seller') {
      await askSeller(item);
      return;
    }
    if ((deliveryChoice === 'ship' || deliveryChoice === 'aspirer') && !requireAddress()) return;

    const fulfillmentMethod = deliveryChoice === 'meet'
      ? 'campus_pickup'
      : deliveryChoice === 'ship'
        ? 'shipping'
        : 'aspirer_delivery';
    const paymentMethod: MarketplacePaymentMethod = deliveryChoice === 'meet' ? meetPayment : 'aspire';

    setBusy(item.id);
    setModalError('');
    let reservedConnectionId = '';
    try {
      const connectionId = await purchaseMarketplaceListingWithOptions({
        requestId: item.id,
        fulfillmentMethod,
        paymentMethod,
        shippingPaidBy: deliveryChoice === 'ship' ? shippingPaidBy : null
      });
      reservedConnectionId = connectionId;

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
        if (!order?.id) throw new Error('Aspire could not attach the delivery request to this order.');

        const amountCents = aspirerReward === '5' ? 500 : aspirerReward === '10' ? 1000 : null;
        const safeDropoff = publicDropoffArea.trim() || `${address.city.trim()}, ${address.state.trim()}`;
        const safePickup = pickupArea.trim() || item.seller_area?.trim() || 'Seller pickup area';
        const compensationMode = aspirerReward === 'free' ? 'free' : aspirerReward === 'negotiable' ? 'discuss' : 'fixed';
        const protectionMode = compensationMode === 'fixed' ? 'aspire' : 'none';
        const { error: deliveryRequestError } = await supabase.rpc('create_market_delivery_request_for_order', {
          p_market_order_id: order.id,
          p_compensation_mode: compensationMode,
          p_protection_mode: protectionMode,
          p_requested_amount_cents: amountCents,
          p_pickup_area: safePickup,
          p_dropoff_area: safeDropoff
        });
        if (deliveryRequestError) throw deliveryRequestError;
      }

      const params = new URLSearchParams({ connection: connectionId, delivery: deliveryChoice });
      if (deliveryChoice === 'ship') params.set('shippingPayer', shippingPaidBy);
      if (deliveryChoice === 'meet') params.set('paymentMethod', meetPayment);
      router.push(`/transactions?${params.toString()}`);
    } catch (error) {
      if (deliveryChoice === 'aspirer' && reservedConnectionId) {
        const supabase = getSupabaseBrowserClient();
        try {
          await supabase.rpc('cancel_unpaid_marketplace_reservation', { p_connection_id: reservedConnectionId });
        } catch {
          // Best-effort cleanup only. The original error is more useful to the buyer.
        }
      }
      const raw = error instanceof Error ? error.message : '';
      setModalError(/permission denied|row-level security|MONEY_AMOUNT_REQUIRED|POST_NOT_ALLOWED/i.test(raw)
        ? 'Could not create the Aspirer delivery request. No payment was taken. Please try again.'
        : raw || 'Could not continue with this item.');
    } finally {
      setBusy('');
    }
  }

  const itemAmount = deliveryFor?.amount_cents || 0;
  const protectedPayment = deliveryChoice !== 'meet' || meetPayment === 'aspire';
  const itemServiceFee = protectedPayment ? buyerFee(itemAmount, feePolicy) : 0;
  const itemCheckoutTotal = itemAmount + itemServiceFee;
  const fixedAspirerReward = aspirerReward === '5' ? 500 : aspirerReward === '10' ? 1000 : 0;
  const deliveryPaymentFee = deliveryChoice === 'aspirer' && fixedAspirerReward > 0 ? buyerFee(fixedAspirerReward, feePolicy) : 0;
  const estimatedAspirerTotal = itemCheckoutTotal + fixedAspirerReward + deliveryPaymentFee;
  const needsAddress = deliveryChoice === 'ship' || deliveryChoice === 'aspirer';
  const addressTitle = deliveryChoice === 'ship' ? 'Shipping address' : 'Delivery address (private)';
  const activeShippingPolicy = deliveryFor ? shippingPolicyFor(deliveryFor) : 'buyer';

  return (
    <main className="marketV4Page">
      <AppDock active="market" />
      <div className="marketV4Shell">
        <header className="marketV4Hero marketV4HeroEditorial">
          <div className="marketV4HeroLead">
            <div className="marketV4HeroCopy">
              <div className="marketV4Kicker"><span>FRESH ON CAMPUS</span><b>{campus?.short_name || 'CAMPUS'}</b></div>
              <h1>Good finds,<br /><em>right around {campus?.short_name || 'campus'}.</em></h1>
              <span>Student-to-student listings with pickup, shipping, and delivery options shown upfront.</span>
            </div>
            <div className="marketV4HeroActions">
              <a className="marketV4GhostAction" href="/transactions"><UiIcon name="wallet" />Orders</a>
              <a className="marketV4PrimaryAction" href="/post?mode=sell"><UiIcon name="plus" />Sell something</a>
            </div>
          </div>

          <label className="marketV4HeroSearch">
            <UiIcon name="search" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${campus?.short_name || 'campus'} Market`} aria-label="Search marketplace listings" />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search">×</button>}
          </label>

          <div className="marketV4HeroTools">
            <div className="marketV4Filters" aria-label="Delivery filters">
              {([
                ['all', 'Everything'], ['meet', 'Meetup'], ['ship', 'Ships'], ['seller', 'Seller delivery'], ['aspirer', 'Aspirer delivery']
              ] as Array<[MarketFilter, string]>).map(([value, label]) => (
                <button key={value} type="button" className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} aria-pressed={filter === value}>{label}</button>
              ))}
            </div>
            <label className="marketV4Sort">
              <span>Sort</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as MarketSort)}>
                <option value="newest">Freshest</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
              </select>
            </label>
          </div>
        </header>

        {notice && <div className="marketV4Notice" role="status">{notice}</div>}

        <div className="marketV4ResultMeta">
          <div><strong>{loading ? 'Loading the Market…' : `${visibleItems.length} ${visibleItems.length === 1 ? 'find' : 'finds'}`}</strong><span>{campus?.name || 'Your campus'} student market</span></div>
          <a href="/post?mode=sell">List yours <span>↗</span></a>
        </div>

        {loading ? (
          <div className="marketV4SkeletonGrid" aria-label="Loading listings">{[0,1,2,3].map((item) => <div className="marketV4Skeleton" key={item}><i /><span /><span /><b /></div>)}</div>
        ) : visibleItems.length ? (
          <div className="marketV4Grid">
            {visibleItems.map((item) => {
              const media = item.media?.[0]?.public_url || item.cover_image_url;
              const methods = methodsFor(item);
              const ownListing = item.poster_id === viewerId;
              return (
                <article className={`marketV4Product ${ownListing ? 'marketV4OwnProduct' : ''}`} key={item.id}>
                  <button className="marketV4CardHit" type="button" aria-label={ownListing ? `Manage your listing ${item.title}` : `View ${item.title}`} onClick={() => openItem(item)} />
                  <div className="marketV4Media">
                    {media ? <img src={media} alt={item.title} /> : <UiIcon name="tag" />}
                    <div className="marketV4MediaTop"><span>{ownListing ? 'Your listing' : item.id === directItemId ? 'Selected' : conditionLabel(item.item_condition)}</span>{item.price_negotiable && <b>Negotiable</b>}</div>
                  </div>
                  <div className="marketV4Body">
                    <div className="marketV4TitleRow"><h2>{item.title}</h2><strong>{money(item.amount_cents)}</strong></div>
                    <p>{item.details || 'Student listing on Aspire Market.'}</p>
                    <div className="marketV4Badges">
                      {item.seller_area && <span>📍 {item.seller_area}</span>}
                      <span>{conditionLabel(item.item_condition)}</span>
                      {methods.map((method) => <span key={method}>{deliveryLabel(method)}{method === 'seller_delivery' ? ` · ${sellerDeliverySummary(item)}` : ''}</span>)}
                    </div>
                    <button className={`marketV4Buy ${ownListing ? 'marketV4Manage' : ''}`} type="button" onClick={() => openItem(item)}>{ownListing ? 'Manage listing' : 'View item'} <span>↗</span></button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="marketV4Empty">
            <UiIcon name="search" /><span>NO LISTINGS MATCH</span>
            <h2>{query ? `Nothing matched “${query}”.` : 'Nothing matches this delivery filter yet.'}</h2>
            <p>Clear the filters or be the first student to list something here.</p>
            <div><button type="button" onClick={() => { setQuery(''); setFilter('all'); setSort('newest'); }}>Clear filters</button><a href="/post?mode=sell">Sell an item →</a></div>
          </div>
        )}
      </div>

      {deliveryFor && (
        <div className="marketV4Backdrop" role="dialog" aria-modal="true" aria-label="Choose how to receive this item" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDeliveryFor(null); }}>
          <section className="marketV4Checkout">
            <button className="marketV4Close" type="button" aria-label="Close" disabled={Boolean(busy)} onClick={() => setDeliveryFor(null)}>×</button>
            <div className="marketV4CheckoutHead">
              <div className="marketV4MiniItem">
                {deliveryFor.media?.[0]?.public_url || deliveryFor.cover_image_url
                  ? <img src={deliveryFor.media?.[0]?.public_url || deliveryFor.cover_image_url || ''} alt="" />
                  : <UiIcon name="tag" />}
              </div>
              <div><p>BUY NOW · DELIVERY + PAYMENT</p><h2>How do you want to get it?</h2><span>{deliveryFor.title} · {money(itemAmount)}</span>{deliveryFor.seller_area && <span>📍 Seller area: {deliveryFor.seller_area}</span>}</div>
            </div>

            <div className={`marketV4ProtectionBar ${protectedPayment && deliveryChoice !== 'seller' ? 'protected' : 'unprotected'}`}>
              <i>{protectedPayment && deliveryChoice !== 'seller' ? '✓' : 'i'}</i>
              <div>
                <strong>{deliveryChoice === 'seller'
                  ? 'No charge yet'
                  : protectedPayment
                    ? 'Aspire Protected · Stripe checkout'
                    : 'Pay in person · no Aspire payment protection'}</strong>
                <span>{deliveryChoice === 'seller'
                  ? 'The seller must agree to delivery first. If protected checkout is used later, seller payout verification is re-checked before payment opens.'
                  : protectedPayment
                    ? 'Before Stripe checkout opens, Aspire re-checks that the seller is eligible to receive payouts. Payment, refund, and dispute status stay attached to the order.'
                    : 'You pay the seller directly at meetup. Aspire does not process or protect that payment.'}</span>
              </div>
            </div>

            <div className="marketV4Choices">
              {supports(deliveryFor, 'meet') && <button type="button" className={deliveryChoice === 'meet' ? 'active' : ''} onClick={() => chooseDelivery('meet')}><div><b>Meet up</b><em>Delivery $0</em></div><span>{deliveryFor.seller_area ? `Meet in the ${deliveryFor.seller_area} area.` : 'Meet the seller on campus or nearby.'}</span></button>}
              {supports(deliveryFor, 'ship') && <button type="button" className={deliveryChoice === 'ship' ? 'active' : ''} onClick={() => chooseDelivery('ship')}><div><b>Ship to me</b><em>+ carrier rate</em></div><span>{activeShippingPolicy === 'seller' ? 'Seller covers the carrier rate.' : activeShippingPolicy === 'either' ? 'Buyer or seller can cover shipping.' : 'Buyer covers the carrier rate.'}</span></button>}
              {supports(deliveryFor, 'seller') && <button type="button" className={deliveryChoice === 'seller' ? 'active' : ''} onClick={() => chooseDelivery('seller')}><div><b>Ask seller to deliver</b><em>{sellerDeliverySummary(deliveryFor)}</em></div><span>Share only your city/state first. Exact address stays private until you agree.</span></button>}
              {supports(deliveryFor, 'aspirer') && <button type="button" className={deliveryChoice === 'aspirer' ? 'active' : ''} onClick={() => chooseDelivery('aspirer')}><div><b>Ask an Aspirer</b><em>Flexible reward</em></div><span>Another student picks it up and brings it to you.</span></button>}
            </div>

            {deliveryChoice === 'meet' && <div className="marketV4Config"><h3>How do you want to pay?</h3><label><input type="radio" name="meet-pay" checked={meetPayment === 'aspire'} onChange={() => setMeetPayment('aspire')} /><span><b>Aspire Protected</b><small>Pay online with a payment trail, refund/dispute tools, and seller payout in Aspire.</small></span></label><label><input type="radio" name="meet-pay" checked={meetPayment === 'in_person'} onChange={() => setMeetPayment('in_person')} /><span><b>Pay in person</b><small>Pay when you meet. No Aspire payment protection or Stripe checkout.</small></span></label></div>}

            {deliveryChoice === 'ship' && <div className="marketV4Config"><h3>Who covers shipping?</h3>{activeShippingPolicy !== 'seller' && <label><input type="radio" name="shipping-payer" checked={shippingPaidBy === 'buyer'} onChange={() => setShippingPaidBy('buyer')} /><span><b>Buyer pays shipping</b><small>The selected carrier rate is added to protected checkout.</small></span></label>}{activeShippingPolicy !== 'buyer' && <label><input type="radio" name="shipping-payer" checked={shippingPaidBy === 'seller'} onChange={() => setShippingPaidBy('seller')} /><span><b>Seller covers shipping</b><small>The carrier rate comes out of seller proceeds.</small></span></label>}</div>}

            {needsAddress && <div className="marketV4Config marketV4AddressBlock"><div className="marketV4AddressHeading"><h3>{addressTitle}</h3><span>{deliveryChoice === 'aspirer' ? 'Exact address stays private from the public delivery post.' : 'Required before continuing.'}</span></div><div className="marketV4AddressGrid"><label className="wide"><span>Recipient name *</span><input id="market-delivery-name" value={address.name || ''} onChange={(event) => setAddress((value) => ({ ...value, name: event.target.value }))} placeholder="Full name" /></label><label className="wide"><span>Street address *</span><input value={address.street1} onChange={(event) => setAddress((value) => ({ ...value, street1: event.target.value }))} placeholder="123 Main St" /></label><label className="wide"><span>Apt / dorm / room</span><input value={address.street2 || ''} onChange={(event) => setAddress((value) => ({ ...value, street2: event.target.value }))} placeholder="Optional" /></label><label><span>City *</span><input value={address.city} onChange={(event) => setAddress((value) => ({ ...value, city: event.target.value }))} placeholder="City" /></label><label><span>State *</span><input value={address.state} onChange={(event) => setAddress((value) => ({ ...value, state: event.target.value.toUpperCase() }))} placeholder="IN" maxLength={2} /></label><label><span>ZIP *</span><input value={address.zip} onChange={(event) => setAddress((value) => ({ ...value, zip: event.target.value }))} placeholder="ZIP" /></label><label><span>Country *</span><input value={address.country} onChange={(event) => setAddress((value) => ({ ...value, country: event.target.value.toUpperCase() }))} placeholder="US" maxLength={2} /></label><label className="wide"><span>Delivery instructions</span><input value={address.instructions} onChange={(event) => setAddress((value) => ({ ...value, instructions: event.target.value }))} placeholder="Front desk, call on arrival, etc." /></label></div></div>}

            {deliveryChoice === 'seller' && <div className="marketV4Config marketV4SellerAsk"><h3>Ask before you buy</h3><p>Only give the seller a general delivery area first. This does not reserve the item and your exact address is not shared.</p><div className="marketV4TwoCols"><label><span>Delivery city *</span><input id="market-seller-city" value={address.city} onChange={(event) => setAddress((value) => ({ ...value, city: event.target.value }))} placeholder="West Lafayette" /></label><label><span>State *</span><input value={address.state} onChange={(event) => setAddress((value) => ({ ...value, state: event.target.value.toUpperCase() }))} placeholder="IN" maxLength={2} /></label></div><label><span>Optional note</span><input value={address.instructions} onChange={(event) => setAddress((value) => ({ ...value, instructions: event.target.value }))} placeholder="Near campus, evening preferred, etc." /></label></div>}

            {deliveryChoice === 'aspirer' && <div className="marketV4Config"><h3>Set up the public delivery request</h3>{deliveryFor.seller_area && <p className="marketV4Fine">Seller area: <b>{deliveryFor.seller_area}</b>. This is intentionally only city/state; exact pickup is coordinated privately.</p>}<div className="marketV4TwoCols"><label><span>Pickup area (public)</span><input value={pickupArea} onChange={(event) => setPickupArea(event.target.value)} placeholder={deliveryFor.seller_area || 'Seller / campus area'} /></label><label><span>Drop-off area shown publicly</span><input value={publicDropoffArea} onChange={(event) => setPublicDropoffArea(event.target.value)} placeholder="e.g. library area" /></label></div><div className="marketV4RewardRow">{(['free','5','10','negotiable'] as AspirerReward[]).map((reward) => <button type="button" key={reward} className={aspirerReward === reward ? 'active' : ''} onClick={() => setAspirerReward(reward)}>{reward === 'free' ? 'Free' : reward === '5' ? '$5' : reward === '10' ? '$10' : 'Negotiable'}</button>)}</div><p className="marketV4Fine">Only general areas are public. The buyer’s exact delivery address stays private on the order.</p></div>}

            <div className="marketV4Money">
              <div className="marketV4MoneyHead"><span>YOUR COST</span><b>{deliveryChoice === 'seller' ? 'Before seller reply' : protectedPayment ? 'Aspire Protected' : 'Pay in person'}</b></div>
              <div><span>Item</span><strong>{money(itemAmount)}</strong></div>
              {deliveryChoice === 'meet' && <div><span>Meetup delivery</span><strong>$0.00</strong></div>}
              {deliveryChoice === 'ship' && <div><span>Shipping</span><strong>{shippingPaidBy === 'buyer' ? 'Carrier rate added next' : 'Seller covers'}</strong></div>}
              {deliveryChoice === 'seller' && <div><span>Seller delivery</span><strong>{sellerDeliverySummary(deliveryFor)}</strong></div>}
              {deliveryChoice === 'aspirer' && <div><span>Aspirer delivery reward</span><strong>{aspirerReward === 'free' ? '$0.00' : aspirerReward === 'negotiable' ? 'Negotiable' : money(fixedAspirerReward)}</strong></div>}
              {protectedPayment && deliveryChoice !== 'seller' && <div><span>Aspire service fee on item</span><strong>{money(itemServiceFee)}</strong></div>}
              {deliveryChoice === 'aspirer' && fixedAspirerReward > 0 && <div><span>Estimated Aspire fee on delivery payment</span><strong>{money(deliveryPaymentFee)}</strong></div>}
              {deliveryChoice === 'aspirer' && fixedAspirerReward > 0 ? <div className="marketV4Total"><span>Estimated all-in total</span><strong>{money(estimatedAspirerTotal)}</strong></div> : deliveryChoice === 'aspirer' && aspirerReward === 'negotiable' ? <div className="marketV4Total"><span>Item checkout now</span><strong>{money(itemCheckoutTotal)} + agreed delivery</strong></div> : deliveryChoice === 'ship' && shippingPaidBy === 'buyer' ? <div className="marketV4Total"><span>Estimated total</span><strong>{money(itemCheckoutTotal)} + shipping</strong></div> : deliveryChoice === 'seller' ? <div className="marketV4Total"><span>Item price</span><strong>{money(itemAmount)}{deliveryFor.seller_delivery_mode === 'fixed' && deliveryFor.seller_delivery_price_cents ? ` + ${money(deliveryFor.seller_delivery_price_cents)} delivery` : deliveryFor.seller_delivery_mode === 'free' ? ' + free delivery' : ' + agreed delivery'}</strong></div> : <div className="marketV4Total"><span>You pay</span><strong>{money(itemCheckoutTotal)}</strong></div>}
              {deliveryChoice === 'aspirer' && fixedAspirerReward > 0 && <small>Item checkout is {money(itemCheckoutTotal)} now. The helper reward is a separate payment after a helper is chosen.</small>}
              {deliveryChoice === 'ship' && shippingPaidBy === 'seller' && <small>The carrier rate will reduce seller proceeds after a shipping rate is selected.</small>}
            </div>

            {modalError && <div className="marketV4ModalError" role="alert">{modalError}</div>}
            <button className="marketV4Continue" type="button" disabled={busy !== ''} onClick={() => void reserve(deliveryFor)}>{busy ? 'Working…' : deliveryChoice === 'seller' ? 'Ask seller about delivery →' : deliveryChoice === 'ship' ? 'Continue to shipping setup →' : deliveryChoice === 'aspirer' ? 'Reserve item + post delivery request →' : meetPayment === 'in_person' ? 'Reserve for meetup →' : 'Continue to protected checkout →'}</button>
          </section>
        </div>
      )}
    </main>
  );
}
