'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchMyConnections } from '../lib/supabase/connections';
import {
  acceptConnectionPaymentTerms,
  fetchConnectionPaymentAgreements,
  proposeConnectionPaymentTerms,
  type ConnectionPaymentAgreement
} from '../lib/supabase/delivery';

function money(cents: number, currency = 'USD') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

function profileName(profile: any) {
  return profile?.display_name || profile?.full_name || profile?.name || 'Aspire student';
}

export default function PaymentTermsPanel() {
  const [base, setBase] = useState<Awaited<ReturnType<typeof fetchMyConnections>> | null>(null);
  const [agreements, setAgreements] = useState<ConnectionPaymentAgreement[]>([]);
  const [amounts, setAmounts] = useState<Record<string,string>>({});
  const [methods, setMethods] = useState<Record<string,'aspire'|'in_person'>>({});
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');

  const reload = useCallback(async () => {
    const next = await fetchMyConnections();
    const requestMap = new Map(next.requests.map((request) => [request.id, request]));
    const eligible = next.connections.filter((connection) => {
      const request = requestMap.get(connection.request_id);
      if (!request || !['paid_help','split_cost'].includes(request.kind)) return false;
      if (!['confirmed','active'].includes(connection.status)) return false;
      return !connection.agreed_amount_cents || connection.payment_method === 'none';
    });
    const nextAgreements = await fetchConnectionPaymentAgreements(eligible.map((connection) => connection.id));
    setBase({ ...next, connections: eligible });
    setAgreements(nextAgreements);
  }, []);

  useEffect(() => { void reload().catch((error) => setNotice(error instanceof Error ? error.message : 'Could not load payment terms.')); }, [reload]);

  const requestMap = useMemo(() => new Map((base?.requests ?? []).map((request) => [request.id, request])), [base]);
  const profileMap = useMemo(() => new Map((base?.profiles ?? []).map((profile) => [profile.id, profile])), [base]);
  const agreementMap = useMemo(() => new Map(agreements.map((agreement) => [agreement.connection_id, agreement])), [agreements]);

  if (!base?.connections.length) return null;

  async function propose(connectionId: string) {
    const dollars = Number(amounts[connectionId] || 0);
    const cents = Math.round(dollars * 100);
    if (!Number.isFinite(cents) || cents <= 0) return setNotice('Enter a positive amount first.');
    const method = methods[connectionId] || 'aspire';
    setBusy(`propose-${connectionId}`);
    setNotice('');
    try {
      await proposeConnectionPaymentTerms(connectionId, cents, method);
      setNotice('Terms proposed. The other person must accept the same amount and payment method.');
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not propose payment terms.');
    } finally { setBusy(''); }
  }

  async function accept(connectionId: string) {
    setBusy(`accept-${connectionId}`);
    setNotice('');
    try {
      const agreement = await acceptConnectionPaymentTerms(connectionId);
      if (agreement.status === 'agreed') setNotice(agreement.payment_method === 'aspire' ? 'Payment terms agreed ✓ You can now use Pay with Aspire.' : 'Payment terms agreed. This payment is off-platform and not Aspire Protected.');
      else setNotice('Accepted. Waiting for the other person.');
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not accept payment terms.');
    } finally { setBusy(''); }
  }

  return (
    <section className="paymentTerms" aria-label="Agree payment terms">
      <header><div><span>AGREE THE MONEY</span><h2>Matched first? Decide the amount together.</h2></div><p>For requests that said “decide later,” either person can propose an amount. Both sides must accept the same terms before money is treated as agreed.</p></header>
      {notice && <p className="paymentTermsNotice" role="status">{notice}</p>}
      <div className="paymentTermsList">
        {base.connections.map((connection) => {
          const request = requestMap.get(connection.request_id)!;
          const agreement = agreementMap.get(connection.id);
          const isRequester = base.userId === connection.requester_id;
          const other = profileMap.get(isRequester ? connection.responder_id : connection.requester_id);
          const selfAccepted = agreement ? (isRequester ? Boolean(agreement.requester_accepted_at) : Boolean(agreement.responder_accepted_at)) : false;
          const otherAccepted = agreement ? (isRequester ? Boolean(agreement.responder_accepted_at) : Boolean(agreement.requester_accepted_at)) : false;
          return <article key={connection.id}>
            <div className="paymentTermsTop"><div><span>{request.category.toUpperCase()} · WITH {profileName(other).toUpperCase()}</span><h3>{request.title}</h3></div>{agreement && <strong>{money(agreement.amount_cents, request.currency)}</strong>}</div>
            {agreement && agreement.status === 'proposed' ? <>
              <div className="paymentTermsProposal"><div><b>PROPOSED</b><strong>{money(agreement.amount_cents, request.currency)}</strong><span>{agreement.payment_method === 'aspire' ? 'Pay with Aspire · protected payment flow + service fee' : 'Direct / in-person · not Aspire Protected'}</span></div><div><span>{selfAccepted ? 'You accepted ✓' : 'Waiting for your acceptance'}</span><span>{otherAccepted ? 'Other person accepted ✓' : 'Waiting for other person'}</span></div></div>
              <div className="paymentTermsActions">{!selfAccepted && <button type="button" className="button buttonGold" onClick={() => accept(connection.id)} disabled={busy === `accept-${connection.id}`}>Accept these terms ✓</button>}<button type="button" className="paymentTermsChange" onClick={() => { setAmounts((v) => ({...v,[connection.id]:(agreement.amount_cents/100).toString()})); setMethods((v) => ({...v,[connection.id]:agreement.payment_method})); }}>Propose different terms</button></div>
            </> : <div className="paymentTermsComposer"><label><span>Amount</span><div><i>$</i><input inputMode="decimal" value={amounts[connection.id] || ''} onChange={(event) => setAmounts((current) => ({...current,[connection.id]:event.target.value}))} placeholder="15" /></div></label><div className="paymentTermsMethods"><button type="button" className={(methods[connection.id] || 'aspire') === 'aspire' ? 'active' : ''} onClick={() => setMethods((current) => ({...current,[connection.id]:'aspire'}))}><strong>Pay with Aspire ✓</strong><small>Stripe payment, Aspire fee, delayed payout, refund/dispute controls.</small></button><button type="button" className={methods[connection.id] === 'in_person' ? 'active' : ''} onClick={() => setMethods((current) => ({...current,[connection.id]:'in_person'}))}><strong>Direct / in person</strong><small>No Aspire transaction fee, but the payment is not Aspire Protected.</small></button></div><button type="button" className="button buttonGold" onClick={() => propose(connection.id)} disabled={busy === `propose-${connection.id}`}>Propose terms →</button></div>}
            <footer><a href="/protection">How Aspire Protected works →</a></footer>
          </article>;
        })}
      </div>
    </section>
  );
}
