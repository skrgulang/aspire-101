'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { aspireLogo } from '../logo';

type Interest = 'desktop' | 'mobile' | 'campus-launches' | 'product-updates';

const updateOptions: Array<{ id: Interest; title: string; note: string }> = [
  { id: 'desktop', title: 'Desktop app', note: 'Get notified when Aspire comes to desktop.' },
  { id: 'mobile', title: 'Mobile app', note: 'iOS / Android launch updates.' },
  { id: 'campus-launches', title: 'Campus launches', note: 'Know when Aspire expands to more schools.' },
  { id: 'product-updates', title: 'Product updates', note: 'Major new features and releases.' }
];

export default function UpdatesPage() {
  const [email, setEmail] = useState('');
  const [school, setSchool] = useState('');
  const [interests, setInterests] = useState<Interest[]>(['product-updates', 'campus-launches']);
  const [website, setWebsite] = useState('');
  const [startedAt] = useState(() => Date.now());
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialEmail = params.get('email');
    if (initialEmail) setEmail(initialEmail);
  }, []);

  const selectedLabel = useMemo(() => {
    if (!interests.length) return 'Choose at least one';
    if (interests.length === updateOptions.length) return 'All product updates';
    return `${interests.length} update${interests.length === 1 ? '' : 's'} selected`;
  }, [interests]);

  function toggleInterest(id: Interest) {
    setInterests((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    if (!interests.length) {
      setStatus('error');
      setMessage('Choose at least one kind of update.');
      return;
    }

    setStatus('loading');
    try {
      const response = await fetch('/api/updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, school, interests, website, startedAt })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Could not join the list.');
      setStatus('success');
      setMessage('You’re on the list. We’ll only reach out for meaningful Aspire launches and updates.');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Could not join the list.');
    }
  }

  return (
    <main className="updatesPage">
      <header className="updatesNav shell">
        <a href="/" className="updatesBrand" aria-label="Aspire 101 home">
          <img src={aspireLogo} alt="" />
          <span>Aspire 101</span>
        </a>
        <a className="updatesBack" href="/">Back to Aspire →</a>
      </header>

      <section className="updatesShell shell">
        <div className="updatesIntro">
          <div className="updatesEnvelope" aria-hidden="true">✉</div>
          <p className="updatesEyebrow">PRODUCT UPDATES</p>
          <h1>Stay in the loop.</h1>
          <p>Join the Aspire 101 updates list and be the first to know about desktop, mobile, new campus launches, and major product releases.</p>
          <div className="updatesCompanyNote">
            <span>Aspire 101</span>
            <strong>A product of Cloudora Labs, Inc.</strong>
          </div>
        </div>

        <form className="updatesForm" onSubmit={submit} noValidate>
          <label>
            <span>Email address <b>*</b></span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>

          <label>
            <span>School <b>*</b></span>
            <small>We’ll use this to understand where Aspire should grow next.</small>
            <input
              type="text"
              autoComplete="organization"
              value={school}
              onChange={(event) => setSchool(event.target.value)}
              placeholder="Purdue University"
              required
            />
          </label>

          <fieldset className="updatesChoices">
            <legend>What should we tell you about?</legend>
            <p>{selectedLabel}</p>
            <div>
              {updateOptions.map((option) => {
                const selected = interests.includes(option.id);
                return (
                  <button
                    key={option.id}
                    className={selected ? 'selected' : ''}
                    type="button"
                    onClick={() => toggleInterest(option.id)}
                    aria-pressed={selected}
                  >
                    <i>{selected ? '✓' : '+'}</i>
                    <span><strong>{option.title}</strong><small>{option.note}</small></span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label className="updatesTrap" aria-hidden="true">
            Website
            <input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
          </label>

          <button className="updatesSubmit" type="submit" disabled={status === 'loading' || status === 'success'}>
            {status === 'loading' ? 'Joining…' : status === 'success' ? 'You’re on the list ✓' : 'Join updates →'}
          </button>

          {message && <p className={`updatesMessage ${status}`}>{message}</p>}

          <p className="updatesFinePrint">
            No passwords or sensitive information. For business, partnerships, or urgent company matters, contact <a href="mailto:business@aspires101.com">business@aspires101.com</a>.
          </p>
        </form>
      </section>
    </main>
  );
}
