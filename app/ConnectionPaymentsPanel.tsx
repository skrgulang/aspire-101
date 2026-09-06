'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchMyConnections } from '../lib/supabase/connections';
import {
  confirmConnectionCompletion,
  createAspireCheckout,
  fetchAspireFeeQuote,
  fetchCompletionConfirmations,
  fetchConnectionPayments,
  releaseAspirePayment,
  setConnectionPaymentMethod
} from '../lib/supabase/payments';
import type { AspireFeeQuote, CompletionConfirmation, ConnectionPayment } from '../lib/supabase/payments';

function money(cents: number | null | undefined, currency = 'USD') {
  if (cents == null) return 'Amount not set';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

export default function ConnectionPaymentsPanel() {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchMyConnections>> | null>(null);
  const [payments, setPayments] = useState<ConnectionPayment[]>([]);
  const [completions, setCompletions] = useState<CompletionConfirmation[]>([]);
  const [quotes, setQuotes] = useState<AspireFeeQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');

  const reload = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const base = await fetchMyConnections();
      const requestMap = new Map(base.requests.map((request) => [request.id, request]));
      const serviceConnections = base.connections.filter((connection) => {
        const request = requestMap.get(connection.request_id);
        return request && ['paid_help', 'split_cost'].includes(request.kind);
      });
      const ids = serviceConnections.map((connection) => connection.id);
      const [nextPayments, nextCompletions, nextQuotes] = await Promise.all([
        fetchConnectionPayments(ids),
        fetchCompletionConfirmations(ids),
        Promise.all(serviceConnections.map((connection) => fetchAspireFeeQuote(connection.id).catch(() => null)))
      ]);
      setData({ ...base, connections: serviceConnections });
      setPayments(nextPayments);
      setCompletions(nextCompletions);
      setQuotes(nextQuotes.filter(Boolean) as AspireFeeQuote[]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load payment activity.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      setNotice('Payment submitted. Waiting for Stripe confirmation…');
      const a = window.setTimeout(() => void reload(true), 1400);
      const b = window.setTimeout(() => void reload(true), 3800);
      return () => { clearTimeout(a); clearTimeout(b); };
    }
  }, [reload]);

  const requestMap = useMemo(() => new Map((data?.requests ?? []).map((request) => [request.id, request])), [data]);
  const paymentMap = useMemo(() => new Map(payments.map((payment) => [payment.connection_id, payment])), [payments]);
  const quoteMap = useMemo(() => new Map(quotes.map((quote) => [quote.connectionId, quote])), [quotes]);
  const completionMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    completions.forEach((item) => {
      const set = map.get(item.connection_id) ?? new Set<string>();
      set.add(item.user_id);
      map.set(item.connection_id, set);
    });
    return map;
  }, [completions]);

  async function chooseAspire(connectionId: string) {
    setBusy(`method-${connectionId}`);
    setNotice('');
    try {
      await setConnectionPaymentMethod(connectionId, 'aspire');
      await reload(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not enable Pay with Aspire.');
    } finally { setBusy(''); }
  }

  async function checkout(connectionId: string) {
    setBusy(`pay-${connectionId}`);
    setNotice('');
    try {
      const result = await createAspireCheckout(connectionId);
      window.location.assign(result.url);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not start payment.');
      setBusy('');
    }
  }

  async function complete(connectionId: string) {
    setBusy(`complete-${connectionId}`);
    setNotice('');
    try {
      const count = await confirmConnectionCompletion(connectionId);
      await reload(true);
      if (count >= 2) {
        await releaseAspirePayment(connectionId);
        setNotice('Both people confirmed completion. Payout released through Stripe ✓');
        await reload(true);
      } else {
        setNotice('Marked complete. Waiting for the other person.');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update completion.');
    } finally { setBusy(''); }
  }

  if (loading) return <section className="connectionPayments paymentSkeleton"><span /><span /><span /></section>;
  if (!data?.connections.length) return null;

  return (
    <section className="connectionPayments" aria-label="Aspire service payments">
      <header className="connectionPaymentsHead">
        <div><span>SERVICE PAYMENTS</span><h2>Money stays attached to the connection.</h2></div>
        <p>Paid help and shared-cost payments use the regular Aspire completion flow. Marketplace purchases use the separate Aspire Protected order flow below.</p>
      </header>
      {notice && <div className="connectionPaymentsNotice" role="status">{notice}</div>}
      <div className="connectionPaymentList">
        {data.connections.map((connection) => {
          const request = requestMap.get(connection.request_id)!;
          const payment = paymentMap.get(connection.id);
          const quote = quoteMap.get(connection.id);
          const confirmations = completionMap.get(connection.id) ?? new Set<string>();
          const isRequester = data.userId === connection.requester_id;
          const isResponder = data.userId === connection.responder_id;
          const selfComplete = confirmations.has(data.userId);
          const bothComplete = confirmations.has(connection.requester_id) && confirmations.has(connection.responder_id);
          const canWork = ['confirmed', 'active'].includes(connection.status);
          const payWithAspire = connection.payment_method === 'aspire';
          const secured = payment?.status === 'secured';
          const released = payment?.status === 'released';
          const base = payment?.base_amount_cents ?? quote?.baseAmountCents ?? connection.agreed_amount_cents ?? request.amount_cents;
          const total = payment?.customer_total_cents ?? quote?.customerTotalCents;
          const net = payment?.provider_net_cents ?? quote?.providerNetCents;
          return (
            <article className={`connectionPaymentCard state-${payment?.status || (payWithAspire ? 'not_started' : 'off_platform')}`} key={connection.id}>
              <div className="connectionPaymentTop"><div><span>{request.category.toUpperCase()} · {payWithAspire ? 'PAY WITH ASPIRE' : 'OFF-PLATFORM'}</span><h3>{request.title}</h3></div><strong>{money(base, request.currency)}</strong></div>
              {payWithAspire && quote && <div className="paymentFeeBreakdown">{isRequester ? <><div><span>Service</span><strong>{money(base, request.currency)}</strong></div><div><span>Aspire fee</span><strong>{money(quote.requesterFeeCents, request.currency)}</strong></div><div className="total"><span>Total</span><strong>{money(total, request.currency)}</strong></div></> : <><div><span>Service amount</span><strong>{money(base, request.currency)}</strong></div><div><span>Aspire platform fee</span><strong>−{money(quote.providerFeeCents, request.currency)}</strong></div><div className="total"><span>You earn</span><strong>{money(net, request.currency)}</strong></div></>}</div>}
              <div className="paymentProgress"><span className={canWork ? 'done' : ''}>1 <b>Connected</b></span><span className={payment && ['processing','secured','released'].includes(payment.status) ? 'done' : ''}>2 <b>Paid</b></span><span className={bothComplete ? 'done' : selfComplete ? 'current' : ''}>3 <b>Complete</b></span><span className={released ? 'done' : ''}>4 <b>Released</b></span></div>
              <div className="connectionPaymentActions">
                {!payWithAspire && isRequester && canWork && Number(base || 0) > 0 && <button type="button" className="button buttonGold" onClick={() => chooseAspire(connection.id)} disabled={busy === `method-${connection.id}`}>Use Pay with Aspire →</button>}
                {payWithAspire && isRequester && canWork && (!payment || ['failed','checkout_created'].includes(payment.status)) && <button type="button" className="button buttonGold" onClick={() => checkout(connection.id)} disabled={busy === `pay-${connection.id}`}>{busy === `pay-${connection.id}` ? 'Opening Stripe…' : `Secure ${money(total, request.currency)} →`}</button>}
                {payWithAspire && isResponder && canWork && !payment && <a href="/profile">Set up payouts →</a>}
                {secured && !selfComplete && <button type="button" className="button buttonGold" onClick={() => complete(connection.id)} disabled={busy === `complete-${connection.id}`}>Mark complete ✓</button>}
                {secured && selfComplete && !bothComplete && <span className="paymentWaiting">You marked complete · waiting for the other person</span>}
                {released && <span className="paymentReleased">Released through Stripe ✓</span>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
