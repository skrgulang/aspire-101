'use client';

import { useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

type Pulse = {
  headline: string;
  summary: string;
  signals: Array<{ label: string; count: number; trend: 'up' | 'down' | 'steady' | 'new'; note: string }>;
  watch_for: string;
};

export default function CampusPulsePanel({ campusId, campusName }: { campusId: string; campusName: string }) {
  const [busy, setBusy] = useState(false);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [error, setError] = useState('');

  async function generate() {
    setBusy(true);
    setError('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const token = data.session?.access_token;
      if (!token) throw new Error('Sign in again to use Campus Pulse.');
      const response = await fetch('/api/ai/pulse', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ campusId })
      });
      const payload = await response.json().catch(() => ({})) as { pulse?: Pulse; error?: string };
      if (!response.ok || !payload.pulse) throw new Error(payload.error || 'Campus Pulse could not run.');
      setPulse(payload.pulse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Campus Pulse could not run.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="campusPulseAi">
      <div className="campusPulseAiHead">
        <div><span>✦ CAMPUS PULSE</span><strong>What Aspire is seeing on {campusName}</strong></div>
        <button type="button" onClick={generate} disabled={busy}>{busy ? 'Reading campus…' : pulse ? 'Refresh' : 'Generate pulse'}</button>
      </div>
      {!pulse && !error && <p>AI summarizes approved open activity only when you ask — trends describe Aspire activity, not the entire campus.</p>}
      {error && <p className="campusPulseError">{error}</p>}
      {pulse && <div className="campusPulseBody">
        <h3>{pulse.headline}</h3>
        <p>{pulse.summary}</p>
        {pulse.signals.length > 0 && <div className="campusPulseSignals">{pulse.signals.map((signal) => <article key={`${signal.label}-${signal.count}`}><span>{signal.trend === 'up' ? '↗' : signal.trend === 'down' ? '↘' : signal.trend === 'new' ? '✦' : '→'}</span><strong>{signal.label}</strong><b>{signal.count}</b><small>{signal.note}</small></article>)}</div>}
        <small className="campusPulseWatch">WATCH · {pulse.watch_for}</small>
      </div>}
    </section>
  );
}
