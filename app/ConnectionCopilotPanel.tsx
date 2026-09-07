'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchMyConnections } from '../lib/supabase/connections';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

type CopilotResult = {
  summary: string;
  plan_status: 'clear' | 'almost_ready' | 'needs_coordination';
  proposed_time: string | null;
  proposed_place: string | null;
  proposed_amount_cents: number | null;
  open_questions: string[];
  suggested_reply: string;
  safety_note: string;
};

type Option = { id: string; label: string; status: string };

function money(cents: number | null) {
  if (cents == null) return 'Not set';
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export default function ConnectionCopilotPanel() {
  const [options, setOptions] = useState<Option[]>([]);
  const [connectionId, setConnectionId] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CopilotResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchMyConnections().then(({ userId, connections, requests, profiles }) => {
      if (!alive) return;
      const requestMap = new Map(requests.map((request) => [request.id, request]));
      const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
      const next = connections
        .filter((connection) => ['confirmed','active','completed'].includes(connection.status))
        .map((connection) => {
          const request = requestMap.get(connection.request_id);
          const otherId = connection.requester_id === userId ? connection.responder_id : connection.requester_id;
          const other = profileMap.get(otherId);
          const name = other?.display_name || other?.full_name || other?.name || 'Campus connection';
          return { id: connection.id, label: `${request?.title || 'Connection'} · ${name}`, status: connection.status };
        });
      setOptions(next);
      if (next[0]) setConnectionId(next[0].id);
    }).catch((err) => {
      if (alive) setError(err instanceof Error ? err.message : 'Could not load your connections.');
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const selected = useMemo(() => options.find((option) => option.id === connectionId) ?? null, [options, connectionId]);

  async function run() {
    if (!connectionId) return;
    setBusy(true);
    setError('');
    setResult(null);
    setCopied(false);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const token = data.session?.access_token;
      if (!token) throw new Error('Sign in again to use Connection Copilot.');
      const response = await fetch('/api/ai/connection', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId })
      });
      const payload = await response.json().catch(() => ({})) as { copilot?: CopilotResult; error?: string };
      if (!response.ok || !payload.copilot) throw new Error(payload.error || 'Connection Copilot could not run.');
      setResult(payload.copilot);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection Copilot could not run.');
    } finally {
      setBusy(false);
    }
  }

  async function copyReply() {
    if (!result?.suggested_reply) return;
    try {
      await navigator.clipboard.writeText(result.suggested_reply);
      setCopied(true);
    } catch {
      setError('Could not copy the reply. You can still select the text manually.');
    }
  }

  if (loading) return null;

  return (
    <section className="connectionCopilot">
      <div className="connectionCopilotHead">
        <div><span>✦ ASPIRE CONNECTION COPILOT</span><h2>Turn the chat into a plan.</h2><p>Only runs when you ask. It reads this connection’s recent messages to summarize what is agreed and what is still missing.</p></div>
        <b>AI · OPTIONAL</b>
      </div>
      {!options.length ? <p className="connectionCopilotEmpty">Once you have a confirmed connection, Copilot can help coordinate it.</p> : <>
        <div className="connectionCopilotControls">
          <label><span>CONNECTION</span><select value={connectionId} onChange={(event) => { setConnectionId(event.target.value); setResult(null); }}>{options.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select></label>
          <button className="button buttonGold" type="button" onClick={run} disabled={busy}>{busy ? 'Planning…' : 'Plan with Aspire ✦'}</button>
        </div>
        {selected && <small className="connectionCopilotSelected">{selected.status.toUpperCase()} · AI does not send messages or confirm plans for you.</small>}
      </>}
      {error && <p className="connectionCopilotError">{error}</p>}
      {result && <div className="connectionCopilotResult">
        <div className="connectionCopilotStatus"><span>PLAN STATUS</span><b>{result.plan_status.replace('_',' ').toUpperCase()}</b></div>
        <p>{result.summary}</p>
        <div className="connectionCopilotFacts">
          <span><b>TIME</b>{result.proposed_time || 'Not agreed yet'}</span>
          <span><b>PLACE</b>{result.proposed_place || 'Not agreed yet'}</span>
          <span><b>AMOUNT</b>{money(result.proposed_amount_cents)}</span>
        </div>
        {result.open_questions.length > 0 && <div className="connectionCopilotQuestions"><strong>Still to confirm</strong>{result.open_questions.map((question) => <span key={question}>· {question}</span>)}</div>}
        {result.suggested_reply && <div className="connectionCopilotReply"><span>SUGGESTED REPLY</span><p>{result.suggested_reply}</p><button type="button" onClick={copyReply}>{copied ? 'Copied ✓' : 'Copy reply'}</button></div>}
        <small>{result.safety_note}</small>
      </div>}
    </section>
  );
}
