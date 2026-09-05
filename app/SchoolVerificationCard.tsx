'use client';

import { FormEvent, useEffect, useState } from 'react';
import { fetchMySchoolVerification, submitSchoolVerification } from '../lib/supabase/trust';
import type { SchoolVerification } from '../lib/supabase/trust';

export default function SchoolVerificationCard({ school }: { school: string }) {
  const [verification, setVerification] = useState<SchoolVerification | null>(null);
  const [studentId, setStudentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchMySchoolVerification()
      .then((value) => {
        setVerification(value);
        if (value?.status !== 'verified') setStudentId(value?.student_id ?? '');
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Could not load school verification.'))
      .finally(() => setLoading(false));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const next = await submitSchoolVerification(school, studentId);
      setVerification(next);
      setMessage('School ID submitted. A moderator needs to approve it before you can post.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not submit your school ID.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <article className="profileCard profileSchoolIdCard"><span>SCHOOL VERIFICATION</span><strong>Checking…</strong><p>Loading verification status.</p></article>;
  }

  if (verification?.status === 'verified') {
    const byEmail = verification.verification_method === 'school_email';
    const masked = verification.student_id
      ? verification.student_id.length > 4 ? `••••${verification.student_id.slice(-4)}` : verification.student_id
      : null;
    return (
      <article id="school-verification" className="profileCard profileSchoolIdCard isVerified">
        <span>{byEmail ? 'SCHOOL EMAIL' : 'SCHOOL ID'}</span>
        <strong>Verified {verification.school} Student ✓</strong>
        <p>{byEmail ? verification.school_email : `${verification.school}${masked ? ` · ${masked}` : ''}`}</p>
        <small>{byEmail ? 'Verified from your confirmed university email. School identity and payment identity are separate.' : 'Verified by Aspire moderation. Your full school ID is not shown publicly.'}</small>
      </article>
    );
  }

  const pending = verification?.status === 'pending';
  const rejected = verification?.status === 'rejected';

  return (
    <article id="school-verification" className={`profileCard profileSchoolIdCard ${pending ? 'isPending' : ''} ${rejected ? 'isRejected' : ''}`.trim()}>
      <span>LEGACY SCHOOL ID VERIFICATION</span>
      <strong>{pending ? 'Waiting for review' : rejected ? 'Needs another look' : 'School email not verified'}</strong>
      <p>{rejected && verification?.review_note ? verification.review_note : 'New Aspire accounts use a supported university email. Existing beta accounts can still submit a school ID for manual review.'}</p>

      {!pending && (
        <form className="schoolIdForm" onSubmit={submit}>
          <label>
            <span>School ID</span>
            <input value={studentId} onChange={(event) => setStudentId(event.target.value)} placeholder="Student ID number" minLength={3} maxLength={64} autoComplete="off" required />
          </label>
          <button type="submit" className="button buttonGold" disabled={busy}>{busy ? 'Submitting…' : rejected ? 'Resubmit ID →' : 'Submit for review →'}</button>
        </form>
      )}

      {pending && <small>Posting stays locked until a moderator approves this legacy verification.</small>}
      {message && <p className="schoolIdMessage" role="status">{message}</p>}
    </article>
  );
}
