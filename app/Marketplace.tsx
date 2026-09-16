'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchCampusFeedRequests, type DiscoverRequest } from '../lib/supabase/discovery';
import { fetchActiveUniversities, type University } from '../lib/supabase/universities';
import { buyMarketplaceListing, createRequest } from '../lib/supabase/requests';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import AppDock from './AppDock';
import UiIcon from './UiIcon';

type CartItem = { id: string; title: string; amountCents: number; image: string; campus: string; paymentMethod: 'aspire' };
type DeliveryChoice = 'meet' | 'ship' | 'aspirer';
type AspirerReward = 'free' | '5' | '10' | 'negotiable';
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
  const [aspirerReward, setAspirerReward] = useState<AspirerReward>('negotiable');
  const [pickupArea, setPickupArea] = useState('');
  const [dropoffArea, setDropoffArea] = useState('');
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
    setAspirerReward('negotiable');
    setPickupArea('');
    setDropoffArea('');
  }

  async function reserve(item: DiscoverRequest, choice: DeliveryChoice) {
    if (choice === 'aspirer' && !dropoffArea.trim()) {
      setNotice('Add a drop-off area before continuing with Aspirer delivery.');
      return;
    }

    setBusy(item.id); setNotice('');
    try {
      const connectionId = await buyMarketplaceListing(item.id);

      if (choice === 'aspirer') {
        let deliveryRequestId = '';
        try {
          if (!campus?.id) throw new Error('Campus is not available for this delivery request.');
          const amountCents = aspirerReward === '5' ? 500 : aspirerReward === '10' ? 1000 : undefined;
          const rewardLabel = aspirerReward === 'free' ? 'Free' : aspirerReward === '5' ? '$5' : aspirerReward === '10' ? '$10' : 'Negotiable';
          const request = await createRequest({
            kind: aspirerReward === 'free' ? 'community' : 'paid_help',
            category: 'Pick this up',
            title: `Deliver ${item.title}`,
            details: `Marketplace delivery for “${item.title}”. Pickup area: ${pickupArea.trim() || 'coordinate with the seller privately'}. Drop-off area: ${dropoffArea.trim()}. Reward: ${rewardLabel}. Order reference: ${connectionId}. Keep exact pickup instructions private until you choose an Aspirer.`,
            campusId: campus.id,
            meeting_label: `${pickupArea.trim() || 'Seller pickup area'} → ${dropoffArea.trim()}`,
            amount_cents: amountCents,
            currency: 'USD'
          });
          deliveryRequestId = request.id;
        } catch (deliveryError) {
          const detail = deliveryError instanceof Error ? deliveryError.message : 'Could not post the delivery request.';
          setNotice(`The item is reserved, but the delivery request still needs setup. ${detail}`);
        }

        const params = new URLSearchParams({ connection: connectionId, delivery: 'aspirer', reward: aspirerReward });
        if (deliveryRequestId) params.set('deliveryRequest', deliveryRequestId);
        router.push(`/transactions?${params.toString()}`);
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
        <div className="marketProductBody"><button className="marketProductTitle" type="button" onClick={() => setSelected(item)}>{item.title}</button><strong>{money(item.amount_cents)}</strong><small>{item.item_condition?.replace('_', ' ') || 'Good condition'} · {item.fulfillment_method === 'shipping' ? 'Carrier shipping available' : 'Local handoff available'}</small><span className="marketProtectionBadge">Aspire Protected checkout</span><Countdown until={expiry(item)} /><div className="marketProductActions"><button type="button" className="marketAdd" onClick={() => addToCart(item)}>Add to cart</button><button type="button" className="button buttonGold" onClick={() => chooseDelivery(item)}>Buy now →</button></div></div>
      </article>)}</div>}
      <section id="cart" className="marketCart"><div><p className="eyebrow">YOUR CART</p><h2>Ready when you are.</h2><p>Cart is for browsing. Nothing is reserved until you choose a delivery method and continue.</p></div>{cart.length ? <><div className="marketCartItems">{cart.map((item) => <div key={item.id}><span>{item.title}<small>Online · Aspire Protected</small></span><strong>{money(item.amountCents)}</strong><button type="button" onClick={() => persist(cart.filter((entry) => entry.id !== item.id))}>Remove</button></div>)}</div><div className="marketCartTotal"><span>Subtotal</span><strong>{money(total)}</strong><button className="button buttonGold" type="button" onClick={() => { const listing = items.find((item) => item.id === cart[0]?.id); if (listing) chooseDelivery(listing); else setNotice('Open the listing to buy it — availability is checked again at checkout.'); }}>Buy first item</button></div></> : <span className="marketCartEmpty">Your cart is empty.</span>}</section>
    </div>

    {selected && <div className="marketModalBackdrop" role="dialog" aria-modal="true"><div className="marketModal"><button type="button" className="marketModalClose" onClick={() => setSelected(null)} aria-label="Close">×</button><p className="eyebrow">LISTING DETAILS</p><h2>{selected.title}</h2><strong className="marketModalPrice">{money(selected.amount_cents)}</strong><Countdown until={expiry(selected)} /><p>{selected.details || 'Seller has not added more details yet.'}</p><div className="marketModalFacts"><span>Condition <b>{selected.item_condition?.replace('_', ' ') || 'Good'}</b></span><span>Seller offers <b>{selected.fulfillment_method === 'shipping' ? 'Carrier shipping' : 'Local handoff'}</b></span><span>Payment <b>Online · Aspire Protected</b></span></div><div className="marketProductActions"><button className="marketAdd" type="button" onClick={() => addToCart(selected)}>Add to cart</button><button className="button buttonGold" type="button" onClick={() => chooseDelivery(selected)}>Buy now →</button></div></div></div>}

    {deliveryFor && <div className="marketModalBackdrop" role="dialog" aria-modal="true" aria-label="Choose delivery"><div className="marketModal" style={{ maxWidth: 660, maxHeight: '90vh', overflowY: 'auto' }}><button type="button" className="marketModalClose" onClick={() => setDeliveryFor(null)} aria-label="Close">×</button><p className="eyebrow">BUY NOW · DELIVERY</p><h2>How do you want to receive it?</h2><p style={{ marginTop: 4 }}>{deliveryFor.title} · {money(deliveryFor.amount_cents)}</p>
      <div style={{ display: 'grid', gap: 12, marginTop: 22 }}>
        {choiceCard(deliveryFor, 'meet', 'Meet up', 'Free', 'Meet the seller locally. Choose this when you want to pick the item up yourself.', deliveryFor.fulfillment_method !== 'shipping')}
        {choiceCard(deliveryFor, 'ship', 'Ship to me', 'Calculated', 'Have the seller ship it to your address. Carrier rate and tracking stay with the order.', deliveryFor.fulfillment_method === 'shipping')}
        {choiceCard(deliveryFor, 'aspirer', 'Ask an Aspirer to deliver', 'Free · Paid · Negotiable', 'Have another student pick the item up from the seller and bring it to you. Set the delivery request up right here before checkout.', deliveryFor.fulfillment_method !== 'shipping')}
      </div>

      {deliveryChoice === 'aspirer' && <section style={{ marginTop: 16, padding: 16, border: '1px solid rgba(244,196,28,.28)', borderRadius: 18, background: 'rgba(244,196,28,.055)' }}>
        <div><strong style={{ fontSize: 15 }}>Set up Aspirer delivery</strong><p style={{ margin: '5px 0 0', opacity: .72, lineHeight: 1.5 }}>Keep the purchase and delivery setup in one flow. Only the area is public; share exact pickup instructions privately after you choose a helper.</p></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 11 }}><span>Pickup area <small style={{ opacity: .65 }}>(optional)</small></span><input value={pickupArea} onChange={(event) => setPickupArea(event.target.value)} placeholder="e.g. Hillenbrand Hall area" style={{ minWidth: 0, padding: '11px 12px', borderRadius: 11, border: '1px solid rgba(127,127,127,.3)', background: 'transparent', color: 'inherit' }} /></label>
          <label style={{ display: 'grid', gap: 6, fontSize: 11 }}><span>Drop-off area</span><input value={dropoffArea} onChange={(event) => setDropoffArea(event.target.value)} placeholder="e.g. WALC area" style={{ minWidth: 0, padding: '11px 12px', borderRadius: 11, border: '1px solid rgba(127,127,127,.3)', background: 'transparent', color: 'inherit' }} /></label>
        </div>
        <div style={{ marginTop: 14 }}><span style={{ display: 'block', marginBottom: 8, fontSize: 11 }}>Reward for the Aspirer</span><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {([['free', 'Free'], ['5', '$5'], ['10', '$10'], ['negotiable', 'Negotiable']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setAspirerReward(value)} style={{ padding: '9px 13px', borderRadius: 999, border: aspirerReward === value ? '1px solid #f4c41c' : '1px solid rgba(127,127,127,.28)', background: aspirerReward === value ? 'rgba(244,196,28,.12)' : 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer' }}>{label}</button>)}
        </div></div>
      </section>}

      <div style={{ marginTop: 16, padding: 13, borderRadius: 14, background: 'rgba(127,127,127,.07)', lineHeight: 1.5 }}><strong>One purchase flow.</strong><p style={{ margin: '5px 0 0', opacity: .72 }}>{deliveryChoice === 'aspirer' ? 'Aspire will reserve the item, post the delivery request, and take you to the order page. You do not need to leave checkout for the standalone Delivery page.' : deliveryChoice === 'ship' ? 'Shipping details stay attached to this marketplace order.' : 'Meetup coordination stays attached to this marketplace order.'}</p></div>
      <button className="button buttonGold" type="button" style={{ width: '100%', marginTop: 18 }} onClick={() => void reserve(deliveryFor, deliveryChoice)} disabled={busy === deliveryFor.id}>{busy === deliveryFor.id ? 'Reserving…' : deliveryChoice === 'aspirer' ? 'Reserve item + post delivery request →' : 'Continue to order →'}</button>
    </div></div>}
  </main>;
}
