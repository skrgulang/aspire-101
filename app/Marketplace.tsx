'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchCampusFeedRequests, type DiscoverRequest } from '../lib/supabase/discovery';
import { fetchActiveUniversities, type University } from '../lib/supabase/universities';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import {
  fetchListingFulfillmentMethods,
  purchaseMarketplaceListingFlexible,
  type DeliveryRewardMode,
  type FlexibleFulfillmentMethod
} from '../lib/supabase/marketplacePurchase';
import AppDock from './AppDock';
import UiIcon from './UiIcon';
import flexible from './MarketplaceFlexible.module.css';

type CartItem = { id: string; title: string; amountCents: number; image: string; campus: string; paymentMethod: 'aspire' };
type MarketListing = DiscoverRequest & { fulfillment_methods?: FlexibleFulfillmentMethod[] };
type RewardPreset = 'free' | '500' | '1000' | 'custom' | 'negotiable';
const CART_KEY = 'aspire-market-cart';

function money(cents: number | null | undefined) {
  return cents == null ? 'Price on request' : new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function expiry(item: DiscoverRequest) {
  return item.listing_expires_at || new Date(new Date(item.created_at).getTime() + 7 * 86400000).toISOString();
}

function availableMethods(item: MarketListing): FlexibleFulfillmentMethod[] {
  if (item.fulfillment_methods?.length) return item.fulfillment_methods;
  const legacy = item.fulfillment_method === 'shipping' ? 'shipping' : 'campus_pickup';
  return [legacy];
}

function methodLabel(method: FlexibleFulfillmentMethod) {
  if (method === 'shipping') return 'Carrier shipping';
  if (method === 'aspirer_delivery') return 'Aspirer delivery';
  return 'Local meetup';
}

function methodIcon(method: FlexibleFulfillmentMethod) {
  if (method === 'shipping') return '▣';
  if (method === 'aspirer_delivery') return '↗';
  return '♢';
}

function Countdown({ until }: { until: string }) {
  const [left, setLeft] = useState(() => Math.max(0, new Date(until).getTime() - Date.now()));
  useEffect(() => {
    const timer = window.setInterval(() => setLeft(Math.max(0, new Date(until).getTime() - Date.now())), 1000);
    return () => window.clearInterval(timer);
  }, [until]);
  if (!left) return <span className="marketCountdown expired">Listing ended</span>;
  const hours = Math.floor(left / 3600000);
  const days = Math.floor(hours / 24);
  return <span className="marketCountdown">Ends in {days ? `${days}d ${hours % 24}h` : `${hours}h ${Math.floor((left % 3600000) / 60000)}m`}</span>;
}

export default function Marketplace() {
  const router = useRouter();
  const [campus, setCampus] = useState<University | null>(null);
  const [items, setItems] = useState<MarketListing[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selected, setSelected] = useState<MarketListing | null>(null);
  const [checkout, setCheckout] = useState<MarketListing | null>(null);
  const [fulfillment, setFulfillment] = useState<FlexibleFulfillmentMethod>('campus_pickup');
  const [pickupArea, setPickupArea] = useState('');
  const [dropoffArea, setDropoffArea] = useState('');
  const [preferredAt, setPreferredAt] = useState('');
  const [rewardPreset, setRewardPreset] = useState<RewardPreset>('negotiable');
  const [customReward, setCustomReward] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [checkoutError, setCheckoutError] = useState('');

  useEffect(() => {
    try { setCart(JSON.parse(window.localStorage.getItem(CART_KEY) || '[]')); } catch { setCart([]); }
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace('/login?next=%2Fmarketplace'); return; }
      const [{ data: profile }, universities] = await Promise.all([
        supabase.from('profiles').select('current_campus_id,home_campus_id').eq('id', data.user.id).maybeSingle(),
        fetchActiveUniversities()
      ]);
      const campusId = profile?.current_campus_id || profile?.home_campus_id;
      const nextCampus = universities.find((entry) => entry.id === campusId) || universities[0] || null;
      setCampus(nextCampus);
      if (nextCampus) {
        try {
          const rows = await fetchCampusFeedRequests({ campusId: nextCampus.id, category: 'Buy & sell', limit: 60 });
          const filtered = rows.filter((item) => item.kind === 'buy_sell' && item.market_intent === 'sell' && item.payment_method === 'aspire' && item.poster_id !== data.user.id);
          const methods = await fetchListingFulfillmentMethods(filtered.map((item) => item.id));
          setItems(filtered.map((item) => ({ ...item, fulfillment_methods: methods.get(item.id)?.fulfillment_methods || [item.fulfillment_method === 'shipping' ? 'shipping' : 'campus_pickup'] })));
        } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not load listings.'); }
      }
      setLoading(false);
    }).catch(() => { setNotice('Could not load your campus.'); setLoading(false); });
  }, [router]);

  const total = useMemo(() => cart.reduce((sum, item) => sum + item.amountCents, 0), [cart]);
  function persist(next: CartItem[]) { setCart(next); window.localStorage.setItem(CART_KEY, JSON.stringify(next)); }

  function addToCart(item: MarketListing) {
    if (cart.some((entry) => entry.id === item.id)) { setNotice('Already in your cart.'); return; }
    persist([...cart, { id: item.id, title: item.title, amountCents: item.amount_cents || 0, image: item.media?.[0]?.public_url || item.cover_image_url || '', campus: campus?.short_name || '', paymentMethod: 'aspire' }]);
    setNotice('Added to cart. You can keep browsing or choose Buy now when ready.');
  }

  function beginCheckout(item: MarketListing) {
    const methods = availableMethods(item);
    setCheckout(item);
    setSelected(null);
    setFulfillment(methods[0] || 'campus_pickup');
    setPickupArea(item.meeting_label || `${campus?.short_name || 'Campus'} area`);
    setDropoffArea('');
    setPreferredAt('');
    setRewardPreset('negotiable');
    setCustomReward('');
    setCheckoutError('');
  }

  function rewardChoice(): { mode: DeliveryRewardMode; cents: number | null } {
    if (rewardPreset === 'free') return { mode: 'free', cents: 0 };
    if (rewardPreset === 'negotiable') return { mode: 'negotiable', cents: null };
    if (rewardPreset === '500') return { mode: 'fixed', cents: 500 };
    if (rewardPreset === '1000') return { mode: 'fixed', cents: 1000 };
    const dollars = Number(customReward);
    return { mode: 'fixed', cents: Number.isFinite(dollars) ? Math.round(dollars * 100) : 0 };
  }

  async function submitCheckout() {
    if (!checkout) return;
    const methods = availableMethods(checkout);
    if (!methods.includes(fulfillment)) {
      setCheckoutError('The seller did not offer that fulfillment method.');
      return;
    }
    const reward = rewardChoice();
    if (fulfillment === 'aspirer_delivery') {
      if (pickupArea.trim().length < 2 || dropoffArea.trim().length < 2) {
        setCheckoutError('Add a public pickup area and drop-off area. Exact addresses stay private until a match.');
        return;
      }
      if (reward.mode === 'fixed' && (!reward.cents || reward.cents <= 0)) {
        setCheckoutError('Enter a paid delivery reward greater than $0.');
        return;
      }
    }

    setBusy(checkout.id);
    setCheckoutError('');
    try {
      const result = await purchaseMarketplaceListingFlexible({
        requestId: checkout.id,
        fulfillmentMethod: fulfillment,
        pickupArea: fulfillment === 'aspirer_delivery' ? pickupArea.trim() : null,
        dropoffArea: fulfillment === 'aspirer_delivery' ? dropoffArea.trim() : null,
        rewardMode: fulfillment === 'aspirer_delivery' ? reward.mode : null,
        rewardCents: fulfillment === 'aspirer_delivery' ? reward.cents : null,
        preferredAt: fulfillment === 'aspirer_delivery' && preferredAt ? new Date(preferredAt).toISOString() : null
      });
      setItems((current) => current.filter((item) => item.id !== checkout.id));
      persist(cart.filter((item) => item.id !== checkout.id));
      setCheckout(null);
      if (result.delivery_job_id) {
        router.push(`/delivery?job=${encodeURIComponent(result.delivery_job_id)}`);
      } else {
        router.push(`/transactions?connection=${encodeURIComponent(result.connection_id)}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'This listing is no longer available.';
      setCheckoutError(/FULFILLMENT_UNAVAILABLE/i.test(message) ? 'That delivery method is no longer available for this listing.' : message);
    } finally {
      setBusy('');
    }
  }

  return <main className="marketplacePage"><AppDock active="discover" />
    <div className="marketplaceShell">
      <header className="marketplaceHeader"><div><p className="eyebrow">ASPIRE MARKET · {campus?.short_name || 'CAMPUS'}</p><h1>Buy from people on your campus.</h1><p>Choose meetup, carrier shipping, or an Aspirer when the seller offers it. Aspire keeps the order, payment, fulfillment choice, and safety trail connected.</p></div><div className="marketProductActions"><a className={flexible.deliveryLink} href="/delivery">Post a Delivery / Errand</a><a className="marketCartButton" href="#cart"><UiIcon name="cart" /> Cart <b>{cart.length}</b></a></div></header>
      <div className="marketplaceExplainer"><div><strong>Flexible fulfillment</strong><span>The seller chooses which delivery methods they accept; you choose from those options at checkout.</span></div><div><strong>Aspire Protected</strong><span>Item payment stays separate from any paid Aspirer delivery reward, so each money flow has its own record.</span></div></div>
      {notice && <div className="marketplaceNotice" role="status">{notice}</div>}
      {loading ? <div className="marketplaceEmpty">Loading campus listings…</div> : !items.length ? <div className="marketplaceEmpty"><UiIcon name="tag" /><h2>No listings yet</h2><p>Be the first person to post something for sale.</p><a className="button buttonGold" href="/post">Post an item →</a></div> : <div className="marketGrid">{items.map((item) => <article className="marketProduct" key={item.id}>
        <button className="marketProductMedia" type="button" onClick={() => setSelected(item)}>{item.media?.[0]?.public_url || item.cover_image_url ? <img src={item.media?.[0]?.public_url || item.cover_image_url || ''} alt="" /> : <UiIcon name="tag" />}<span>Buy & sell</span></button>
        <div className="marketProductBody"><button className="marketProductTitle" type="button" onClick={() => setSelected(item)}>{item.title}</button><strong>{money(item.amount_cents)}</strong><small>{item.item_condition?.replace('_', ' ') || 'Good condition'}</small><div className={flexible.methods}>{availableMethods(item).map((method) => <span className={flexible.methodPill} key={method}>{methodLabel(method)}</span>)}</div><span className="marketProtectionBadge">Aspire Protected checkout</span><Countdown until={expiry(item)} /><div className="marketProductActions"><button type="button" className="marketAdd" onClick={() => addToCart(item)}>Add to cart</button><button type="button" className="button buttonGold" onClick={() => beginCheckout(item)}>Buy now</button></div></div>
      </article>)}</div>}
      <section id="cart" className="marketCart"><div><p className="eyebrow">YOUR CART</p><h2>Ready when you are.</h2><p>Cart is for browsing. Nothing is reserved until you choose a fulfillment method and continue with the protected order.</p></div>{cart.length ? <><div className="marketCartItems">{cart.map((item) => <div key={item.id}><span>{item.title}<small>Aspire Protected</small></span><strong>{money(item.amountCents)}</strong><button type="button" onClick={() => persist(cart.filter((entry) => entry.id !== item.id))}>Remove</button></div>)}</div><div className="marketCartTotal"><span>Subtotal</span><strong>{money(total)}</strong><button className="button buttonGold" type="button" onClick={() => { const listing = items.find((item) => item.id === cart[0]?.id); if (listing) beginCheckout(listing); else setNotice('Open the listing to buy it — availability is checked again at checkout.'); }}>Checkout first item</button></div></> : <span className="marketCartEmpty">Your cart is empty.</span>}</section>
    </div>

    {selected && <div className="marketModalBackdrop" role="dialog" aria-modal="true"><div className="marketModal"><button type="button" className="marketModalClose" onClick={() => setSelected(null)} aria-label="Close">×</button><p className="eyebrow">LISTING DETAILS</p><h2>{selected.title}</h2><strong className="marketModalPrice">{money(selected.amount_cents)}</strong><Countdown until={expiry(selected)} /><p>{selected.details || 'Seller has not added more details yet.'}</p><div className="marketModalFacts"><span>Condition <b>{selected.item_condition?.replace('_', ' ') || 'Good'}</b></span><span>Fulfillment <b>{availableMethods(selected).map(methodLabel).join(' · ')}</b></span><span>Payment <b>Online · Aspire Protected</b></span></div><div className="marketProductActions"><button className="marketAdd" type="button" onClick={() => addToCart(selected)}>Add to cart</button><button className="button buttonGold" type="button" onClick={() => beginCheckout(selected)}>Choose delivery →</button></div></div></div>}

    {checkout && <div className={flexible.checkoutBackdrop} role="dialog" aria-modal="true" aria-label="Choose delivery method"><div className={flexible.checkout}>
      <button className={flexible.close} type="button" onClick={() => setCheckout(null)} aria-label="Close">×</button>
      <p className={flexible.eyebrow}>CHOOSE DELIVERY</p>
      <h2>How do you want to receive it?</h2>
      <p className={flexible.subtle}>Choose from the methods this seller accepts. You can discuss exact handoff details after the order or delivery match is created.</p>
      <div className={flexible.itemBar}><strong>{checkout.title}</strong><strong>{money(checkout.amount_cents)}</strong></div>

      <div className={flexible.optionList}>
        {([
          ['campus_pickup', 'Meet up · Local pickup', 'Free · Meet the seller on campus or nearby.'],
          ['shipping', 'Ship to me', 'Carrier rates via Shippo · compare available USPS, UPS, FedEx, and other enabled services in the order flow.'],
          ['aspirer_delivery', 'Ask an Aspirer to deliver', 'Flexible · Free, paid, or negotiable. Nearby verified Aspirers can offer to help.']
        ] as [FlexibleFulfillmentMethod, string, string][]).map(([method, label, description]) => {
          const enabled = availableMethods(checkout).includes(method);
          return <button key={method} type="button" disabled={!enabled} onClick={() => { setFulfillment(method); setCheckoutError(''); }} className={`${flexible.option} ${fulfillment === method ? flexible.optionActive : ''}`}>
            <span className={flexible.icon}>{methodIcon(method)}</span><span><strong>{label}</strong><small>{enabled ? description : 'This seller did not offer this method.'}</small></span><span className={flexible.radio} />
          </button>;
        })}
      </div>

      {fulfillment === 'shipping' && <div className={flexible.section}>
        <h3>Carrier shipping</h3>
        <div className={flexible.info}><strong>Shippo is already connected to the order flow.</strong> After the item is reserved, open Transactions to enter shipping details and compare enabled carrier rates before the shipping label is purchased. The carrier charge is tracked separately from the item price.</div>
      </div>}

      {fulfillment === 'aspirer_delivery' && <div className={flexible.section}>
        <h3>Ask the Aspire Network</h3>
        <div className={flexible.twoCol}>
          <label className={flexible.field}>Public pickup area<input className={flexible.input} value={pickupArea} onChange={(event) => setPickupArea(event.target.value)} placeholder="Hillenbrand Hall area" maxLength={160} /></label>
          <label className={flexible.field}>Public drop-off area<input className={flexible.input} value={dropoffArea} onChange={(event) => setDropoffArea(event.target.value)} placeholder="WALC area" maxLength={160} /></label>
        </div>
        <label className={flexible.field}>Preferred time<input className={flexible.input} type="datetime-local" value={preferredAt} onChange={(event) => setPreferredAt(event.target.value)} /></label>
        <div className={flexible.field}>Reward for Aspirer<div className={flexible.rewardRow}>{([
          ['free', 'Free / Volunteer'], ['500', '$5'], ['1000', '$10'], ['custom', 'Custom'], ['negotiable', 'Negotiable']
        ] as [RewardPreset, string][]).map(([value, label]) => <button className={`${flexible.reward} ${rewardPreset === value ? flexible.rewardActive : ''}`} key={value} type="button" onClick={() => setRewardPreset(value)}>{label}</button>)}</div></div>
        {rewardPreset === 'custom' && <label className={flexible.field}>Custom reward<input className={flexible.input} type="number" min="0.01" step="0.01" value={customReward} onChange={(event) => setCustomReward(event.target.value)} placeholder="6.00" /></label>}
        <div className={flexible.info}><strong>Address privacy:</strong> only these coarse areas are public. Exact pickup/drop-off instructions unlock after an Aspirer is matched. Free help never goes through Stripe. A paid reward becomes its own Aspire Protected connection and must be secured before pickup.</div>
      </div>}

      {fulfillment === 'campus_pickup' && <div className={flexible.section}><div className={flexible.info}><strong>Local meetup is free.</strong> Use the order connection to agree on a safe campus handoff. No delivery reward or carrier charge is created.</div></div>}

      {checkoutError && <div className={flexible.error}>{checkoutError}</div>}
      <div className={flexible.total}><span>Item price</span><strong>{money(checkout.amount_cents)}</strong></div>
      {fulfillment === 'aspirer_delivery' && <div className={flexible.info}>Delivery reward: <strong>{rewardChoice().mode === 'negotiable' ? 'Negotiable after posting' : rewardChoice().mode === 'free' ? 'Free / Volunteer' : money(rewardChoice().cents)}</strong>. It is a separate ledger from the item payment.</div>}
      <div className={flexible.actions}><button className={flexible.secondary} type="button" onClick={() => setCheckout(null)}>Cancel</button><button className={flexible.primary} type="button" onClick={() => void submitCheckout()} disabled={busy === checkout.id}>{busy === checkout.id ? 'Creating order…' : fulfillment === 'aspirer_delivery' ? 'Reserve & ask Aspire Network' : 'Continue with Aspire Protected'}</button></div>
    </div></div>}
  </main>;
}
