'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchMyConnections } from '../lib/supabase/connections';
import type { AspireConnection, PublicProfile } from '../lib/supabase/connections';
import type { AspireRequest } from '../lib/supabase/requests';
import {
  confirmConnectionCompletion,
  createAspireCheckout,
  fetchCompletionConfirmations,
  fetchConnectionPayments,
  releaseAspirePayment
} from '../lib/supabase/payments';
import type { CompletionConfirmation, ConnectionPayment } from '../lib/supabase/payments';

type PaymentWorkspace = {
  userId: string;
  connections: AspireConnection[];
  requests: AspireRequest[];
  profiles: PublicProfile[];
  payments: ConnectionPayment[];
  completions: CompletionConfirmation[];
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
  const [data, setData] = useState<PaymentWorkspace>({ userId: '', connections: [], requests: [], profiles: [], payments: [], completions: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');

  const reload = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const base = await fetchMyConnections();
      const ids = base.connections.map((connection) => connection.id);
      const [payments, completions] = await Promise.all([
        fetchConnectionPayments(ids),
        fetchCompletionConfirmations(ids)
      ]);
      setData({ ...base, payments, completions });
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
          const completionIds = completionMap.get(connection.id) ?? new Set<string>();
          const otherId = data.userId === connection.requester_id ? connection.responder_id : connection.requester_id;
          const other = profileMap.get(otherId);
          const isRequester = data.userId === connection.requester_id;
          const isResponder = data.userId === connection.responder_id;
          const selfComplete = completionIds.has(data.userId);
          const bothComplete = completionIds.has(connection.requester_id) && completionIds.has(connection.responder_id);
          const canWork = ['confirmed', 'active'].includes(connection.status);
          const payWithAspire = request.payment_method === 'aspire';
          const paymentState = payment ? paymentCopy[payment.status] : null;
          const secured = payment?.status === 'secured';
          const released = payment?.status === 'released';

          return (
            <article className={`connectionPaymentCard state-${payment?.status || (payWithAspire ? 'not_started' : 'off_platform')}`} key={connection.id}>
              <div className="connectionPaymentTop">
                <div><span>{request.category.toUpperCase()} · {payWithAspire ? 'PAY WITH ASPIRE' : 'OFF-PLATFORM PAYMENT'}</span><h3>{request.title}</h3></div>
                <strong>{money(connection.agreed_amount_cents ?? request.amount_cents, request.currency)}</strong>
              </div>

              <div className="connectionPaymentPerson"><i>{profileName(other).slice(0, 1).toUpperCase()}</i><span><strong>{profileName(other)}</strong><small>{isRequester ? 'Receiving money' : 'Requester'}</small></span></div>

              {!payWithAspire ? (
                <div className="connectionPaymentState offPlatform"><b>Not processed by Aspire</b><p>This request is currently set to pay in person or agree payment after connecting.</p></div>
              ) : (
                <>
                  <div className={`connectionPaymentState ${payment?.status || 'notStarted'}`}>
                    <b>{paymentState?.label || 'Payment not secured yet'}</b>
                    <p>{paymentState?.detail || (isRequester ? 'Secure the agreed amount through Stripe after both sides confirm the connection.' : 'The requester secures the agreed amount. Finish payout setup in Profile before they pay.')}</p>
                  </div>

                  <div className="paymentProgress" aria-label="Payment progress">
                    <span className={canWork ? 'done' : ''}>1 <b>Connected</b></span>
                    <span className={payment && ['processing','secured','released'].includes(payment.status) ? 'done' : ''}>2 <b>Paid</b></span>
                    <span className={bothComplete ? 'done' : selfComplete ? 'current' : ''}>3 <b>Complete</b></span>
                    <span className={released ? 'done' : ''}>4 <b>Released</b></span>
                  </div>

                  <div className="connectionPaymentActions">
                    {isRequester && canWork && (!payment || ['failed','checkout_created'].includes(payment.status)) && (
                      <button type="button" className="button buttonGold" onClick={() => startCheckout(connection.id)} disabled={busy === `pay-${connection.id}`}>
                        {busy === `pay-${connection.id}` ? 'Opening Stripe…' : payment?.status === 'checkout_created' ? 'Continue payment →' : 'Secure payment →'}
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
