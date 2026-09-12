'use client';

import { FormEvent, useMemo, useState } from 'react';
import styles from './ambassadors.module.css';

const interestOptions = ['Campus growth', 'Events', 'Content', 'Partnerships', 'Product feedback'];

export default function AmbassadorApplicationForm() {
  const startedAt = useMemo(() => Date.now(), []);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [interests, setInterests] = useState<string[]>([]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/ambassadors/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fullName: form.get('fullName'),
          school: form.get('school'),
          schoolEmail: form.get('schoolEmail'),
          majorYear: form.get('majorYear'),
          whyAspire: form.get('whyAspire'),
          campusInvolvement: form.get('campusInvolvement'),
          socialLinks: form.get('socialLinks'),
          availability: form.get('availability'),
          interests,
          website: form.get('website'),
          startedAt
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Could not submit your application.');
      setSuccess(true);
      event.currentTarget.reset();
      setInterests([]);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not submit your application.');
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <aside className={`${styles.applyCard} ${styles.applicationForm}`} id="apply" aria-live="polite">
        <div className={styles.cardIcon}>✓</div>
        <p className={styles.cardEyebrow}>APPLICATION RECEIVED</p>
        <h2>Thanks for raising your hand.</h2>
        <p>We received your Campus Ambassador application. If there’s a fit, the Aspire 101 team will follow up using your school email.</p>
        <button type="button" className={styles.resetButton} onClick={() => setSuccess(false)}>Submit another application</button>
      </aside>
    );
  }

  return (
    <aside className={`${styles.applyCard} ${styles.applicationForm}`} id="apply" aria-label="Campus ambassador application form">
      <p className={styles.cardEyebrow}>APPLICATIONS OPEN</p>
      <h2>Apply in a few minutes.</h2>
      <p>No résumé required. Tell us about your campus, your involvement, and what you’d want to build.</p>
      <form onSubmit={submit}>
        <input className={styles.honeypot} type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
        <div className={styles.formGrid}>
          <label><span>Full name *</span><input name="fullName" required maxLength={120} placeholder="Your name" /></label>
          <label><span>School *</span><input name="school" required maxLength={160} placeholder="Purdue University" /></label>
          <label><span>School email *</span><input name="schoolEmail" required type="email" maxLength={254} placeholder="you@school.edu" /></label>
          <label><span>Major / year</span><input name="majorYear" maxLength={160} placeholder="Computer Science · Junior" /></label>
        </div>
        <label><span>Why do you want to be an ambassador? *</span><textarea name="whyAspire" required minLength={10} maxLength={3000} rows={4} placeholder="What interests you about building Aspire 101 on your campus?" /></label>
        <label><span>Campus involvement</span><textarea name="campusInvolvement" maxLength={2000} rows={3} placeholder="Clubs, student orgs, dorm communities, events, leadership roles…" /></label>
        <div className={styles.formGrid}>
          <label><span>Social / portfolio links</span><input name="socialLinks" maxLength={1000} placeholder="LinkedIn, Instagram, portfolio…" /></label>
          <label><span>Availability</span><select name="availability" defaultValue=""><option value="">Select</option><option>1–3 hrs/week</option><option>3–5 hrs/week</option><option>5–10 hrs/week</option><option>10+ hrs/week</option></select></label>
        </div>
        <fieldset className={styles.interests}><legend>What sounds most interesting?</legend><div>{interestOptions.map((option) => <label key={option}><input type="checkbox" checked={interests.includes(option)} onChange={(event) => setInterests((current) => event.target.checked ? [...current, option] : current.filter((item) => item !== option))} /><span>{option}</span></label>)}</div></fieldset>
        {error && <p className={styles.formError} role="alert">{error}</p>}
        <button className={styles.submitButton} type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit application'} <span>→</span></button>
        <small>By submitting, you agree that Aspire 101 may contact you about this application.</small>
      </form>
    </aside>
  );
}
