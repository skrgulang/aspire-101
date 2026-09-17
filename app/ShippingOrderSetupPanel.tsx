'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import {
  fetchShippingRates,
  getShippingRates,
  purchaseShippingLabel,
  selectShippingRate,
  type MarketOrder,
  type ShippingAddress,
  type ShippingRate
} from '../lib/supabase/marketplace';

const emptyAddress: ShippingAddress = { name: '', street1: '', city: '', state: '', zip: '', country: 'US' };

function money(cents: number, currency = 'USD') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

export default function ShippingOrderSetupPanel() {
  const [order, setOrder] = useState<MarketOrder | null>(null);
  const [role, setRole] = useState<'buyer' | 'seller' | ''>('');
  const [from, setFrom] = useState<ShippingAddress>(emptyAddress);
  const [parcel, setParcel] = useState({ length: '12', width: '8', height: '4', weight: '2' });
  const [rates, setRates] = useState<ShippingRate[]>([]);
  const [selectedRate, setSelectedRate] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function reloadRates(orderId: string) {
    const result = await fetchShippingRates(orderId);
    setRates(result.rates);
    setSelectedRate(result.selectedRateId || '');
  }

  async function load() {
    const params = new URLSearchParams(window.location.search);
    const connectionId = params.get('connection') || '';
    const delivery = params.get('delivery') || '';
    if (!connectionId || delivery !== 'ship') {
      setLoading(false);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setLoading(false);
      return;
    }
    const { data, error: orderError } = await supabase
      .from('market_orders')
      .select('*')
      .eq('connection_id', connectionId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!data || data.fulfillment_method !== 'shipping') {
      setLoading(false);
      return;
    }

    const next = data as MarketOrder;
    setOrder(next);
    setRole(auth.user.id === next.buyer_id ? 'buyer' : auth.user.id === next.seller_id ? 'seller' : '');
    try { await reloadRates(next.id); } catch { /* Seller may not have quoted yet. */ }
    setLoading(false);
  }

  useEffect(() => { void load().catch((cause) => { setError(cause instanceof Error ? cause.message : 'Could not load shipping setup.'); setLoading(false); }); }, []);

  async function quote() {
    if (!order) return;
    setBusy('quote'); setError(''); setNotice('');
    try {
      const result = await getShippingRates(order.id, from, null, parcel);
      setRates(result.rates);
      setSelectedRate('');
      setNotice('Live Shippo rates are ready. The buyer can now choose the carrier and service.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not get carrier rates.');
    } finally { setBusy(''); }
  }

  async function chooseRate() {
    if (!order || !selectedRate) return;
    setBusy('rate'); setError(''); setNotice('');
    try {
      const result = await selectShippingRate(order.id, selectedRate);
      setOrder((current) => current ? {
        ...current,
        shipping_rate_id: result.rate.id,
        shipping_rate_cents: result.rate.amountCents,
        shipping_currency: result.rate.currency,
        shipping_carrier: result.rate.carrier,
        shipping_service: result.rate.service
      } : current);
      setNotice(`${result.rate.carrier} ${result.rate.service} selected at ${money(result.rate.amountCents, result.rate.currency)}. Your order total will use this rate.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not select that rate.');
    } finally { setBusy(''); }
  }

  async function buyLabel() {
    if (!order?.shipping_rate_id) return;
    setBusy('label'); setError(''); setNotice('');
    try {
      await purchaseShippingLabel(order.id, order.shipping_rate_id);
      setNotice('Shipping label purchased. Tracking is now attached to the order.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not purchase the shipping label.');
    } finally { setBusy(''); }
  }

  if (loading || !order || !role) return null;
  const selected = rates.find((rate) => rate.id === selectedRate);
  const labelReady = Boolean(order.shipping_label_url || ['label_purchased','in_transit','delivered'].includes(String(order.shipping_status)));
  const paid = ['paid','handoff_confirmed','release_ready','released'].includes(order.status);

  return (
    <section className="marketOrders" aria-label="Carrier shipping setup">
      <header className="marketOrdersHead">
        <div><span>SHIPPO · LIVE CARRIER RATES</span><h2>{role === 'seller' ? 'Prepare the package for shipping.' : 'Choose the carrier before payment.'}</h2></div>
        <p>{role === 'seller' ? 'Enter the ship-from address and package size once. Aspire gets live USPS, UPS, and FedEx rates from Shippo.' : 'The seller prepares the package quote. You choose the actual carrier/service, then the selected rate is locked to this order.'}</p>
      </header>

      {notice && <div className="marketNotice" role="status">{notice}</div>}
      {error && <div className="marketNotice" role="alert">{error}</div>}

      <article className="marketOrderCard">
        {labelReady ? (
          <div className="shippingTrackingBox"><span>{order.shipping_carrier || 'CARRIER'} · {String(order.shipping_status || 'label purchased').replaceAll('_', ' ')}</span>{order.shipping_tracking_number && <strong>Tracking {order.shipping_tracking_number}</strong>}{order.shipping_label_url && role === 'seller' && <a href={order.shipping_label_url} target="_blank" rel="noreferrer">Open label ↗</a>}{order.shipping_tracking_url && <a href={order.shipping_tracking_url} target="_blank" rel="noreferrer">Track package ↗</a>}</div>
        ) : role === 'seller' ? (
          <div className="shippingToolsBody">
            <div className="shippingAddressGrid"><div><label>Ship from</label>{(['name','street1','city','state','zip'] as const).map((key) => <input key={key} value={from[key] || ''} onChange={(event) => setFrom((current) => ({ ...current, [key]: event.target.value }))} placeholder={key === 'street1' ? 'Street address' : key[0].toUpperCase() + key.slice(1)} />)}</div></div>
            <div className="shippingParcelRow"><label>Length (in)<input value={parcel.length} onChange={(event) => setParcel({ ...parcel, length: event.target.value })} /></label><label>Width (in)<input value={parcel.width} onChange={(event) => setParcel({ ...parcel, width: event.target.value })} /></label><label>Height (in)<input value={parcel.height} onChange={(event) => setParcel({ ...parcel, height: event.target.value })} /></label><label>Weight (lb)<input value={parcel.weight} onChange={(event) => setParcel({ ...parcel, weight: event.target.value })} /></label></div>
            <div className="shippingToolsActions"><button type="button" className="button buttonGold" disabled={busy !== '' || paid} onClick={() => void quote()}>{busy === 'quote' ? 'Getting live rates…' : rates.length ? 'Refresh live rates' : 'Get live carrier rates'}</button>{paid && order.shipping_rate_id && <button type="button" className="button buttonGold" disabled={busy !== ''} onClick={() => void buyLabel()}>{busy === 'label' ? 'Buying label…' : 'Buy shipping label'}</button>}</div>
            {rates.length > 0 && <p className="marketWaiting">{rates.length} live rate{rates.length === 1 ? '' : 's'} ready. Waiting for the buyer to choose one before checkout.</p>}
          </div>
        ) : (
          <div className="shippingToolsBody">
            {rates.length ? <><div className="shippingRateList">{rates.map((rate) => <label key={rate.id} className={selectedRate === rate.id ? 'active' : ''}><input type="radio" name={`live-rate-${order.id}`} checked={selectedRate === rate.id} onChange={() => setSelectedRate(rate.id)} /><span><b>{rate.carrier} · {rate.service}</b><small>{money(rate.amountCents, rate.currency)}{rate.estimatedDays ? ` · about ${rate.estimatedDays} business days` : ''}</small></span></label>)}</div><div className="shippingToolsActions"><button type="button" className="button buttonGold" disabled={busy !== '' || !selected || selectedRate === order.shipping_rate_id} onClick={() => void chooseRate()}>{busy === 'rate' ? 'Saving rate…' : selectedRate === order.shipping_rate_id ? 'Carrier selected ✓' : 'Use this carrier rate →'}</button></div></> : <p className="marketWaiting">Waiting for the seller to enter package details and request live carrier rates.</p>}
            {order.shipping_rate_id && <div className="shippingTrackingBox"><span>SELECTED SHIPPING</span><strong>{order.shipping_carrier} · {order.shipping_service} · {money(order.shipping_rate_cents || 0, order.shipping_currency || 'USD')}</strong><small>Now continue with Aspire Protected payment below. The selected shipping rate is attached to this order.</small></div>}
          </div>
        )}
      </article>
    </section>
  );
}
