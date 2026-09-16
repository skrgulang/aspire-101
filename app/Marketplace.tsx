'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchCampusFeedRequests, type DiscoverRequest } from '../lib/supabase/discovery';
import { fetchActiveUniversities, type University } from '../lib/supabase/universities';
import { buyMarketplaceListing } from '../lib/supabase/requests';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import AppDock from './AppDock';
import UiIcon from './UiIcon';

type CartItem = { id: string; title: string; amountCents: number; image: string; campus: string; paymentMethod: 'aspire' };
type DeliveryChoice = 'meet' | 'ship' | 'aspirer';
const CART_KEY = 'aspire-market-cart';

function money(cents: number | null | undefined) {
  return cents == null ? 'Price on request' : new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function expiry(item: DiscoverRequest) {
  return item.listing_expires_at || new Date(new Date(item.created_at).getTime() + 7 * 86400000).toISOString();
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
  const [userId, setUserId] = useState<string | null>(null);
  const [campus, setCampus] = useState<University | null>(null);
  const [items, setItems] = useState<DiscoverRequest[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selected, setSelected] = useState<DiscoverRequest | null>(null);
  const [deliveryFor, setDeliveryFor] = useState<DiscoverRequest | null>(null);
  const [deliveryChoice, setDeliveryChoice] = useState<DeliveryChoice>('meet');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    try { setCart(JSON.parse(window.localStorage.getItem(CART_KEY) || '[]')); } catch { setCart([]); }
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace('/login?next=%2Fmarketplace'); return; }
      setUserId(data.user.id);
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
          setItems(rows.filter((item) => item.kind === 'buy_sell' && item.market_intent === 'sell' && item.payment_method === 'aspire' && item.poster_id !== data.user.id));
        } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not load listings.'); }
      }
      setLoading(false);
    }).catch(() => { setNotice('Could not load your campus.'); setLoading(false); });
  }, [router]);

  const total = useMemo(() => cart.reduce((sum, item) => sum + item.amountCents, 0), [cart]);
  function persist(next: CartItem[]) { setCart(next); window.localStorage.setItem(CART_KEY, JSON.stringify(next)); }
  function addToCart(item: DiscoverRequest) {
    if (cart.some((entry) => entry.id === item.id)) { setNotice('Already in your cart.'); return; }
    persist([...cart, { id: item.id, title: item.title, amountCents: item.amount_cents || 0, image: item.media?.[0]?.public_url || item.cover_image_url || '', campus: campus?.short_name || '', paymentMethod: 'aspire' }]);
    setNotice('Added to cart. You can keep browsing or buy when ready.');
  }

  function chooseDelivery(item: DiscoverRequest) {
    setSelected(null);
    setDeliveryFor(item);
    setDeliveryChoice(item.fulfillment_method === 'shipping' ? 'ship' : 'meet');
  }

  async function reserve(item: DiscoverRequest, choice: DeliveryChoice) {
    setBusy(item.id); setNotice('');
    try {
      const connectionId = await buyMarketplaceListing(item.id);
      if (choice === 'aspirer') {
        const params = new URLSearchParams({ order: connectionId, title: item.title });
        router.push(`/delivery?${params.toString()}`);
      } else {
        router.push(`/transactions?connection=${encodeURIComponent(connectionId)}&delivery=${choice}`);
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : 'This listing is no longer available.'); }
    finally { setBusy(''); }
  }

  const choiceCard = (item: DiscoverRequest, choice: DeliveryChoice, title: string, price: string, description: string, enabled: boolean) => {
    const active = deliveryChoice === choice;
    return <button
      type="button"
      disabled={!enabled}
      onClick={() => enabled && setDeliveryChoice(choice)}
      style={{
        width: '100%', textAlign: 'left', padding: 18, borderRadius: 18,
        border: active ? '2px solid #f4c41c' : '1px solid rgba(127,127,127,.28)',
        background: active ? 'rgba(244,196,28,.10)' : 'rgba(127,127,127,.06)',
        opacity: enabled ? 1 : .42, cursor: enabled ? 'pointer' : 'not-allowed'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <strong style={{ fontSize: 18 }}>{title}</strong><b style={{ fontSize: 13 }}>{price}</b>
      </div>
      <p style={{ margin: '8px 0 0', lineHeight: 1.5, opacity: .75 }}>{description}</p>
      {!enabled && <small style={{ display: 'block', marginTop: 8, opacity: .8 }}>Not offered on this listing yet.</small>}
    </button>;
  };

  return <main className="marketplacePage"><AppDock active="discover" />
    <div className="marketplaceShell">
      <header className="marketplaceHeader"><div><p className="eyebrow">ASPIRE MARKET · {campus?.short_name || 'CAMPUS'}</p><h1>Buy from people on your campus.</h1><p>Browse an item, choose how you want to receive it, pay through Aspire Protected, then follow the order from one place.</p></div><a className="marketCartButton" href="#cart"><UiIcon name="cart" /> Cart <b>{cart.length}</b></a></header>
      <div className="marketplaceExplainer"><div><strong>1 · Choose an item</strong><span>Open the listing and check condition, price, and seller fulfillment.</span></div><div><strong>2 · Choose delivery</strong><span>Meet up, carrier shipping, or use an Aspirer when local handoff is available.</span></div><div><strong>3 · Orders & delivery</strong><span>Payment, handoff, shipping, receipt confirmation and payout stay together.</span></div></div>
      {notice && <div className="marketplaceNotice" role="status">{notice}</div>}
      {loading ? <div className="marketplaceEmpty">Loading campus listings…</div> : !items.length ? <div className="marketplaceEmpty"><UiIcon name="tag" /><h2>No listings yet</h2><p>Be the first person to post something for sale.</p><a className="button buttonGold" href="/post">Post an item →</a></div> : <div className="marketGrid">{items.map((item) => <article className="marketProduct" key={item.id}>
        <button className="marketProductMedia" type="button" onClick={() => setSelected(item)}>{item.media?.[0]?.public_url || item.cover_image_url ? <img src={item.media?.[0]?.public_url || item.cover_image_url || ''} alt="" /> : <UiIcon name="tag" />}<span>Buy & sell</span></button>
        <div className="marketProductBody"><button className="marketProductTitle" type="button" onClick={() => setSelected(item)}>{item.title}</button><strong>{money(item.amount_cents)}</strong><small>{item.item_condition?.replace('_', ' ') || 'Good condition'} · {item.fulfillment_method === 'shipping' ? 'Carrier shipping available' : 'Local handoff available'}</small><span className="marketProtectionBadge">Aspire Protected checkout</span><Countdown until={expiry(item)} /><div className="marketProductActions"><button type="button" className="marketAdd" onClick={() => addToCart(item)}>Add to cart</button><button type="button" className="button buttonGold" onClick={() => chooseDelivery(item)}>Choose delivery →</button></div></div>
      </article>)}</div>}
      <section id="cart" className="marketCart"><div><p className="eyebrow">YOUR CART</p><h2>Ready when you are.</h2><p>Cart is for browsing. Nothing is reserved until you choose a delivery method and continue.</p></div>{cart.length ? <><div className="marketCartItems">{cart.map((item) => <div key={item.id}><span>{item.title}<small>Online · Aspire Protected</small></span><strong>{money(item.amountCents)}</strong><button type="button" onClick={() => persist(cart.filter((entry) => entry.id !== item.id))}>Remove</button></div>)}</div><div className="marketCartTotal"><span>Subtotal</span><strong>{money(total)}</strong><button className="button buttonGold" type="button" onClick={() => { const listing = items.find((item) => item.id === cart[0]?.id); if (listing) chooseDelivery(listing); else setNotice('Open the listing to buy it — availability is checked again at checkout.'); }}>Choose delivery for first item</button></div></> : <span className="marketCartEmpty">Your cart is empty.</span>}</section>
    </div>

    {selected && <div className="marketModalBackdrop" role="dialog" aria-modal="true"><div className="marketModal"><button type="button" className="marketModalClose" onClick={() => setSelected(null)} aria-label="Close">×</button><p className="eyebrow">LISTING DETAILS</p><h2>{selected.title}</h2><strong className="marketModalPrice">{money(selected.amount_cents)}</strong><Countdown until={expiry(selected)} /><p>{selected.details || 'Seller has not added more details yet.'}</p><div className="marketModalFacts"><span>Condition <b>{selected.item_condition?.replace('_', ' ') || 'Good'}</b></span><span>Seller offers <b>{selected.fulfillment_method === 'shipping' ? 'Carrier shipping' : 'Local handoff'}</b></span><span>Payment <b>Online · Aspire Protected</b></span></div><div className="marketProductActions"><button className="marketAdd" type="button" onClick={() => addToCart(selected)}>Add to cart</button><button className="button buttonGold" type="button" onClick={() => chooseDelivery(selected)}>Choose delivery →</button></div></div></div>}

    {deliveryFor && <div className="marketModalBackdrop" role="dialog" aria-modal="true" aria-label="Choose delivery"><div className="marketModal" style={{ maxWidth: 620 }}><button type="button" className="marketModalClose" onClick={() => setDeliveryFor(null)} aria-label="Close">×</button><p className="eyebrow">STEP 2 · DELIVERY</p><h2>How do you want to receive it?</h2><p style={{ marginTop: 4 }}>{deliveryFor.title} · {money(deliveryFor.amount_cents)}</p>
      <div style={{ display: 'grid', gap: 12, marginTop: 22 }}>
        {choiceCard(deliveryFor, 'meet', 'Meet up', 'Free', 'Meet the seller locally. After purchase, coordinate a public place and confirm the handoff from Orders.', deliveryFor.fulfillment_method !== 'shipping')}
        {choiceCard(deliveryFor, 'ship', 'Ship to me', 'Calculated', 'Use carrier shipping. Address, rates, label, tracking and receipt stay attached to the order.', deliveryFor.fulfillment_method === 'shipping')}
        {choiceCard(deliveryFor, 'aspirer', 'Ask an Aspirer', 'Free · Paid · Flexible', 'Reserve the item, then create a community delivery request so another student can help with the local handoff.', deliveryFor.fulfillment_method !== 'shipping')}
      </div>
      <div style={{ marginTop: 18, padding: 14, borderRadius: 14, background: 'rgba(127,127,127,.07)', lineHeight: 1.5 }}><strong>Seller fulfillment controls availability.</strong><p style={{ margin: '5px 0 0', opacity: .72 }}>This first UI pass keeps the existing backend rules intact. Sellers can currently list either local handoff or shipping; multi-option seller listings are the next backend/UI step.</p></div>
      <button className="button buttonGold" type="button" style={{ width: '100%', marginTop: 18 }} onClick={() => void reserve(deliveryFor, deliveryChoice)} disabled={busy === deliveryFor.id}>{busy === deliveryFor.id ? 'Reserving…' : deliveryChoice === 'aspirer' ? 'Reserve item + set up Aspirer delivery →' : 'Continue to order →'}</button>
    </div></div>}
  </main>;
}
