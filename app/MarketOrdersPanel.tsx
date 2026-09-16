'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchMyConnections } from '../lib/supabase/connections';
import {
  createAspireCheckout,
  fetchAspireFeeQuote,
  fetchConnectionPayments,
  releaseAspirePayment
} from '../lib/supabase/payments';
import type { AspireFeeQuote, ConnectionPayment } from '../lib/supabase/payments';
import {
  confirmMarketReceipt,
  fetchMarketDisputes,
  fetchMarketOrders,
  markMarketHandoff,
  MarketDispute,
  MarketOrder,
  openMarketDispute,
  requestMarketRefund,
  getShippingRates,
  saveShippingAddress,
  selectShippingRate,
  purchaseShippingLabel,
  ShippingAddress
} from '../lib/supabase/marketplace';

function money(cents: number | null | undefined, currency = 'USD') {
  if (cents == null) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

function profileName(profile: any) {
  return profile?.display_name || profile?.full_name || profile?.name || 'Aspire student';
}

const statusCopy: Record<string, { label: string; note: string }> = {
  awaiting_payment: { label: 'Waiting for payment', note: 'The buyer has not secured the order yet.' },
  payment_processing: { label: 'Payment processing', note: 'Stripe is confirming the buyer payment.' },
  paid: { label: 'Payment secured ✓', note: 'Payment is confirmed. The seller payout has not been transferred.' },
  handoff_confirmed: { label: 'Seller marked handoff', note: 'The buyer should inspect the item and confirm receipt.' },
  release_ready: { label: 'Receipt confirmed ✓', note: 'The order is ready to release the seller payout.' },
  released: { label: 'Order complete ✓', note: 'The seller payout has been released through Stripe.' },
  disputed: { label: 'Payout paused', note: 'A problem was reported. Seller payout stays paused while the order is reviewed.' },
  refunded: { label: 'Refunded', note: 'The secured payment was returned to the buyer.' },
  cancelled: { label: 'Cancelled', note: 'This marketplace order is closed.' },
  off_platform: { label: 'Not Aspire Protected', note: 'This transaction is being paid outside Aspire. Aspire cannot verify or protect that payment.' }
};

const disputeReasons: { value: MarketDispute['reason']; label: string }[] = [
  { value: 'item_not_as_described', label: 'Item not as described' },
  { value: 'item_not_received', label: 'Item not received' },
  { value: 'counterfeit_or_prohibited', label: 'Counterfeit or prohibited item' },
  { value: 'payment_issue', label: 'Payment issue' },
  { value: 'unsafe_handoff', label: 'Unsafe handoff / meetup' },
  { value: 'other', label: 'Something else' }
];

const emptyAddress: ShippingAddress = { name: '', street1: '', city: '', state: '', zip: '', country: 'US' };

function ShippingOrderTools({ order, isBuyer, isSeller, secured, onDone }: { order: MarketOrder; isBuyer: boolean; isSeller: boolean; secured: boolean; onDone: () => void }) {
  const [myAddress, setMyAddress] = useState<ShippingAddress>(emptyAddress);
  const [parcel, setParcel] = useState({ length: '12', width: '8', height: '4', weight: '2' });
  const rateOptions = useMemo(() => order.shipping_rate_options ?? [], [order.shipping_rate_options]);
  const [selectedRate, setSelectedRate] = useState(order.shipping_rate_id || rateOptions[0]?.id || '');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const shippingStatus = order.shipping_status || 'not_started';
  const rateLocked = Boolean(order.shipping_rate_id && order.shipping_rate_cents);
  const paymentLocked = secured || ['payment_processing','paid','handoff_confirmed','release_ready','released'].includes(order.status);
  const fromReady = Boolean(order.shipping_from_address_id);
  const toReady = Boolean(order.shipping_to_address_id);
  const reconciliationRequired = shippingStatus === 'exception' && !order.shipping_transaction_id && !order.shipping_tracking_number && !order.shipping_label_url;

  useEffect(() => {
    if (order.shipping_rate_id) setSelectedRate(order.shipping_rate_id);
    else if (rateOptions.length && !rateOptions.some((rate) => rate.id === selectedRate)) setSelectedRate(rateOptions[0].id);
  }, [order.shipping_rate_id, rateOptions, selectedRate]);

  function updateAddress(key: keyof ShippingAddress, value: string) {
    setMyAddress((current) => ({ ...current, [key]: value }));
  }

  async function saveAddress() {
    const role = isSeller ? 'from' : 'to';
    setBusy('address'); setError('');
    try {
      await saveShippingAddress(order.id, role, myAddress);
      setMyAddress(emptyAddress);
      onDone();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save the shipping address.'); }
    finally { setBusy(''); }
  }

  async function quote() {
    setBusy('quote'); setError('');
    try {
      await getShippingRates(order.id, parcel);
      onDone();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not calculate shipping rates.'); }
    finally { setBusy(''); }
  }

  async function chooseRate() {
    if (!selectedRate) return;
    setBusy('select'); setError('');
    try {
      await selectShippingRate(order.id, selectedRate);
      onDone();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not choose that shipping rate.'); }
    finally { setBusy(''); }
  }

  async function buyLabel() {
    if (!order.shipping_rate_id) {
      setError('The buyer must choose a shipping rate before the label can be purchased.');
      return;
    }
    setBusy('label'); setError('');
    try { await purchaseShippingLabel(order.id, order.shipping_rate_id); onDone(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not purchase the shipping label.'); }
    finally { setBusy(''); }
  }

  if (shippingStatus === 'label_purchasing') {
    return <div className="shippingTrackingBox"><span>CARRIER SHIPPING · LABEL PURCHASE IN PROGRESS</span><strong>Do not retry or refresh into a second purchase.</strong><small>Aspire has reserved this label purchase against refunds and payout release. If it remains in this state unusually long, the server will fail closed and require reconciliation instead of buying another label.</small><a href={`/transactions?connection=${encodeURIComponent(order.connection_id)}`}>Review payment + order status →</a></div>;
  }

  if (reconciliationRequired) {
    return <div className="shippingTrackingBox"><span>CARRIER SHIPPING · RECONCILIATION REQUIRED</span><strong>Do not buy another label.</strong><small>The carrier transaction may have succeeded even though Aspire could not safely finalize the label record. Open the Resolution Center so the existing carrier transaction can be checked before any second purchase.</small><a href="/resolution">Open Resolution Center →</a><a href={`/transactions?connection=${encodeURIComponent(order.connection_id)}`}>Review protected transaction →</a></div>;
  }

  if (shippingStatus === 'label_purchased' || shippingStatus === 'in_transit' || shippingStatus === 'delivered' || shippingStatus === 'exception') {
    return <div className="shippingTrackingBox"><span>CARRIER SHIPPING · {shippingStatus.replaceAll('_', ' ')}</span><strong>{order.shipping_carrier || 'Carrier'}{order.shipping_service ? ` · ${order.shipping_service}` : ''}</strong>{order.shipping_tracking_number && <strong>Tracking {order.shipping_tracking_number}</strong>}{shippingStatus === 'exception' && <small>The carrier reported an exception or return. Follow tracking and use the Resolution Center if the shipment cannot continue normally.</small>}{order.shipping_label_url && isSeller && <a href={order.shipping_label_url} target="_blank" rel="noreferrer">Open label ↗</a>}{order.shipping_tracking_url && <a href={order.shipping_tracking_url} target="_blank" rel="noreferrer">Track package ↗</a>}{shippingStatus === 'exception' && <a href="/resolution">Open Resolution Center →</a>}</div>;
  }

  return <details className="shippingTools" open={!rateLocked}>
    <summary className="shippingToolsHead"><span>CARRIER SHIPPING</span><strong>{rateLocked ? `${order.shipping_carrier || 'Carrier'} · ${order.shipping_service || 'Selected service'}` : 'Private address setup + carrier rate'}</strong><small>{rateLocked ? `${money(order.shipping_rate_cents, order.shipping_currency || order.currency)} selected before payment` : 'Seller origin and buyer destination are entered separately. Aspire stores only opaque Shippo address IDs, not the other person’s exact address.'}</small></summary>
    <div className="shippingToolsBody">
      {!paymentLocked && <>
        <div className="shippingTrackingBox"><span>ADDRESS PRIVACY</span><strong>{fromReady ? 'Seller origin ready ✓' : 'Seller origin needed'} · {toReady ? 'Buyer destination ready ✓' : 'Buyer destination needed'}</strong><small>{isSeller ? 'You only enter your ship-from address. The buyer enters the private destination on their account.' : 'You only enter your delivery address. The seller enters the private ship-from address on their account.'}</small></div>
        <div className="shippingAddressGrid"><div><label>{isSeller ? 'Your ship-from address' : 'Your delivery address'}</label>{(['name','street1','city','state','zip'] as const).map((key) => <input key={`mine-${key}`} value={myAddress[key] || ''} onChange={(event) => updateAddress(key, event.target.value)} placeholder={key === 'street1' ? 'Street address' : key[0].toUpperCase() + key.slice(1)} />)}<button type="button" className="marketSecondary" onClick={saveAddress} disabled={busy !== ''}>{busy === 'address' ? 'Saving privately…' : isSeller ? 'Save my ship-from address' : 'Save my delivery address'}</button></div>{isSeller ? <div><label>Package (in / lb)</label><div className="shippingParcelRow"><label>Length<input value={parcel.length} onChange={(event) => setParcel({ ...parcel, length: event.target.value })} placeholder="L" /></label><label>Width<input value={parcel.width} onChange={(event) => setParcel({ ...parcel, width: event.target.value })} placeholder="W" /></label><label>Height<input value={parcel.height} onChange={(event) => setParcel({ ...parcel, height: event.target.value })} placeholder="H" /></label><label>Weight<input value={parcel.weight} onChange={(event) => setParcel({ ...parcel, weight: event.target.value })} placeholder="lb" /></label></div>{fromReady && toReady ? <button type="button" className="marketSecondary" onClick={quote} disabled={busy !== ''}>{busy === 'quote' ? 'Getting carrier rates…' : 'Create carrier rate options'}</button> : <small>Carrier rates become available after both private addresses are ready.</small>}</div> : <div><label>Rate options</label><p>{rateOptions.length ? 'The seller entered package dimensions. Choose one of the carrier options below.' : fromReady && toReady ? 'Waiting for the seller to create carrier rate options.' : 'Waiting for both address sides to be ready.'}</p></div>}</div>
      </>}
      {rateOptions.length > 0 && !paymentLocked && <div className="shippingRateList">{rateOptions.map((rate) => <label key={rate.id} className={selectedRate === rate.id ? 'active' : ''}><input type="radio" name={`shipping-rate-${order.id}`} checked={selectedRate === rate.id} onChange={() => setSelectedRate(rate.id)} disabled={!isBuyer} /><span><b>{rate.carrier} · {rate.service}</b><small>{money(rate.amountCents, rate.currency)}{rate.estimatedDays ? ` · ${rate.estimatedDays} business days` : ''}</small></span></label>)}</div>}
      {rateLocked && <div className="shippingTrackingBox"><span>SELECTED RATE</span><strong>{order.shipping_carrier || 'Carrier'} · {order.shipping_service || 'Standard'}</strong><strong>{money(order.shipping_rate_cents, order.shipping_currency || order.currency)}</strong><small>The shipping charge is added to the buyer total but is not part of the seller payout.</small></div>}
      {shippingStatus === 'label_failed' && secured && <div className="shippingTrackingBox"><span>LABEL PURCHASE NEEDS ATTENTION</span><strong>No completed carrier label is attached yet.</strong><small>Refresh the order before retrying. If Aspire reports an expired/changed paid rate or reconciliation requirement, do not purchase another label; use the Resolution Center instead.</small></div>}
      {error && <p className="shippingError">{error}</p>}
      <div className="shippingToolsActions">
        {isBuyer && !paymentLocked && rateOptions.length > 0 && <button type="button" className="button buttonGold" onClick={chooseRate} disabled={busy !== '' || !selectedRate}>{busy === 'select' ? 'Saving rate…' : rateLocked ? 'Update selected rate' : 'Use selected rate'}</button>}
        {isSeller && secured && rateLocked && <button type="button" className="button buttonGold" onClick={buyLabel} disabled={busy !== ''}>{busy === 'label' ? 'Buying label…' : `Buy ${order.shipping_carrier || 'carrier'} label`}</button>}
      </div>
    </div>
  </details>;
}

export default function MarketOrdersPanel() {
  const [base, setBase] = useState<Awaited<ReturnType<typeof fetchMyConnections>> | null>(null);
  const [orders, setOrders] = useState<MarketOrder[]>([]);
  const [payments, setPayments] = useState<ConnectionPayment[]>([]);
  const [quotes, setQuotes] = useState<AspireFeeQuote[]>([]);
  const [disputes, setDisputes] = useState<MarketDispute[]>([]);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [disputeFor, setDisputeFor] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState<MarketDispute['reason']>('item_not_as_described');
  const [disputeDetails, setDisputeDetails] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const nextBase = await fetchMyConnections();
      const requestMap = new Map(nextBase.requests.map((request) => [request.id, request]));
      const marketConnections = nextBase.connections.filter((connection) => requestMap.get(connection.request_id)?.kind === 'buy_sell');
      const ids = marketConnections.map((connection) => connection.id);
      const nextOrders = await fetchMarketOrders(ids);
      const [nextPayments, nextQuotes, nextDisputes] = await Promise.all([
        fetchConnectionPayments(ids),
        Promise.all(marketConnections.map((connection) => fetchAspireFeeQuote(connection.id).catch(() => null))),
        fetchMarketDisputes(nextOrders.map((order) => order.id))
      ]);
      setBase({ ...nextBase, connections: marketConnections });
      setOrders(nextOrders);
      setPayments(nextPayments);
      setQuotes(nextQuotes.filter(Boolean) as AspireFeeQuote[]);
      setDisputes(nextDisputes);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load marketplace orders.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      const first = window.setTimeout(() => void reload(true), 1400);
      const second = window.setTimeout(() => void reload(true), 3800);
      return () => { clearTimeout(first); clearTimeout(second); };
    }
  }, [reload]);

  const requestMap = useMemo(() => new Map((base?.requests ?? []).map((request) => [request.id, request])), [base]);
  const connectionMap = useMemo(() => new Map((base?.connections ?? []).map((connection) => [connection.id, connection])), [base]);
  const profileMap = useMemo(() => new Map((base?.profiles ?? []).map((profile) => [profile.id, profile])), [base]);
  const paymentMap = useMemo(() => new Map(payments.map((payment) => [payment.connection_id, payment])), [payments]);
  const quoteMap = useMemo(() => new Map(quotes.map((quote) => [quote.connectionId, quote])), [quotes]);
  const disputeMap = useMemo(() => {
    const map = new Map<string, MarketDispute>();
    disputes.forEach((dispute) => {
      if (!map.has(dispute.market_order_id)) map.set(dispute.market_order_id, dispute);
    });
    return map;
  }, [disputes]);

  async function pay(connectionId: string) {
    setBusy(`pay-${connectionId}`);
    setNotice('');
    try {
      const result = await createAspireCheckout(connectionId);
      window.location.assign(result.url);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not open Stripe checkout.');
      setBusy('');
    }
  }

  async function handoff(connectionId: string) {
    setBusy(`handoff-${connectionId}`);
    setNotice('');
    try {
      await markMarketHandoff(connectionId);
      setNotice('Handoff marked. Waiting for the buyer to inspect and confirm receipt.');
      await reload(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not mark handoff.');
    } finally { setBusy(''); }
  }

  async function confirmReceipt(connectionId: string) {
    setBusy(`receipt-${connectionId}`);
    setNotice('');
    try {
      await confirmMarketReceipt(connectionId);
      setNotice('Receipt confirmed. Releasing the seller payout…');
      await reload(true);
      try {
        await releaseAspirePayment(connectionId);
        setNotice('Receipt confirmed and seller payout released ✓');
      } catch (releaseError) {
        setNotice(releaseError instanceof Error ? `Receipt saved. ${releaseError.message}` : 'Receipt saved. Seller payout is waiting to release.');
      }
      await reload(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not confirm receipt.');
    } finally { setBusy(''); }
  }

  async function retryRelease(connectionId: string) {
    setBusy(`release-${connectionId}`);
    setNotice('');
    try {
      await releaseAspirePayment(connectionId);
      setNotice('Seller payout released ✓');
      await reload(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Seller payout is not ready yet.');
    } finally { setBusy(''); }
  }

  async function refund(connectionId: string) {
    if (!window.confirm('Cancel this protected order and refund the buyer? This is only available before item handoff.')) return;
    setBusy(`refund-${connectionId}`);
    setNotice('');
    try {
      await requestMarketRefund(connectionId);
      setNotice('Refund created. The order is closed.');
      await reload(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not refund this order.');
    } finally { setBusy(''); }
  }

  async function submitDispute(connectionId: string) {
    if (disputeDetails.trim().length < 10) {
      setNotice('Add a little more detail so the issue can be reviewed.');
      return;
    }
    setBusy(`dispute-${connectionId}`);
    setNotice('');
    try {
      await openMarketDispute(connectionId, disputeReason, disputeDetails.trim());
      setDisputeFor(null);
      setDisputeDetails('');
      setNotice('Problem reported. Seller payout is paused while this order is reviewed.');
      await reload(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not open the dispute.');
    } finally { setBusy(''); }
  }

  if (loading) return null;
  if (!base?.connections.length) return null;

  const legacyConnections = base.connections.filter((connection) => !orders.some((order) => order.connection_id === connection.id));

  return (
    <section className="marketOrders" aria-label="Aspire campus marketplace orders">
      <header className="marketOrdersHead">
        <div><span>ASPIRE MARKET · ORDER PROTECTION</span><h2>Buy on campus without losing the transaction trail.</h2></div>
        <p>Buyer payment, fulfillment, receipt confirmation, payout release, refund, and disputes stay attached to one order. Stripe processes payments; Aspire Protected is not described as legal escrow.</p>
      </header>

      {notice && <div className="marketNotice" role="status">{notice}</div>}

      {legacyConnections.length > 0 && <div className="marketLegacy">Some older Buy &amp; Sell connections were created before protected orders existed. New marketplace listings use the full order flow.</div>}

      <div className="marketOrderList">
        {orders.map((order) => {
          const connection = connectionMap.get(order.connection_id);
          const request = requestMap.get(order.request_id);
          if (!connection || !request) return null;
          const payment = paymentMap.get(order.connection_id);
          const quote = quoteMap.get(order.connection_id);
          const dispute = disputeMap.get(order.id);
          const isBuyer = base.userId === order.buyer_id;
          const isSeller = base.userId === order.seller_id;
          const otherId = isBuyer ? order.seller_id : order.buyer_id;
          const other = profileMap.get(otherId);
          const payWithAspire = connection.payment_method === 'aspire' && order.status !== 'off_platform';
          const secured = payment?.status === 'secured' || ['paid','handoff_confirmed','release_ready'].includes(order.status);
          const state = statusCopy[order.status] ?? statusCopy.awaiting_payment;
          const buyerTotal = payment?.customer_total_cents ?? quote?.customerTotalCents;
          const sellerNet = payment?.provider_net_cents ?? quote?.providerNetCents;
          const canDispute = ['paid','handoff_confirmed','release_ready'].includes(order.status) && !dispute;
          const paidStage = ['paid','handoff_confirmed','release_ready','released','disputed'].includes(order.status);
          const handoffStage = Boolean(order.seller_handed_off_at);
          const receiptStage = Boolean(order.buyer_received_at);
          const releasedStage = order.status === 'released';
          const isShipping = order.fulfillment_method === 'shipping';
          const shippingReady = !isShipping || Boolean(order.shipping_rate_id && order.shipping_rate_cents);
          const shippingHandoffReady = !isShipping || ['label_purchased','in_transit','delivered'].includes(order.shipping_status || '');
          const shippingReceiptReady = !isShipping || order.shipping_status === 'delivered';

          return (
            <article className={`marketOrderCard status-${order.status}`} key={order.id}>
              <div className="marketOrderTop">
                <div><span>{order.listing_intent === 'sell' ? 'FOR SALE' : 'WANTED'} · {request.campus || 'CAMPUS'}</span><h3>{request.title}</h3><p>{isBuyer ? 'You are the buyer' : 'You are the seller'} · with {profileName(other)}</p></div>
                <div className="marketOrderPrice"><strong>{money(order.agreed_amount_cents, order.currency)}</strong><small>{payWithAspire ? 'Aspire Protected' : 'Off-platform'}</small></div>
              </div>

              <div className={`marketOrderState ${order.status}`}><i>{order.status === 'disputed' ? '!' : order.status === 'released' ? '✓' : '○'}</i><div><strong>{state.label}</strong><p>{state.note}</p>{dispute && <small>Report: {disputeReasons.find((item) => item.value === dispute.reason)?.label || dispute.reason} · {dispute.status.replace('_', ' ')}</small>}</div></div>

              {payWithAspire && quote && <div className="marketMoneySummary">{isBuyer ? <><div><span>Item</span><strong>{money(order.agreed_amount_cents, order.currency)}</strong></div>{isShipping && <div><span>Carrier shipping</span><strong>{shippingReady ? money(order.shipping_rate_cents, order.shipping_currency || order.currency) : 'Choose rate'}</strong></div>}<div><span>Aspire service fee</span><strong>{money(quote.requesterFeeCents, order.currency)}</strong></div><div className="total"><span>You pay</span><strong>{shippingReady ? money(buyerTotal, order.currency) : '—'}</strong></div></> : <><div><span>Sale price</span><strong>{money(order.agreed_amount_cents, order.currency)}</strong></div><div><span>Aspire platform fee</span><strong>−{money(quote.providerFeeCents, order.currency)}</strong></div>{isShipping && <div><span>Shipping</span><strong>Paid separately by buyer</strong></div>}<div className="total"><span>You receive</span><strong>{money(sellerNet, order.currency)}</strong></div></>}</div>}

              <div className="marketProgress" aria-label="Marketplace order progress"><span className="done"><i>1</i><b>Matched</b></span><span className={paidStage ? 'done' : order.status === 'payment_processing' ? 'current' : ''}><i>2</i><b>Paid</b></span><span className={handoffStage ? 'done' : paidStage ? 'current' : ''}><i>3</i><b>{isShipping ? 'Shipped' : 'Handoff'}</b></span><span className={receiptStage ? 'done' : handoffStage ? 'current' : ''}><i>4</i><b>Received</b></span><span className={releasedStage ? 'done' : receiptStage ? 'current' : ''}><i>5</i><b>Released</b></span></div>

              <div className="marketOrderActions">
                {payWithAspire && isBuyer && ['awaiting_payment','payment_processing'].includes(order.status) && (!payment || ['not_started','failed','checkout_created'].includes(payment.status)) && shippingReady && <button className="button buttonGold" type="button" onClick={() => pay(order.connection_id)} disabled={busy === `pay-${order.connection_id}`}>{busy === `pay-${order.connection_id}` ? 'Opening Stripe…' : `Secure ${money(buyerTotal, order.currency)} →`}</button>}
                {payWithAspire && isBuyer && !shippingReady && ['awaiting_payment','payment_processing'].includes(order.status) && <span className="marketWaiting">Choose and lock a carrier shipping rate below before payment.</span>}
                {payWithAspire && isSeller && !secured && <span className="marketWaiting">Waiting for buyer payment. Make sure payouts are ready in <a href="/profile">Profile</a>.</span>}
                {payWithAspire && isSeller && order.status === 'paid' && !order.seller_handed_off_at && shippingHandoffReady && <button className="button buttonGold" type="button" onClick={() => handoff(order.connection_id)} disabled={busy === `handoff-${order.connection_id}`}>{isShipping ? 'Package shipped ✓' : 'I handed over the item ✓'}</button>}
                {payWithAspire && isSeller && order.status === 'paid' && !shippingHandoffReady && <span className="marketWaiting">Purchase the buyer-selected shipping label below before marking the package shipped.</span>}
                {payWithAspire && isBuyer && order.status === 'handoff_confirmed' && !order.buyer_received_at && shippingReceiptReady && <button className="button buttonGold" type="button" onClick={() => confirmReceipt(order.connection_id)} disabled={busy === `receipt-${order.connection_id}`}>Item received — release seller payout ✓</button>}
                {payWithAspire && isBuyer && order.status === 'handoff_confirmed' && !shippingReceiptReady && <span className="marketWaiting">Waiting for carrier delivery before receipt confirmation.</span>}
                {payWithAspire && order.status === 'release_ready' && <button className="button buttonGold" type="button" onClick={() => retryRelease(order.connection_id)} disabled={busy === `release-${order.connection_id}`}>Release seller payout →</button>}
                {payWithAspire && secured && !order.seller_handed_off_at && !['disputed','released','refunded'].includes(order.status) && <button className="marketSecondary" type="button" onClick={() => refund(order.connection_id)} disabled={busy === `refund-${order.connection_id}`}>Cancel + refund</button>}
                {canDispute && <button className="marketDanger" type="button" onClick={() => setDisputeFor(disputeFor === order.connection_id ? null : order.connection_id)}>Report a problem</button>}
                {order.status === 'released' && <span className="marketComplete">Transaction complete · payout released ✓</span>}
                {order.status === 'refunded' && <span className="marketComplete">Buyer refunded ✓</span>}
              </div>

              {isShipping && <ShippingOrderTools order={order} isBuyer={isBuyer} isSeller={isSeller} secured={secured} onDone={() => void reload(true)} />}

              {disputeFor === order.connection_id && canDispute && <div className="marketDisputeComposer"><div><span>PAUSE PAYOUT + REPORT</span><strong>What went wrong?</strong></div><select value={disputeReason} onChange={(event) => setDisputeReason(event.target.value as MarketDispute['reason'])}>{disputeReasons.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><textarea rows={3} value={disputeDetails} onChange={(event) => setDisputeDetails(event.target.value)} placeholder="Describe the item, handoff, payment, or safety issue. Keep the details factual." maxLength={2000} /><div><button type="button" className="marketSecondary" onClick={() => setDisputeFor(null)}>Never mind</button><button type="button" className="marketDanger solid" onClick={() => submitDispute(order.connection_id)} disabled={busy === `dispute-${order.connection_id}`}>Submit report + pause payout</button></div></div>}

              <footer className="marketOrderFinePrint"><span>{isShipping ? `${order.shipping_carrier || 'Carrier'} shipping · ${(order.shipping_status || 'not started').replaceAll('_', ' ')}` : order.fulfillment_method === 'aspirer_delivery' ? 'Aspirer delivery' : 'Campus pickup'} · {request.item_condition ? request.item_condition.replace('_', ' ') : 'condition not listed'}{request.price_negotiable ? ' · price was negotiable' : ''}</span><span>Order #{order.id.slice(0, 8)}</span></footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}