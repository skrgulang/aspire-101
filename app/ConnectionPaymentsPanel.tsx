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
import { ConnectionResolutionCase, fetchResolutionCases } from '../lib/supabase/resolution';

function money(cents: number | null | undefined, currency = 'USD') {
  if (cents == null) return 'Amount not set';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

function paymentStateCopy(payment: ConnectionPayment | undefined, payWithAspire: boolean, resolutionCase: ConnectionResolutionCase | undefined) {
  if (resolutionCase) {
    return {
      tone: 'disputed',
      title: 'Payment protected · payout paused',
      body: resolutionCase.status === 'under_review'
        ? 'Aspire is reviewing the open case. Provider release stays paused until the case is closed.'
        : 'A Resolution Center case is open. Provider release stays paused while the issue is reviewed.'
    };
  }
  if (!payWithAspire) return { tone: 'offPlatform', title: 'Off-platform payment', body: 'Aspire cannot directly refund money exchanged outside Pay with Aspire.' };
  if (!payment) return { tone: 'secured', title: 'Pay with Aspire available', body: 'Payment has not been secured yet.' };

  if (payment.status === 'processing') return { tone: 'secured', title: 'Payment processing', body: 'Stripe is confirming the payment. Do not pay a second time while this is processing.' };
  if (payment.status === 'secured') return { tone: 'secured', title: 'Payment secured by Aspire', body: 'Provider payout has not been released yet. Eligible issues can still pause release for review.' };
  if (payment.status === 'released') return { tone: 'released', title: 'Provider payout released', body: 'The protected payment flow is complete and provider funds were released through Stripe.' };
  if (payment.status === 'refunded') return { tone: 'refunded', title: 'Refund issued', body: 'Aspire recorded this payment as refunded. Bank posting time can vary after Stripe processes the refund.' };
  if (payment.status === 'disputed') return { tone: 'disputed', title: 'Payment dispute open', body: 'This payment is disputed. Do not attempt another payout or duplicate refund while the dispute is unresolved.' };
  if (payment.status === 'cancelled') return { tone: 'cancelled', title: 'Payment cancelled', body: 'This payment is closed and no provider payout is due from this payment record.' };
  if (payment.status === 'failed') return { tone: 'failed', title: 'Payment needs attention', body: 'The latest payment attempt did not complete. The requester can retry if the connection is still active.' };
  if (payment.status === 'checkout_created') return { tone: 'secured', title: 'Checkout started', body: 'A Stripe checkout was created, but the payment is not secured until Stripe confirms it.' };
  return { tone: 'secured', title: 'Pay with Aspire', body: 'Payment protection status will appear here.' };
}

export default function ConnectionPaymentsPanel() {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchMyConnections>> | null>(null);
  const [payments, setPayments] = useState<ConnectionPayment[]>([]);
  const [completions, setCompletions] = useState<CompletionConfirmation[]>([]);
  const [quotes, setQuotes] = useState<AspireFeeQuote[]>([]);
  const [resolutionCases, setResolutionCases] = useState<ConnectionResolutionCase[]>([]);
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
      const [nextPayments, nextCompletions, nextQuotes, nextCases] = await Promise.all([
        fetchConnectionPayments(ids),
        fetchCompletionConfirmations(ids),
        Promise.all(serviceConnections.map((connection) => fetchAspireFeeQuote(connection.id).catch(() => null))),
        fetchResolutionCases(ids).catch(() => [] as ConnectionResolutionCase[])
      ]);
      setData({ ...base, connections: serviceConnections });
      setPayments(nextPayments);
      setCompletions(nextCompletions);
      setQuotes(nextQuotes.filter(Boolean) as AspireFeeQuote[]);
      setResolutionCases(nextCases);
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
  const resolutionMap = useMemo(() => {
    const map = new Map<string, ConnectionResolutionCase>();
    resolutionCases.forEach((item) => {
      if (!map.has(item.connection_id) && ['submitted', 'under_review'].includes(item.status)) map.set(item.connection_id, item);
    });
    return map;
  }, [resolutionCases]);
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
        try {
          await releaseAspirePayment(connectionId);
          setNotice('Both people confirmed completion. Payout released through Stripe ✓');
        } catch (releaseError) {
          setNotice(releaseError instanceof Error ? `Completion saved. ${releaseError.message}` : 'Completion saved. Payout is waiting to release.');
        }
        await reload(true);
      } else {
        setNotice('Marked complete. Waiting for the other person.');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update completion.');
    } finally { setBusy(''); }
  }

  async function retryRelease(connectionId: string) {
    setBusy(`release-${connectionId}`);
    setNotice('');
    try {
      await releaseAspirePayment(connectionId);
      setNotice('Payout released through Stripe ✓');
      await reload(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Payout is not ready to release yet.');
    } finally { setBusy(''); }
  }

  if (loading) return <section className="connectionPayments paymentSkeleton"><span /><span /><span /></section>;
  if (!data?.connections.length) return null;

  return (
    <section className="connectionPayments" aria-label="Aspire service payments">
      <header className="connectionPaymentsHead">
        <div><span>SERVICE PAYMENTS</span><h2>Money stays attached to the connection.</h2><a href="/money">Open Aspire Money →</a></div>
        <p>Paid help and shared-cost payments use the regular Aspire completion flow. Marketplace purchases use the separate Aspire Protected order flow below.</p>
      </header>
      {notice && <div className="connectionPaymentsNotice" role="status">{notice}</div>}
      <div className="connectionPaymentList">
        {data.connections.map((connection) => {
          const request = requestMap.get(connection.request_id)!;
          const payment = paymentMap.get(connection.id);
          const quote = quoteMap.get(connection.id);
          const resolutionCase = resolutionMap.get(connection.id);
          const confirmations = completionMap.get(connection.id) ?? new Set<string>();
          const isRequester = data.userId === connection.requester_id;
          const isResponder = data.userId === connection.responder_id;
          const selfComplete = confirmations.has(data.userId);
          const bothComplete = confirmations.has(connection.requester_id) && confirmations.has(connection.responder_id);
          const canWork = ['confirmed', 'active'].includes(connection.status);
          const payWithAspire = connection.payment_method === 'aspire';
          const secured = payment?.status === 'secured';
          const released = payment?.status === 'released';
          const refunded = payment?.status === 'refunded';
          const disputed = payment?.status === 'disputed';
          const cancelled = payment?.status === 'cancelled';
          const paidConfirmed = Boolean(payment && ['secured', 'released', 'refunded', 'disputed'].includes(payment.status));
          const paidProcessing = payment?.status === 'processing';
          const state = paymentStateCopy(payment, payWithAspire, resolutionCase);
          const finalStepLabel = resolutionCase ? 'On hold' : refunded ? 'Refunded' : disputed ? 'Disputed' : cancelled ? 'Cancelled' : 'Released';
          const finalStepClass = released || refunded || cancelled ? 'done' : resolutionCase || disputed ? 'current' : '';
          const base = payment?.base_amount_cents ?? quote?.baseAmountCents ?? connection.agreed_amount_cents ?? request.amount_cents;
          const total = payment?.customer_total_cents ?? quote?.customerTotalCents;
          const net = payment?.provider_net_cents ?? quote?.providerNetCents;
          return (
            <article className={`connectionPaymentCard state-${payment?.status || (payWithAspire ? 'not_started' : 'off_platform')}`} key={connection.id}>
              <div className="connectionPaymentTop"><div><span>{request.category.toUpperCase()} · {payWithAspire ? 'PAY WITH ASPIRE' : 'OFF-PLATFORM'}</span><h3>{request.title}</h3></div><strong>{money(base, request.currency)}</strong></div>
              {payWithAspire && quote && <div className="paymentFeeBreakdown">{isRequester ? <><div><span>Service</span><strong>{money(base, request.currency)}</strong></div><div><span>Aspire fee</span><strong>{money(quote.requesterFeeCents, request.currency)}</strong></div><div className="total"><span>Total</span><strong>{money(total, request.currency)}</strong></div></> : <><div><span>Service amount</span><strong>{money(base, request.currency)}</strong></div><div><span>Aspire platform fee</span><strong>−{money(quote.providerFeeCents, request.currency)}</strong></div><div className="total"><span>You earn</span><strong>{money(net, request.currency)}</strong></div></>}</div>}
              {payWithAspire && !payment && <div className="paymentProtectionNote"><strong>Before you pay</strong><span>Eligible issues opened before provider release can pause payout for Aspire review. Refunds depend on the transaction state and case outcome. Provider cancellation/no-show compensation is not automatic unless a specific amount or formula is shown for the transaction.</span><a href="/resolution-policy">Cancellation, No-Show &amp; Refund Policy →</a></div>}
              <div className={`connectionPaymentState ${state.tone}`}><b>{state.title}</b><p>{state.body}</p>{resolutionCase && <a href="/resolution">Open Resolution Center →</a>}</div>
              <div className="paymentProgress"><span className={canWork || payment ? 'done' : ''}>1 <b>Connected</b></span><span className={paidConfirmed ? 'done' : paidProcessing ? 'current' : ''}>2 <b>{paidProcessing ? 'Processing' : 'Paid'}</b></span><span className={bothComplete ? 'done' : selfComplete ? 'current' : ''}>3 <b>Complete</b></span><span className={finalStepClass}>4 <b>{finalStepLabel}</b></span></div>
              <div className="connectionPaymentActions">
                {!payWithAspire && isRequester && canWork && Number(base || 0) > 0 && <button type="button" className="button buttonGold" onClick={() => chooseAspire(connection.id)} disabled={busy === `method-${connection.id}`}>Use Pay with Aspire →</button>}
                {payWithAspire && isRequester && canWork && (!payment || ['failed','checkout_created'].includes(payment.status)) && <button type="button" className="button buttonGold" onClick={() => checkout(connection.id)} disabled={busy === `pay-${connection.id}`}>{busy === `pay-${connection.id}` ? 'Opening Stripe…' : `Secure ${money(total, request.currency)} →`}</button>}
                {payWithAspire && isResponder && canWork && !payment && <a href="/profile">Set up payouts →</a>}
                {secured && !selfComplete && !resolutionCase && <button type="button" className="button buttonGold" onClick={() => complete(connection.id)} disabled={busy === `complete-${connection.id}`}>Mark complete ✓</button>}
                {secured && selfComplete && !bothComplete && !resolutionCase && <span className="paymentWaiting">You marked complete · waiting for the other person</span>}
                {secured && bothComplete && !resolutionCase && <button type="button" className="button buttonGold" onClick={() => retryRelease(connection.id)} disabled={busy === `release-${connection.id}`}>{busy === `release-${connection.id}` ? 'Releasing…' : 'Release payout →'}</button>}
                {resolutionCase && <span className="paymentWaiting">Resolution case open · payout actions are paused · <a href="/resolution">View case</a></span>}
                {released && <span className="paymentReleased">Released through Stripe ✓ · <a href="/money">View money trail</a></span>}
                {refunded && <span className="paymentRefunded">Refund issued ✓ · <a href="/resolution">View resolution</a></span>}
                {disputed && <span className="paymentDisputed">Payment dispute open · <a href="/resolution">View Resolution Center</a></span>}
                {cancelled && <span className="paymentCancelled">Payment cancelled · no payout due</span>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
