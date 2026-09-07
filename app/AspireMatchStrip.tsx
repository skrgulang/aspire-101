'use client';

import { useEffect, useState } from 'react';
import { clearAspireAgentMatches, markAspireAgentOutcome, readAspireAgentMatches, type AspireAgentMatch } from '../lib/supabase/aspireAi';
import { respondToRequest } from '../lib/supabase/requests';

function money(cents: number | null) {
  if (cents == null) return null;
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

function responseMessage(match: AspireAgentMatch) {
  if (match.kind !== 'buy_sell') return 'I’m interested in this request.';
  return match.market_intent === 'wanted'
    ? 'I have this item and I’m interested in selling it.'
    : 'I’m interested in buying this item.';
}

function actionLabel(match: AspireAgentMatch) {
  if (match.kind !== 'buy_sell') return 'I can help →';
  return match.market_intent === 'wanted' ? 'I have this →' : 'I’m interested →';
}

export default function AspireMatchStrip() {
  const [matches, setMatches] = useState<AspireAgentMatch[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState('');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('agent') !== '1') return;
    const envelope = readAspireAgentMatches();
    if (!envelope?.matches.length) return;
    setMatches(envelope.matches);
    setSessionId(envelope.sessionId);
    setVisible(true);
  }, []);

  async function respond(match: AspireAgentMatch) {
    setBusyId(match.id);
    setNotice('');
    try {
      await respondToRequest(match.id, responseMessage(match));
      await markAspireAgentOutcome(sessionId, 'opened_match').catch(() => undefined);
      setNotice(match.kind === 'buy_sell' ? 'Interest sent. The listing owner can choose whether to connect.' : 'Interest sent. The requester can choose whether to connect.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not send your interest.');
    } finally { setBusyId(''); }
  }

  function dismiss() {
    clearAspireAgentMatches();
    setVisible(false);
  }

  if (!visible || !matches.length) return null;

  return (
    <section className="aspireMatchStrip">
      <div className="aspireMatchStripHead">
        <div><span>✦ ASPIRE MATCH</span><h2>I found a few places to start.</h2><p>These are existing approved campus requests that match the intent you gave Aspire Agent. You decide whether to respond.</p></div>
        <button type="button" onClick={dismiss}>Dismiss</button>
      </div>
      <div className="aspireMatchCards">
        {matches.slice(0, 5).map((match) => <article key={match.id} className={match.strength === 'strong' ? 'strong' : ''}>
          <div className="aspireMatchCardMeta"><b>{match.strength === 'strong' ? 'STRONG MATCH' : 'POSSIBLE'}</b><span>{match.category}</span></div>
          <h3>{match.title}</h3>
          <p>{match.reason}</p>
          <div>{money(match.amount_cents) && <small>{money(match.amount_cents)}</small>}<button className="button buttonGold" type="button" onClick={() => respond(match)} disabled={busyId === match.id}>{busyId === match.id ? 'Sending…' : actionLabel(match)}</button></div>
        </article>)}
      </div>
      {notice && <p className="aspireMatchNotice" role="status">{notice}</p>}
    </section>
  );
}
