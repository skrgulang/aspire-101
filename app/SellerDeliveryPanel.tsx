'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  acceptSellerDeliveryQuote,
  cancelSellerDeliveryRequest,
  declineSellerDelivery,
  fetchMySellerDeliveryQuotes,
  getSellerDeliveryAddress,
  quoteSellerDelivery,
  setSellerDeliveryStatus,
  type SellerDeliveryQuote
} from '../lib/supabase/sellerDelivery';

function money(cents: number | null | undefined, currency = 'USD') {
  if (cents == null) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

const box: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,.12)',
  borderRadius: 18,
  padding: 18,
  background: 'rgba(255,255,255,.035)'
};

const input: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,.18)',
  background: 'rgba(0,0,0,.18)',
  color: 'inherit',
  padding: '10px 12px'
};

const button: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,.18)',
  borderRadius: 999,
  padding: '9px 14px',
  cursor: 'pointer',
  fontWeight: 700
};

export default function SellerDeliveryPanel() {
  const [userId, setUserId] = useState('');
  const [quotes, setQuotes] = useState<SellerDeliveryQuote[]>([]);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [quoteAmount, setQuoteAmount] = useState<Record<string, string>>({});
  const [sellerNotes, setSellerNotes] = useState<Record<string, string>>({});
  const [addresses, setAddresses] = useState<Record<string, any>>({});
  const [revealed, setRevealed] = useState<Record<string, any>>({});

  const reload = useCallback(async () => {
    try {
      const result = await fetchMySellerDeliveryQuotes();
      setUserId(result.userId);
      setQuotes(result.quotes);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load Seller Delivery.';
      if (!/sign in/i.test(message)) setNotice(message);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const active = useMemo(() => quotes.filter((q) => q.status !== 'cancelled'), [quotes]);
  if (!active.length) return null;

  function patchAddress(id: string, key: string, value: string) {
    setAddresses((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [key]: value } }));
  }

  async function sendQuote(q: SellerDeliveryQuote) {
    setBusy(`quote-${q.id}`); setNotice('');
    try {
      const mode = q.listing?.seller_delivery_mode;
      let cents: number | null = null;
      if (mode === 'negotiable') {
        const dollars = Number(quoteAmount[q.id]);
        if (!Number.isFinite(dollars) || dollars < 0) throw new Error('Enter a valid delivery amount.');
        cents = Math.round(dollars * 100);
      }
      await quoteSellerDelivery({ quoteId: q.id, deliveryCents: cents, note: sellerNotes[q.id] });
      setNotice('Delivery quote sent. The buyer can now confirm it and enter the exact address privately.');
      await reload();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not send quote.'); }
    finally { setBusy(''); }
  }

  async function decline(q: SellerDeliveryQuote) {
    setBusy(`decline-${q.id}`); setNotice('');
    try {
      await declineSellerDelivery(q.id, sellerNotes[q.id]);
      setNotice('Seller Delivery request declined.');
      await reload();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not decline request.'); }
    finally { setBusy(''); }
  }

  async function accept(q: SellerDeliveryQuote) {
    const a = addresses[q.id] || {};
    setBusy(`accept-${q.id}`); setNotice('');
    try {
      const connectionId = await acceptSellerDeliveryQuote({
        quoteId: q.id,
        address: {
          name: a.name || '',
          street1: a.street1 || '',
          street2: a.street2 || '',
          city: a.city || '',
          state: a.state || '',
          zip: a.zip || '',
          country: 'US'
        },
        instructions: a.instructions || ''
      });
      setNotice('Seller Delivery confirmed. Your exact address is locked until protected payment succeeds. Opening the order…');
      await reload();
      window.setTimeout(() => window.location.assign(`/transactions?connection=${encodeURIComponent(connectionId)}`), 550);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not accept quote.'); }
    finally { setBusy(''); }
  }

  async function cancel(q: SellerDeliveryQuote) {
    setBusy(`cancel-${q.id}`); setNotice('');
    try { await cancelSellerDeliveryRequest(q.id); setNotice('Request cancelled.'); await reload(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not cancel request.'); }
    finally { setBusy(''); }
  }

  async function reveal(q: SellerDeliveryQuote) {
    if (!q.market_order_id) return;
    setBusy(`reveal-${q.id}`); setNotice('');
    try {
      const value = await getSellerDeliveryAddress(q.market_order_id);
      setRevealed((prev) => ({ ...prev, [q.id]: value }));
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not unlock address.'); }
    finally { setBusy(''); }
  }

  async function updateStatus(q: SellerDeliveryQuote, status: 'ready' | 'out_for_delivery' | 'delivered' | 'completed') {
    if (!q.market_order_id) return;
    setBusy(`${status}-${q.id}`); setNotice('');
    try {
      await setSellerDeliveryStatus(q.market_order_id, status);
      setNotice(status === 'completed' ? 'Delivery completed ✓' : 'Delivery status updated.');
      await reload();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not update delivery status.'); }
    finally { setBusy(''); }
  }

  return (
    <section style={{ ...box, display: 'grid', gap: 14 }}>
      <div>
        <p style={{ margin: 0, opacity: .65, fontSize: 12, fontWeight: 800, letterSpacing: '.08em' }}>SELLER DELIVERY</p>
        <h2 style={{ margin: '4px 0 6px', fontSize: 22 }}>Quotes & private delivery</h2>
        <p style={{ margin: 0, opacity: .72, lineHeight: 1.5 }}>
          Buyer shares only a general area first. After the seller quotes, the buyer confirms and enters the exact address. The seller cannot unlock that address until Aspire Protected payment is secured.
        </p>
      </div>

      {notice ? <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,.07)' }}>{notice}</div> : null}

      {active.map((q) => {
        const seller = q.seller_id === userId;
        const buyer = q.buyer_id === userId;
        const mode = q.listing?.seller_delivery_mode;
        const itemPrice = q.listing?.amount_cents;
        const orderStatus = q.order?.status;
        const paid = !!orderStatus && !['awaiting_payment', 'payment_processing'].includes(orderStatus);
        const address = addresses[q.id] || {};
        const unlocked = revealed[q.id];
        return (
          <article key={q.id} style={{ ...box, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <strong>{q.listing?.title || 'Marketplace item'}</strong>
                <div style={{ opacity: .68, marginTop: 3 }}>Item {money(itemPrice, q.listing?.currency || 'USD')} · Buyer area: {q.buyer_area}</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', opacity: .7 }}>{q.status.replace('_', ' ')}</span>
            </div>

            {q.buyer_note ? <div style={{ opacity: .8 }}><strong>Buyer note:</strong> {q.buyer_note}</div> : null}
            {q.seller_note ? <div style={{ opacity: .8 }}><strong>Seller note:</strong> {q.seller_note}</div> : null}

            {seller && (q.status === 'requested' || q.status === 'quoted') ? (
              <div style={{ display: 'grid', gap: 9 }}>
                <div style={{ fontWeight: 700 }}>
                  {mode === 'free' ? 'Delivery fee: Free' : mode === 'fixed' ? `Delivery fee: ${money(q.listing?.seller_delivery_price_cents || 0)}` : 'Set a delivery quote'}
                </div>
                {mode === 'negotiable' ? (
                  <label>Delivery amount ($)
                    <input style={input} inputMode="decimal" placeholder="7.50" value={quoteAmount[q.id] || ''} onChange={(e) => setQuoteAmount((p) => ({ ...p, [q.id]: e.target.value }))} />
                  </label>
                ) : null}
                <label>Message to buyer (optional)
                  <input style={input} maxLength={500} placeholder="Timing, delivery window, etc." value={sellerNotes[q.id] || ''} onChange={(e) => setSellerNotes((p) => ({ ...p, [q.id]: e.target.value }))} />
                </label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button style={button} disabled={!!busy} onClick={() => void sendQuote(q)}>{busy === `quote-${q.id}` ? 'Sending…' : q.status === 'quoted' ? 'Update quote' : 'Accept & quote'}</button>
                  <button style={button} disabled={!!busy} onClick={() => void decline(q)}>{busy === `decline-${q.id}` ? 'Saving…' : 'Decline'}</button>
                </div>
              </div>
            ) : null}

            {buyer && q.status === 'requested' ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ opacity: .72 }}>Waiting for the seller to accept and quote delivery.</span>
                <button style={button} disabled={!!busy} onClick={() => void cancel(q)}>Cancel request</button>
              </div>
            ) : null}

            {buyer && q.status === 'declined' ? <div style={{ opacity: .72 }}>The seller declined this delivery request. You can return to the item and choose another fulfillment method.</div> : null}

            {buyer && q.status === 'quoted' ? (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ fontWeight: 800 }}>Seller quote: {money(q.delivery_cents, q.listing?.currency || 'USD')} · Protected total: {money((itemPrice || 0) + (q.delivery_cents || 0), q.listing?.currency || 'USD')}</div>
                <p style={{ margin: 0, opacity: .72 }}>Now enter the exact address. It is stored privately and stays locked from the seller until payment succeeds.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 8 }}>
                  <input style={input} placeholder="Name" value={address.name || ''} onChange={(e) => patchAddress(q.id, 'name', e.target.value)} />
                  <input style={input} placeholder="Street address" value={address.street1 || ''} onChange={(e) => patchAddress(q.id, 'street1', e.target.value)} />
                  <input style={input} placeholder="Apt / room (optional)" value={address.street2 || ''} onChange={(e) => patchAddress(q.id, 'street2', e.target.value)} />
                  <input style={input} placeholder="City" value={address.city || ''} onChange={(e) => patchAddress(q.id, 'city', e.target.value)} />
                  <input style={input} placeholder="State" value={address.state || ''} onChange={(e) => patchAddress(q.id, 'state', e.target.value)} />
                  <input style={input} placeholder="ZIP" value={address.zip || ''} onChange={(e) => patchAddress(q.id, 'zip', e.target.value)} />
                </div>
                <input style={input} maxLength={500} placeholder="Delivery instructions (optional)" value={address.instructions || ''} onChange={(e) => patchAddress(q.id, 'instructions', e.target.value)} />
                <div><button style={button} disabled={!!busy} onClick={() => void accept(q)}>{busy === `accept-${q.id}` ? 'Creating protected order…' : 'Confirm quote & create protected order'}</button></div>
              </div>
            ) : null}

            {q.status === 'accepted' && q.order ? (
              <div style={{ display: 'grid', gap: 9 }}>
                <div><strong>Protected order:</strong> {money(q.order.agreed_amount_cents, q.order.currency)} · Payment: {orderStatus?.replaceAll('_', ' ')} · Delivery: {q.order.seller_delivery_status.replaceAll('_', ' ')}</div>
                {seller ? (
                  <>
                    {!paid ? <div style={{ opacity: .72 }}>Exact address is locked. It unlocks automatically after the buyer completes protected checkout.</div> : null}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button style={button} disabled={!!busy || !paid} onClick={() => void reveal(q)}>{busy === `reveal-${q.id}` ? 'Unlocking…' : 'View delivery address'}</button>
                      <button style={button} disabled={!!busy || !paid} onClick={() => void updateStatus(q, 'ready')}>Ready</button>
                      <button style={button} disabled={!!busy || !paid} onClick={() => void updateStatus(q, 'out_for_delivery')}>Out for delivery</button>
                      <button style={button} disabled={!!busy || !paid} onClick={() => void updateStatus(q, 'delivered')}>Delivered</button>
                    </div>
                    {unlocked ? (
                      <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,.06)' }}>
                        <strong>Private delivery address</strong><br />
                        {unlocked.address?.name ? <>{unlocked.address.name}<br /></> : null}
                        {unlocked.address?.street1}{unlocked.address?.street2 ? `, ${unlocked.address.street2}` : ''}<br />
                        {unlocked.address?.city}, {unlocked.address?.state} {unlocked.address?.zip}
                        {unlocked.instructions ? <><br /><span style={{ opacity: .72 }}>Instructions: {unlocked.instructions}</span></> : null}
                      </div>
                    ) : null}
                  </>
                ) : null}
                {buyer && q.order.seller_delivery_status === 'delivered' ? (
                  <button style={button} disabled={!!busy} onClick={() => void updateStatus(q, 'completed')}>Confirm delivery completed</button>
                ) : null}
                <a href={`/transactions?connection=${encodeURIComponent(q.connection_id || '')}`} style={{ fontWeight: 700 }}>Open payment & order controls →</a>
              </div>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
