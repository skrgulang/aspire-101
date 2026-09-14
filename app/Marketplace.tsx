'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchCampusFeedRequests, type DiscoverRequest } from '../lib/supabase/discovery';
import { fetchActiveUniversities, type University } from '../lib/supabase/universities';
import { buyMarketplaceListing } from '../lib/supabase/requests';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import AppDock from './AppDock';
import UiIcon from './UiIcon';

type CartItem = { id: string; title: string; amountCents: number; image: string; campus: string; paymentMethod?: 'aspire' | 'in_person' };
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
          setItems(rows.filter((item) => item.kind === 'buy_sell' && item.market_intent === 'sell' && item.poster_id !== data.user.id));
        } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not load listings.'); }
      }
      setLoading(false);
    }).catch(() => { setNotice('Could not load your campus.'); setLoading(false); });
  }, [router]);

  const total = useMemo(() => cart.reduce((sum, item) => sum + item.amountCents, 0), [cart]);
  function persist(next: CartItem[]) { setCart(next); window.localStorage.setItem(CART_KEY, JSON.stringify(next)); }
  function addToCart(item: DiscoverRequest) {
    if (cart.some((entry) => entry.id === item.id)) { setNotice('Already in your cart.'); return; }
    persist([...cart, { id: item.id, title: item.title, amountCents: item.amount_cents || 0, image: item.media?.[0]?.public_url || item.cover_image_url || '', campus: campus?.short_name || '', paymentMethod: item.payment_method === 'aspire' ? 'aspire' : 'in_person' }]);
    setNotice('Added to cart. You can keep browsing or checkout when ready.');
  }
  async function buyNow(item: DiscoverRequest) {
    setBusy(item.id); setNotice('');
    try {
      const connectionId = await buyMarketplaceListing(item.id);
      router.push(`/transactions?connection=${encodeURIComponent(connectionId)}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'This listing is no longer available.'); }
    finally { setBusy(''); }
  }

  return <main className="marketplacePage"><AppDock active="discover" />
    <div className="marketplaceShell">
      <header className="marketplaceHeader"><div><p className="eyebrow">ASPIRE MARKET · {campus?.short_name || 'CAMPUS'}</p><h1>Buy from people on your campus.</h1><p>Listings are available as soon as they are posted. Online checkout can use Aspire Protected; pay-in-person listings are clearly marked as unprotected.</p></div><a className="marketCartButton" href="#cart"><UiIcon name="cart" /> Cart <b>{cart.length}</b></a></header>
      <div className="marketplaceExplainer"><div><strong>What is Transactions?</strong><span>It is your Orders page — items you have reserved, paid for, received, or disputed.</span></div><div><strong>What is Cart?</strong><span>A temporary list of items you may buy. Nothing is reserved until you choose Buy now.</span></div></div>
      {notice && <div className="marketplaceNotice" role="status">{notice}</div>}
      {loading ? <div className="marketplaceEmpty">Loading campus listings…</div> : !items.length ? <div className="marketplaceEmpty"><UiIcon name="tag" /><h2>No listings yet</h2><p>Be the first person to post something for sale.</p><a className="button buttonGold" href="/post">Post an item →</a></div> : <div className="marketGrid">{items.map((item) => <article className="marketProduct" key={item.id}>
        <button className="marketProductMedia" type="button" onClick={() => setSelected(item)}>{item.media?.[0]?.public_url || item.cover_image_url ? <img src={item.media?.[0]?.public_url || item.cover_image_url || ''} alt="" /> : <UiIcon name="tag" />}<span>Buy & sell</span></button>
        <div className="marketProductBody"><button className="marketProductTitle" type="button" onClick={() => setSelected(item)}>{item.title}</button><strong>{money(item.amount_cents)}</strong><small>{item.item_condition?.replace('_', ' ') || 'Good condition'} · {item.fulfillment_method === 'shipping' ? 'Ships with FedEx' : 'Campus pickup'}</small><span className={item.payment_method === 'aspire' ? 'marketProtectionBadge' : 'marketProtectionBadge offline'}>{item.payment_method === 'aspire' ? 'Aspire Protected online' : 'Pay in person · unprotected'}</span><Countdown until={expiry(item)} /><div className="marketProductActions"><button type="button" className="marketAdd" onClick={() => addToCart(item)}>Add to cart</button><button type="button" className="button buttonGold" onClick={() => void buyNow(item)} disabled={busy === item.id}>{busy === item.id ? 'Reserving…' : item.payment_method === 'aspire' ? 'Buy online' : 'Reserve'}</button></div></div>
      </article>)}</div>}
      <section id="cart" className="marketCart"><div><p className="eyebrow">YOUR CART</p><h2>Ready when you are.</h2><p>Cart is for browsing. Online items continue to Stripe; offline items create an unprotected handoff reservation.</p></div>{cart.length ? <><div className="marketCartItems">{cart.map((item) => <div key={item.id}><span>{item.title}<small>{item.paymentMethod === 'aspire' ? 'Online · Aspire Protected' : 'Pay in person · unprotected'}</small></span><strong>{money(item.amountCents)}</strong><button type="button" onClick={() => persist(cart.filter((entry) => entry.id !== item.id))}>Remove</button></div>)}</div><div className="marketCartTotal"><span>Subtotal</span><strong>{money(total)}</strong><button className="button buttonGold" type="button" onClick={() => { const listing = items.find((item) => item.id === cart[0]?.id); if (listing) void buyNow(listing); else setNotice('Open the listing to buy it — availability is checked again at checkout.'); }}>{cart[0]?.paymentMethod === 'aspire' ? 'Checkout first item' : 'Reserve first item'}</button></div></> : <span className="marketCartEmpty">Your cart is empty.</span>}</section>
    </div>
    {selected && <div className="marketModalBackdrop" role="dialog" aria-modal="true"><div className="marketModal"><button type="button" className="marketModalClose" onClick={() => setSelected(null)} aria-label="Close">×</button><p className="eyebrow">LISTING DETAILS</p><h2>{selected.title}</h2><strong className="marketModalPrice">{money(selected.amount_cents)}</strong><Countdown until={expiry(selected)} /><p>{selected.details || 'Seller has not added more details yet.'}</p><div className="marketModalFacts"><span>Condition <b>{selected.item_condition?.replace('_', ' ') || 'Good'}</b></span><span>Fulfillment <b>{selected.fulfillment_method === 'shipping' ? 'FedEx shipping' : 'Campus pickup'}</b></span><span>Payment <b>{selected.payment_method === 'aspire' ? 'Online · Aspire Protected' : 'In person · no protection'}</b></span></div><div className="marketProductActions"><button className="marketAdd" type="button" onClick={() => addToCart(selected)}>Add to cart</button><button className="button buttonGold" type="button" onClick={() => void buyNow(selected)} disabled={busy === selected.id}>{busy === selected.id ? 'Reserving…' : selected.payment_method === 'aspire' ? 'Buy online →' : 'Reserve →'}</button></div></div></div>}
  </main>;
}
