'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import { fetchMyConnections } from '../lib/supabase/connections';
import { fetchMarketOrders, type MarketOrder } from '../lib/supabase/marketplace';
import {
  cancelLinkedDeliveryRequest,
  createLinkedDeliveryRequest,
  fetchMarketDeliveryLinks,
  type DeliveryCompensationMode,
  type DeliveryProtectionMode,
  type MarketDeliveryLink
} from '../lib/supabase/delivery';

function money(cents: number | null | undefined, currency = 'USD') {
  if (cents == null) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

export default function MarketDeliveryPanel() {
  const [base, setBase] = useState<Awaited<ReturnType<typeof fetchMyConnections>> | null>(null);
  const [orders, setOrders] = useState<MarketOrder[]>([]);
  const [links, setLinks] = useState<MarketDeliveryLink[]>([]);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [pickupArea, setPickupArea] = useState('');
  const [dropoffArea, setDropoffArea] = useState('');
  const [mode, setMode] = useState<DeliveryCompensationMode>('fixed');
  const [protection, setProtection] = useState<DeliveryProtectionMode>('aspire');
  const [amount, setAmount] = useState('10');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const next = await fetchMyConnections();
      const requestMap = new Map(next.requests.map((request) => [request.id, request]));
      const marketConnections = next.connections.filter((connection) => requestMap.get(connection.request_id)?.kind === 'buy_sell');
      const marketOrders = await fetchMarketOrders(marketConnections.map((connection) => connection.id));
      const ownBuyerOrders = marketOrders.filter((order) => order.buyer_id === next.userId);
      const nextLinks = await fetchMarketDeliveryLinks(ownBuyerOrders.map((order) => order.id));
      setBase({ ...next, connections: marketConnections });
      setOrders(ownBuyerOrders);
      setLinks(nextLinks);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load delivery options.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const requestMap = useMemo(() => new Map((base?.requests ?? []).map((request) => [request.id, request])), [base]);
  const activeLinkByOrder = useMemo(() => {
    const map = new Map<string, MarketDeliveryLink>();
    links.forEach((link) => { if (link.status === 'active' && !map.has(link.market_order_id)) map.set(link.market_order_id, link); });
    return map;
  }, [links]);

  const eligibleOrders = orders.filter((order) => !['released','refunded','cancelled'].includes(order.status));
  if (loading || !base || !eligibleOrders.length) return null;

  function start(orderId: string) {
    setOpenFor(orderId);
    setPickupArea('');
    setDropoffArea('');
    setMode('fixed');
    setProtection('aspire');
    setAmount('10');
    setNotice('');
  }

  async function submit(order: MarketOrder) {
    const request = requestMap.get(order.request_id);
    if (!request?.campus_id) return setNotice('This purchase does not have a supported campus attached yet.');
    const amountCents = mode === 'fixed' ? Math.round(Number(amount) * 100) : null;
    if (mode === 'fixed' && (!Number.isFinite(amountCents) || Number(amountCents) <= 0)) return setNotice('Set a positive delivery amount.');
    const nextProtection: DeliveryProtectionMode = mode === 'fixed' ? protection : 'none';

    setBusy(order.id);
    setNotice('');
    try {
      const result = await createLinkedDeliveryRequest({
        marketOrderId: order.id,
        campusId: request.campus_id,
        itemTitle: request.title,
        pickupArea,
        dropoffArea,
        compensationMode: mode,
        protectionMode: nextProtection,
        amountCents
      });
      setLinks((current) => [result.link, ...current.filter((item) => item.market_order_id !== order.id || item.status !== 'active')]);
      setOpenFor(null);
      setNotice('Delivery request submitted for review. It will not appear publicly until Aspire moderation approves it.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not create the delivery request.');
    } finally { setBusy(''); }
  }

  async function cancel(link: MarketDeliveryLink) {
    setBusy(link.id);
    setNotice('');
    try {
      const next = await cancelLinkedDeliveryRequest(link.id);
      setLinks((current) => current.map((item) => item.id === next.id ? next : item));
      setNotice('Delivery request cancelled. You can post a new one if you still need help.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not cancel this delivery request.');
    } finally { setBusy(''); }
  }

  return (
    <section className="marketDelivery" aria-label="Marketplace delivery options">
      <header className="marketDeliveryHead">
        <div><span>OPTIONAL DELIVERY</span><h2>Pickup yourself — or ask campus to bring it.</h2></div>
        <p>The seller does not have to provide door delivery. If you want help, Aspire creates a separate delivery request and a separate connection, so the item purchase and the delivery job never get mixed together.</p>
      </header>

      <div className="marketDeliveryRule">
        <b>How payment works</b>
        <span>Free is free. For paid delivery, choose <strong>Pay with Aspire</strong> to use Stripe + Aspire service fees + delayed payout, or choose an off-platform payment that is clearly marked <strong>Not Aspire Protected</strong>. You can also agree on the amount after matching.</span>
        <a href="/protection">What Aspire Protected actually covers →</a>
      </div>

      {notice && <p className="marketDeliveryNotice" role="status">{notice}</p>}

      <div className="marketDeliveryList">
        {eligibleOrders.map((order) => {
          const request = requestMap.get(order.request_id);
          if (!request) return null;
          const link = activeLinkByOrder.get(order.id);
          const open = openFor === order.id;
          return (
            <article className="marketDeliveryCard" key={order.id}>
              <div className="marketDeliveryCardTop">
                <div><span>{order.listing_intent === 'sell' ? 'YOUR PURCHASE' : 'WANTED ORDER'} · PICKUP DEFAULT</span><h3>{request.title}</h3><p>{request.campus || 'Campus pickup'} · item order {money(order.agreed_amount_cents, order.currency)}</p></div>
                <b>{order.status.replaceAll('_', ' ')}</b>
              </div>

              {link ? (
                <div className="marketDeliveryActive">
                  <div><span>DELIVERY REQUEST ACTIVE</span><strong>{link.pickup_area} → {link.dropoff_area}</strong><small>{link.compensation_mode === 'free' ? 'Free help requested' : link.compensation_mode === 'fixed' ? `${money(link.requested_amount_cents)} · ${link.protection_mode === 'aspire' ? 'Pay with Aspire' : 'Off-platform · not protected'}` : 'Amount will be agreed after matching'}</small></div>
                  <div><a href="/connections">View responses / connection →</a><button type="button" onClick={() => cancel(link)} disabled={busy === link.id}>Cancel delivery request</button></div>
                </div>
              ) : !open ? (
                <div className="marketDeliveryChoices">
                  <div><i>1</i><span><strong>Pick it up yourself</strong><small>No extra request. Coordinate the pickup in your marketplace connection.</small></span></div>
                  <button type="button" onClick={() => start(order.id)}><i>2</i><span><strong>Ask campus for delivery →</strong><small>Post a separate pickup / errand request for another student.</small></span></button>
                </div>
              ) : (
                <div className="marketDeliveryComposer">
                  <div className="marketDeliveryFields">
                    <label><span>Pickup area</span><input value={pickupArea} onChange={(event) => setPickupArea(event.target.value)} placeholder="e.g. Chauncey / seller's dorm area" maxLength={180} /><small>Do not post the exact apartment or room number publicly.</small></label>
                    <label><span>Drop-off area</span><input value={dropoffArea} onChange={(event) => setDropoffArea(event.target.value)} placeholder="e.g. Hilltop / my dorm area" maxLength={180} /><small>Share an exact address only after you choose a helper.</small></label>
                  </div>

                  <div className="marketDeliveryModes">
                    <span>COMPENSATION</span>
                    <button type="button" className={mode === 'free' ? 'active' : ''} onClick={() => { setMode('free'); setProtection('none'); }}><b>Free</b><small>Ask if someone is willing to help.</small></button>
                    <button type="button" className={mode === 'fixed' ? 'active' : ''} onClick={() => { setMode('fixed'); if (protection === 'none') setProtection('aspire'); }}><b>Set an amount</b><small>Post a specific delivery payment.</small></button>
                    <button type="button" className={mode === 'discuss' ? 'active' : ''} onClick={() => { setMode('discuss'); setProtection('none'); }}><b>Decide later</b><small>Match first, then both sides agree on amount + payment method.</small></button>
                  </div>

                  {mode === 'fixed' && <div className="marketDeliveryMoney">
                    <label><span>Delivery amount</span><div><i>$</i><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></div></label>
                    <div className="marketDeliveryProtectionChoice">
                      <button type="button" className={protection === 'aspire' ? 'active' : ''} onClick={() => setProtection('aspire')}><strong>Pay with Aspire ✓</strong><span>Aspire service fee applies. Stripe confirms payment; payout is released after completion. Refund/dispute controls apply.</span></button>
                      <button type="button" className={protection === 'off_platform' ? 'active' : ''} onClick={() => setProtection('off_platform')}><strong>Pay directly / in person</strong><span>No Aspire transaction fee — but the payment is not Aspire Protected and Aspire cannot recover money sent outside the platform.</span></button>
                    </div>
                  </div>}

                  {mode === 'discuss' && <div className="marketDeliveryDiscuss">After you connect, either side can propose the amount. Both people must accept the same amount and choose either <strong>Pay with Aspire</strong> or <strong>off-platform / not protected</strong> before payment.</div>}

                  <div className="marketDeliveryActions"><button type="button" className="marketSecondary" onClick={() => setOpenFor(null)}>Never mind</button><button type="button" className="button buttonGold" onClick={() => submit(order)} disabled={busy === order.id}>{busy === order.id ? 'Submitting…' : 'Submit delivery request for review →'}</button></div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
