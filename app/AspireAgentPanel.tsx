'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AspireAgentResponse,
  markAspireAgentOutcome,
  runAspireAgent,
  saveAspireAgentDraft,
  saveAspireAgentMatches
} from '../lib/supabase/aspireAi';

const quickPrompts = [
  'Get to the airport tomorrow',
  'Find a study partner',
  'Sell something on campus',
  'I need help moving',
  'Find a project teammate'
];

function money(value: number | null | undefined) {
  if (value == null) return null;
  return `$${(value / 100).toFixed(value % 100 === 0 ? 0 : 2)}`;
}

export default function AspireAgentPanel({ campusId, campusName }: { campusId: string; campusName: string }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AspireAgentResponse | null>(null);

  async function run(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const clean = message.trim();
    if (clean.length < 3) return setError('Tell Aspire what you are trying to make happen.');
    setBusy(true);
    setError('');
    try {
      const next = await runAspireAgent(clean, campusId);
      setResult(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aspire Agent could not finish that plan.');
    } finally {
      setBusy(false);
    }
  }

  function usePrompt(value: string) {
    setMessage(value);
    setResult(null);
    setError('');
  }

  function openMatches() {
    if (!result?.matches.length) return;
    saveAspireAgentMatches(result.sessionId, result.matches);
    void markAspireAgentOutcome(result.sessionId, 'opened_match').catch(() => undefined);
    router.push('/discover?agent=1');
  }

  function buildRequest() {
    if (!result?.plan) return;
    saveAspireAgentDraft(result.sessionId, result.plan);
    void markAspireAgentOutcome(result.sessionId, 'drafted_post').catch(() => undefined);
    router.push('/post?agent=1');
  }

  return (
    <section className="aspireAgent" aria-label="Aspire Agent">
      <div className="aspireAgentHalo" aria-hidden="true" />
      <div className="aspireAgentHead">
        <div>
          <span className="aspireAgentKicker"><i>✦</i> ASPIRE AGENT</span>
          <h2>What are you trying to <em>make happen?</em></h2>
          <p>Describe the outcome. Aspire can understand the need, look across {campusName}, and prepare the next step.</p>
        </div>
        <b>AI DRIVE · BETA</b>
      </div>

      <form className="aspireAgentComposer" onSubmit={run}>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={`Try “My flight lands late and I need to get back to ${campusName}.”`}
          rows={3}
          maxLength={1200}
          aria-label="Tell Aspire Agent what you need"
        />
        <div>
          <span>{message.length ? `${message.length}/1200` : 'Need → understand → match → act'}</span>
          <button type="submit" disabled={busy}>{busy ? 'Thinking…' : 'Ask Aspire'} <i>✦</i></button>
        </div>
      </form>

      {!result && <div className="aspireAgentQuick"><span>TRY</span>{quickPrompts.map((prompt) => <button type="button" key={prompt} onClick={() => usePrompt(prompt)}>{prompt}</button>)}</div>}
      {error && <p className="aspireAgentError" role="alert">{error}</p>}

      {result && (
        <div className={`aspireAgentResult status-${result.status}`}>
          <div className="aspireAgentResultTop">
            <span><i>✦</i> ASPIRE UNDERSTOOD</span>
            <button type="button" onClick={() => { setResult(null); setError(''); }}>Start over</button>
          </div>
          <p className="aspireAgentVoice">{result.assistantMessage}</p>

          {result.plan && (
            <>
              <div className="aspireAgentFacts">
                <span><b>TYPE</b>{result.plan.category}</span>
                {result.plan.time_text && <span><b>WHEN</b>{result.plan.time_text}</span>}
                {result.plan.place_text && <span><b>WHERE</b>{result.plan.place_text}</span>}
                {money(result.plan.amount_cents) && <span><b>AMOUNT</b>{money(result.plan.amount_cents)}</span>}
                <span><b>CONFIDENCE</b>{result.plan.confidence.toUpperCase()}</span>
              </div>

              {result.plan.questions.length > 0 && <div className="aspireAgentQuestions"><strong>I still need:</strong>{result.plan.questions.map((question) => <span key={question}>· {question}</span>)}</div>}

              {result.matches.length > 0 && (
                <div className="aspireAgentMatches">
                  <div><span>ASPIRE MATCH</span><strong>{result.matches.length} existing {result.matches.length === 1 ? 'possibility' : 'possibilities'} on {campusName}</strong></div>
                  {result.matches.slice(0, 3).map((match) => (
                    <article key={match.id}>
                      <b className={match.strength}>{match.strength === 'strong' ? 'STRONG MATCH' : 'POSSIBLE'}</b>
                      <strong>{match.title}</strong>
                      <p>{match.reason}</p>
                      {money(match.amount_cents) && <small>{money(match.amount_cents)} · {match.category}</small>}
                    </article>
                  ))}
                </div>
              )}

              <div className="aspireAgentActions">
                {result.matches.length > 0 && <button type="button" className="button buttonGold" onClick={openMatches}>View best matches <span>→</span></button>}
                <button type="button" className={result.matches.length ? 'aspireAgentSecondary' : 'button buttonGold'} onClick={buildRequest}>{result.plan.status === 'needs_details' ? 'Open editable draft' : 'Create request draft'} <span>↗</span></button>
              </div>
              <small className="aspireAgentFine">Aspire Agent proposes actions; you stay in control. Any post still passes Safety Intelligence and human review before it can appear publicly.</small>
            </>
          )}

          {result.status === 'blocked' && <small className="aspireAgentFine">Safety by design: Aspire Agent will not turn prohibited activity into a campus action.</small>}
        </div>
      )}
    </section>
  );
}
