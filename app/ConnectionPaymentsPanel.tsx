'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchMyConnections } from '../lib/supabase/connections';
import type { AspireConnection, PublicProfile } from '../lib/supabase/connections';
import type { AspireRequest } from '../lib/supabase/requests';
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

type PaymentWorkspace = {
  userId: string;
  connections: AspireConnection[];
  requests: AspireRequest[];
  profiles: PublicProfile[];
  payments: ConnectionPayment[];
  completions: CompletionConfirmation[];
  quotes: AspireFeeQuote[];
};

function money(cents: number | null | undefined, currency = 'USD') {
  if (cents == null) return 'Amount not set';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

function profileName(profile?: PublicProfile) {
  return profile?.display_name || profile?.full_name || profile?.name || 'Aspire student';
}

const paymentCopy: Record<string, { label: string; detail: string }> = {
  checkout_created: { label: 'Checkout started', detail: 'Stripe checkout was created. Payment is not secured until Stripe confirms it.' },
  processing: { label: 'Payment processing', detail: 'Stripe is confirming the payment. This can take a little time for some payment methods.' },
  secured: { label: 'Payment secured ✓', detail: 'Aspire has confirmation from Stripe. Funds are released only after both people mark the connection complete.' },
  released: { label: 'Payment released ✓', detail: 'The provider payout was released through Stripe.' },
  failed: { label: 'Payment needs another try', detail: 'The previous payment attempt did not complete.' },
  refunded: { label: 'Payment refunded', detail: 'Stripe reports this payment as refunded.' },
  disputed: { label: 'Payment disputed', detail: 'This payment has an open Stripe dispute and payout actions are paused.' },
  cancelled: { label: 'Payment cancelled', detail: 'This Aspire payment was cancelled.' }
};

export default function ConnectionPaymentsPanel() {
  const [data, setData] = useState<PaymentWorkspace>({ userId: '', connections: [], requests: [], profiles: [], payments: [], completions: [], quotes: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');

  const reload = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const base = await fetchMyConnections();
      const ids = base.connections.map((connection) => connection.id);
      const requestById = new Map(base.requests.map((request) => [request.id, request]));
      const quoteConnections = base.connections.filter((connection) => {
        const request = requestById.get(connection.request_id);
        return request && ['paid_help', 'split_cost', 'buy_sell'].includes(request.kind) && Number(connection.agreed_amount_cents ?? request.amount_cents ?? 0) > 0;
      });
      const [payments, completions, quoteResults] = await Promise.all([
        fetchConnectionPayments(ids),
        fetchCompletionConfirmations(ids),
        Promise.all(quoteConnections.map((connection) => fetchAspireFeeQuote(connection.id).catch(() => null)))
      ]);
      setData({ ...base, payments, completions, quotes: quoteResults.filter(Boolean) as AspireFeeQuote[] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load payment activity.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const state = params.get('payment');
      if (state === 'success') {
        setNotice('Payment submitted. Waiting for Stripe confirmation…');
        const first = window.setTimeout(() => void reload(true), 1500);
        const second = window.setTimeout(() => void reload(true), 4000);
        return () => { window.clearTimeout(first); window.clearTimeout(second); };
      }
      if (state === 'cancelled') setNotice('Stripe checkout was cancelled. No new payment was secured.');
    }
  }, [reload]);

  const requestMap = useMemo(() => new Map(data.requests.map((request) => [request.id, request])), [data.requests]);
  const profileMap = useMemo(() => new Map(data.profiles.map((profile) => [profile.id, profile])), [data.profiles]);
  const paymentMap = useMemo(() => new Map(data.payments.map((payment) => [payment.connection_id, payment])), [data.payments]);
  const quoteMap = useMemo(() => new Map(data.quotes.map((quote) => [quote.connectionId, quote])), [data.quotes]);
  const completionMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    data.completions.forEach((item) => {
      const current = map.get(item.connection_id) ?? new Set<string>();
      current.add(item.user_id);
      map.set(item.connection_id, current);
    });
    return map;
  }, [data.completions]);

  const paidConnections = useMemo(() => data.connections.filter((connection) => {
    const request = requestMap.get(connection.request_id);
    return request && ['paid_help', 'split_cost', 'buy_sell'].includes(request.kind);
  }), [data.connections, requestMap]);

  async function chooseAspire(connectionId: string) {
    setBusy(`method-${connectionId}`);
    setNotice('');
    try {
      await setConnectionPaymentMethod(connectionId, 'aspire');
      setNotice('Pay with Aspire selected for this connection.');
      await reload(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not change the payment method.');
    } finally {
      setBusy('');
    }
  }

  async function startCheckout(connectionId: string) {
    setBusy(`pay-${connectionId}`);
    setNotice('');
    try {
      const checkout = await createAspireCheckout(connectionId);
      window.location.assign(checkout.url);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not start Aspire payment.');
      setBusy('');
    }
  }

  async function markComplete(connectionId: string) {
    setBusy(`complete-${connectionId}`);
    setNotice('');
    try {
      const count = await confirmConnectionCompletion(connectionId);
      setNotice(count >= 2 ? 'Both people marked this complete. Releasing the secured payment…' : 'Marked complete. Waiting for the other person.');
      await reload(true);
      if (count >= 2) {
        try {
          await releaseAspirePayment(connectionId);
          setNotice('Payment released through Stripe ✓');
          await reload(true);
        } catch (error) {
          const code = (error as Error & { code?: string }).code;
          if (code === 'PAYMENT_NOT_SECURED') {
            setNotice('Both people marked complete. Stripe payment is not secured yet, so nothing was released.');
          } else {
            setNotice(error instanceof Error ? error.message : 'Completion saved, but payout could not be released yet.');
          }
        }
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not mark this connection complete.');
    } finally {
      setBusy('');
    }
  }

  if (loading) return <section className="connectionPayments paymentSkeleton"><span /><span /><span /></section>;
  if (!paidConnections.length) return null;

  return (
    <section className="connectionPayments" aria-label="Aspire payments">
      <header className="connectionPaymentsHead">
        <div><span>PAYMENTS</span><h2>Money stays attached to the connection.</h2></div>
        <p>Pay with Aspire uses Stripe. Cash, Venmo, or other off-platform payments are not processed or protected as Aspire payments.</p>
      </header>

      {notice && <div className="connectionPaymentsNotice" role="status">{notice}</div>}

      <div className="connectionPaymentList">
        {paidConnections.map((connection) => {
          const request = requestMap.get(connection.request_id)!;
          const payment = paymentMap.get(connection.id);
          const quote = quoteMap.get(connection.id);
          const completionIds = completionMap.get(connection.id) ?? new Set<string>();
          const otherId = data.userId === connection.requester_id ? connection.responder_id : connection.requester_id;
          const other = profileMap.get(otherId);
          const isRequester = data.userId === connection.requester_id;
          const isResponder = data.userId === connection.responder_id;
          const selfComplete = completionIds.has(data.userId);
          const bothComplete = completionIds.has(connection.requester_id) && completionIds.has(connection.responder_id);
          const canWork = ['confirmed', 'active'].includes(connection.status);
          const payWithAspire = connection.payment_method === 'aspire';
          const paymentState = payment ? paymentCopy[payment.status] : null;
          const secured = payment?.status === 'secured';
          const released = payment?.status === 'released';
          const agreedAmount = connection.agreed_amount_cents ?? request.amount_cents;
          const baseAmount = payment?.base_amount_cents ?? quote?.baseAmountCents ?? agreedAmount;
          const requesterFee = payment?.requester_fee_cents ?? quote?.requesterFeeCents;
          const providerFee = payment?.provider_fee_cents ?? quote?.providerFeeCents;
          const customerTotal = payment?.customer_total_cents ?? quote?.customerTotalCents;
          const providerNet = payment?.provider_net_cents ?? quote?.providerNetCents;
          const minimumOrder = quote?.minimumPaidOrderCents ?? payment?.base_amount_cents && 0;
          const belowMinimum = quote ? quote.baseAmountCents < quote.minimumPaidOrderCents : false;

          return (
            <article className={`connectionPaymentCard state-${payment?.status || (payWithAspire ? 'not_started' : 'off_platform')}`} key={connection.id}>
              <div className="connectionPaymentTop">
                <div><span>{request.category.toUpperCase()} · {payWithAspire ? 'PAY WITH ASPIRE' : 'OFF-PLATFORM PAYMENT'}</span><h3>{request.title}</h3></div>
                <strong>{money(baseAmount, request.currency)}</strong>
              </div>

              <div className="connectionPaymentPerson"><i>{profileName(other).slice(0, 1).toUpperCase()}</i><span><strong>{profileName(other)}</strong><small>{isRequester ? 'Provider' : 'Requester'}</small></span></div>

              {payWithAspire && requesterFee != null && providerFee != null && customerTotal != null && providerNet != null && (
                <div className="paymentFeeBreakdown">
                  {isRequester ? (
                    <>
                      <div><span>Service</span><strong>{money(baseAmount, request.currency)}</strong></div>
                      <div><span>Aspire 101 Service Fee</span><strong>{money(requesterFee, request.currency)}</strong></div>
                      <div className="total"><span>Total</span><strong>{money(customerTotal, request.currency)}</strong></div>
                    </>
                  ) : (
                    <>
                      <div><span>Job amount</span><strong>{money(baseAmount, request.currency)}</strong></div>
                      <div><span>Aspire 101 Platform Fee</span><strong>−{money(providerFee, request.currency)}</strong></div>
                      <div className="total"><span>You earn</span><strong>{money(providerNet, request.currency)}</strong></div>
                    </>
                  )}
                  <small>{payment?.fee_policy_version || quote?.feePolicyVersion} · Tips carry 0% Aspire platform commission in this beta.</small>
                </div>
              )}

              {!payWithAspire ? (
                <>
                  <div className="connectionPaymentState offPlatform"><b>Not processed by Aspire</b><p>This connection is currently set to pay in person or agree payment privately. Aspire does not verify those payments.</p></div>
                  <div className="connectionPaymentActions">
                    {isRequester && canWork && Number(agreedAmount || 0) > 0 && (
                      <button type="button" className="button buttonGold" onClick={() => chooseAspire(connection.id)} disabled={busy === `method-${connection.id}`}>
                        {busy === `method-${connection.id}` ? 'Switching…' : 'Use Pay with Aspire →'}
                      </button>
                    )}
                    {!isRequester && <span className="paymentWaiting">The requester chooses how this connection is paid.</span>}
                  </div>
                </>
              ) : (
                <>
                  <div className={`connectionPaymentState ${payment?.status || 'notStarted'}`}>
                    <b>{paymentState?.label || (belowMinimum ? 'Below Aspire payment minimum' : 'Payment not secured yet')}</b>
                    <p>{paymentState?.detail || (belowMinimum
                      ? `This beta requires at least ${money(minimumOrder || 0, request.currency)} before Pay with Aspire can be used.`
                      : isRequester
                        ? 'Stripe charges the service amount plus the requester service fee. The provider receives the service amount minus their platform fee after completion.'
                        : 'The requester secures the total through Stripe. Your net earnings are transferred to your connected account only after both sides mark the connection complete.')}</p>
                  </div>

                  <div className="paymentProgress" aria-label="Payment progress">
                    <span className={canWork ? 'done' : ''}>1 <b>Connected</b></span>
                    <span className={payment && ['processing','secured','released'].includes(payment.status) ? 'done' : ''}>2 <b>Paid</b></span>
                    <span className={bothComplete ? 'done' : selfComplete ? 'current' : ''}>3 <b>Complete</b></span>
                    <span className={released ? 'done' : ''}>4 <b>Released</b></span>
                  </div>

                  <div className="connectionPaymentActions">
                    {isRequester && canWork && !belowMinimum && (!payment || ['failed','checkout_created'].includes(payment.status)) && (
                      <button type="button" className="button buttonGold" onClick={() => startCheckout(connection.id)} disabled={busy === `pay-${connection.id}`}>
                        {busy === `pay-${connection.id}` ? 'Opening Stripe…' : payment?.status === 'checkout_created' ? `Continue payment · ${money(customerTotal, request.currency)} →` : `Secure ${money(customerTotal, request.currency)} →`}
                      </button>
                    )}
                    {isResponder && canWork && !payment && <a href="/profile">Set up payouts →</a>}
                    {secured && !selfComplete && (
                      <button type="button" className="button buttonGold" onClick={() => markComplete(connection.id)} disabled={busy === `complete-${connection.id}`}>
                        {busy === `complete-${connection.id}` ? 'Saving…' : 'Mark complete ✓'}
                      </button>
                    )}
                    {secured && selfComplete && !bothComplete && <span className="paymentWaiting">You marked complete · waiting for the other person</span>}
                    {released && <span className="paymentReleased">Released through Stripe ✓</span>}
                  </div>
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
