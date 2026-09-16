'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchCampusFeedRequests, type DiscoverRequest } from '../lib/supabase/discovery';
import { fetchActiveUniversities, type University } from '../lib/supabase/universities';
import { buyMarketplaceListing, createRequest } from '../lib/supabase/requests';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import AppDock from './AppDock';
import UiIcon from './UiIcon';

type DeliveryChoice = 'meet' | 'ship' | 'aspirer';
type AspirerReward = 'free' | '5' | '10' | 'negotiable';
type FulfillmentMethod = 'campus_pickup' | 'shipping' | 'aspirer_delivery';
type MarketplaceItem = Omit<DiscoverRequest, 'fulfillment_method'> & { fulfillment_method?: FulfillmentMethod | null; fulfillment_methods?: FulfillmentMethod[] };

function money(cents: number | null | undefined) {
  return cents == null
    ? 'Price on request'
    : new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function expiry(item: DiscoverRequest) {
  return item.listing_expires_at || new Date(new Date(item.created_at).getTime() + 7 * 86400000).toISOString();
}

function methodsFor(item: MarketplaceItem): FulfillmentMethod[] {
  if (Array.isArray(item.fulfillment_methods) && item.fulfillment_methods.length) {
    return item.fulfillment_methods;
  }
  if (item.fulfillment_method === 'shipping') return ['shipping'];
  if (item.fulfillment_method === 'aspirer_delivery') return ['aspirer_delivery'];
  return ['campus_pickup'];
}

function supports(item: MarketplaceItem, choice: DeliveryChoice) {
  const methods = methodsFor(item);
  if (choice === 'meet') return methods.includes('campus_pickup');
  if (choice === 'ship') return methods.includes('shipping');
  return methods.includes('aspirer_delivery');
}

function methodSummary(item: MarketplaceItem) {
  const labels: string[] = [];
  if (supports(item, 'meet')) labels.push('Meet up');
  if (supports(item, 'ship')) labels.push('Shipping');
  if (supports(item, 'aspirer')) labels.push('Aspirer delivery');
  return labels.join(' · ');
}

function defaultChoice(item: MarketplaceItem): DeliveryChoice {
  if (supports(item, 'meet')) return 'meet';
  if (supports(item, 'ship')) return 'ship';
  return 'aspirer';
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
  return (
    <span className="marketCountdown">
      Ends in {days ? `${days}d ${hours % 24}h` : `${hours}h ${Math.floor((left % 3600000) / 60000)}m`}
    </span>
  );
}

export default function Marketplace() {
  const router = useRouter();
  const [campus, setCampus] = useState<University | null>(null);
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [selected, setSelected] = useState<MarketplaceItem | null>(null);
  const [deliveryFor, setDeliveryFor] = useState<MarketplaceItem | null>(null);
  const [deliveryChoice, setDeliveryChoice] = useState<DeliveryChoice>('meet');
  const [aspirerReward, setAspirerReward] = useState<AspirerReward>('negotiable');
  const [pickupArea, setPickupArea] = useState('');
  const [dropoffArea, setDropoffArea] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');

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
        try {
          const rows = (await fetchCampusFeedRequests({
            campusId: nextCampus.id,
            category: 'Buy & sell',
            limit: 60
          })) as MarketplaceItem[];
          const visible = rows.filter(
            (item) =>
              item.kind === 'buy_sell' &&
              item.market_intent === 'sell' &&
              item.payment_method === 'aspire' &&
              item.poster_id !== data.user.id
          );
          setItems(visible);

          const directId = new URLSearchParams(window.location.search).get('item');
          const directItem = directId ? visible.find((item) => item.id === directId) : undefined;
          if (directItem) {
            setDeliveryFor(directItem);
            setDeliveryChoice(defaultChoice(directItem));
          }
        } catch (error) {
          setNotice(error instanceof Error ? error.message : 'Could not load listings.');
        }
      }

      setLoading(false);
    }).catch(() => {
      setNotice('Could not load your campus.');
      setLoading(false);
    });
  }, [router]);

  const directItemId = useMemo(() => (typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('item') || ''), []);

  function openDelivery(item: MarketplaceItem) {
    setSelected(null);
    setDeliveryFor(item);
    setDeliveryChoice(defaultChoice(item));
    setAspirerReward('negotiable');
    setPickupArea('');
    setDropoffArea('');
  }

  async function reserve(item: MarketplaceItem, choice: DeliveryChoice) {
    if (!supports(item, choice)) {
      setNotice('That delivery method is not offered for this listing.');
      return;
    }
    if (choice === 'aspirer' && !dropoffArea.trim()) {
      setNotice('Add a drop-off area before continuing with Aspirer delivery.');
      return;
    }

    setBusy(item.id);
    setNotice('');
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
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'This listing is no longer available.');
    } finally {
      setBusy('');
    }
  }

  function choiceCard(
    choice: DeliveryChoice,
    title: string,
    price: string,
    description: string,
    enabled: boolean
  ) {
    const active = deliveryChoice === choice;
    return (
      <button
        type="button"
        disabled={!enabled}
        onClick={() => enabled && setDeliveryChoice(choice)}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: 18,
          borderRadius: 18,
          border: active ? '2px solid #f4c41c' : '1px solid rgba(127,127,127,.28)',
          background: active ? 'rgba(244,196,28,.10)' : 'rgba(127,127,127,.06)',
          opacity: enabled ? 1 : .42,
          cursor: enabled ? 'pointer' : 'not-allowed'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <strong style={{ fontSize: 18 }}>{title}</strong>
          <b style={{ fontSize: 13 }}>{price}</b>
        </div>
        <p style={{ margin: '8px 0 0', lineHeight: 1.5, opacity: .75 }}>{description}</p>
        {!enabled && <small style={{ display: 'block', marginTop: 8, opacity: .8 }}>Not offered by this seller.</small>}
      </button>
    );
  }

  return (
    <main className="marketplacePage">
      <AppDock active="discover" />
      <div className="marketplaceShell">
        <header className="marketplaceHeader">
          <div>
            <p className="eyebrow">ASPIRE MARKET · {campus?.short_name || 'CAMPUS'}</p>
            <h1>Buy from people on your campus.</h1>
            <p>Pick an item, choose exactly how you want to receive it, then continue through Aspire Protected.</p>
          </div>
        </header>

        <div className="marketplaceExplainer">
          <div><strong>1 · Choose an item</strong><span>Check the item and seller options.</span></div>
          <div><strong>2 · Choose how to receive it</strong><span>Meet up, carrier shipping, or ask an Aspirer.</span></div>
          <div><strong>3 · Finish in Orders</strong><span>Payment, handoff, delivery, tracking and payout stay together.</span></div>
        </div>

        {notice && <div className="marketplaceNotice" role="status">{notice}</div>}

        {loading ? (
          <div className="marketplaceEmpty">Loading campus listings…</div>
        ) : !items.length ? (
          <div className="marketplaceEmpty">
            <UiIcon name="tag" />
            <h2>No listings yet</h2>
            <p>Be the first person to post something for sale.</p>
            <a className="button buttonGold" href="/post">Post an item →</a>
          </div>
        ) : (
          <div className="marketGrid">
            {items.map((item) => (
              <article className="marketProduct" key={item.id}>
                <button className="marketProductMedia" type="button" onClick={() => setSelected(item)}>
                  {item.media?.[0]?.public_url || item.cover_image_url ? (
                    <img src={item.media?.[0]?.public_url || item.cover_image_url || ''} alt="" />
                  ) : (
                    <UiIcon name="tag" />
                  )}
                  <span>{item.id === directItemId ? 'Test item' : 'Buy & sell'}</span>
                </button>
                <div className="marketProductBody">
                  <button className="marketProductTitle" type="button" onClick={() => setSelected(item)}>{item.title}</button>
                  <strong>{money(item.amount_cents)}</strong>
                  <small>{item.item_condition?.replace('_', ' ') || 'Good condition'} · {methodSummary(item)}</small>
                  <span className="marketProtectionBadge">Aspire Protected checkout</span>
                  <Countdown until={expiry(item)} />
                  <div className="marketProductActions">
                    <button type="button" className="button buttonGold" onClick={() => openDelivery(item)}>Buy now →</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="marketModalBackdrop" role="dialog" aria-modal="true">
          <div className="marketModal">
            <button type="button" className="marketModalClose" onClick={() => setSelected(null)} aria-label="Close">×</button>
            <p className="eyebrow">LISTING DETAILS</p>
            <h2>{selected.title}</h2>
            <strong className="marketModalPrice">{money(selected.amount_cents)}</strong>
            <Countdown until={expiry(selected)} />
            <p>{selected.details || 'Seller has not added more details yet.'}</p>
            <div className="marketModalFacts">
              <span>Condition <b>{selected.item_condition?.replace('_', ' ') || 'Good'}</b></span>
              <span>Receive it by <b>{methodSummary(selected)}</b></span>
              <span>Payment <b>Online · Aspire Protected</b></span>
            </div>
            <div className="marketProductActions">
              <button className="button buttonGold" type="button" onClick={() => openDelivery(selected)}>Buy now →</button>
            </div>
          </div>
        </div>
      )}

      {deliveryFor && (
        <div className="marketModalBackdrop" role="dialog" aria-modal="true" aria-label="Choose delivery">
          <div className="marketModal" style={{ maxWidth: 660, maxHeight: '90vh', overflowY: 'auto' }}>
            <button type="button" className="marketModalClose" onClick={() => setDeliveryFor(null)} aria-label="Close">×</button>
            <p className="eyebrow">BUY NOW · HOW DO YOU WANT IT?</p>
            <h2>Choose how to receive this item.</h2>
            <p style={{ marginTop: 4 }}>{deliveryFor.title} · {money(deliveryFor.amount_cents)}</p>

            <div style={{ display: 'grid', gap: 12, marginTop: 22 }}>
              {choiceCard(
                'meet',
                'Meet up / Local pickup',
                'Free',
                'Meet the seller in person on campus or nearby and coordinate a public handoff.',
                supports(deliveryFor, 'meet')
              )}
              {choiceCard(
                'ship',
                'Ship to me',
                'Calculated',
                'Have the seller ship it. Carrier rate, label and tracking stay attached to the order.',
                supports(deliveryFor, 'ship')
              )}
              {choiceCard(
                'aspirer',
                'Ask an Aspirer to deliver',
                'Free · Paid · Negotiable',
                'Post a linked delivery request so another student can pick it up from the seller and bring it to you.',
                supports(deliveryFor, 'aspirer')
              )}
            </div>

            {deliveryChoice === 'aspirer' && supports(deliveryFor, 'aspirer') && (
              <section style={{ marginTop: 16, padding: 16, border: '1px solid rgba(244,196,28,.28)', borderRadius: 18, background: 'rgba(244,196,28,.055)' }}>
                <div>
                  <strong style={{ fontSize: 15 }}>Set up Aspirer delivery</strong>
                  <p style={{ margin: '5px 0 0', opacity: .72, lineHeight: 1.5 }}>
                    Only post the general area publicly. Share exact pickup instructions privately after you choose a helper.
                  </p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>Pickup area</span>
                    <input value={pickupArea} onChange={(event) => setPickupArea(event.target.value)} placeholder="e.g. Hillenbrand Hall area" />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>Drop-off area *</span>
                    <input value={dropoffArea} onChange={(event) => setDropoffArea(event.target.value)} placeholder="e.g. WALC area" />
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                  {(['free', '5', '10', 'negotiable'] as AspirerReward[]).map((reward) => (
                    <button
                      type="button"
                      key={reward}
                      onClick={() => setAspirerReward(reward)}
                      style={{
                        borderRadius: 999,
                        padding: '9px 12px',
                        border: aspirerReward === reward ? '2px solid #f4c41c' : '1px solid rgba(127,127,127,.28)',
                        background: aspirerReward === reward ? 'rgba(244,196,28,.12)' : 'transparent',
                        cursor: 'pointer'
                      }}
                    >
                      {reward === 'free' ? 'Free' : reward === '5' ? '$5' : reward === '10' ? '$10' : 'Negotiable'}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <button
              className="button buttonGold"
              type="button"
              style={{ width: '100%', marginTop: 18 }}
              onClick={() => void reserve(deliveryFor, deliveryChoice)}
              disabled={busy === deliveryFor.id}
            >
              {busy === deliveryFor.id
                ? 'Reserving…'
                : deliveryChoice === 'aspirer'
                  ? 'Reserve item + post delivery request →'
                  : deliveryChoice === 'ship'
                    ? 'Continue with shipping →'
                    : 'Continue with meetup →'}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
