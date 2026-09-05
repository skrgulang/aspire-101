'use client';

import { FormEvent, useEffect, useState } from 'react';
import { fetchMySchoolVerification, SchoolVerification, submitSchoolVerification } from '../lib/supabase/trust';

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
    return <article className="profileCard profileSchoolIdCard"><span>SCHOOL ID</span><strong>Checking…</strong><p>Loading verification status.</p></article>;
  }

  if (verification?.status === 'verified') {
    const masked = verification.student_id.length > 4 ? `••••${verification.student_id.slice(-4)}` : verification.student_id;
    return (
      <article id="school-verification" className="profileCard profileSchoolIdCard isVerified">
        <span>SCHOOL ID</span>
        <strong>Verified ✓</strong>
        <p>{verification.school} · {masked}</p>
        <small>Required for posting. Your full school ID is not shown publicly.</small>
      </article>
    );
  }

  const pending = verification?.status === 'pending';
  const rejected = verification?.status === 'rejected';

  return (
    <article id="school-verification" className={`profileCard profileSchoolIdCard ${pending ? 'isPending' : ''} ${rejected ? 'isRejected' : ''}`.trim()}>
      <span>SCHOOL ID · REQUIRED TO POST</span>
      <strong>{pending ? 'Waiting for review' : rejected ? 'Needs another look' : 'Verify before posting'}</strong>
      <p>{rejected && verification?.review_note ? verification.review_note : 'Enter the student ID issued by your university. It stays in the private verification system and is reviewed by Aspire moderators.'}</p>

      {!pending && (
        <form className="schoolIdForm" onSubmit={submit}>
          <label>
            <span>School ID</span>
            <input value={studentId} onChange={(event) => setStudentId(event.target.value)} placeholder="Student ID number" minLength={3} maxLength={64} autoComplete="off" required />
          </label>
          <button type="submit" className="button buttonGold" disabled={busy}>{busy ? 'Submitting…' : rejected ? 'Resubmit ID →' : 'Submit for verification →'}</button>
        </form>
      )}

      {pending && <small>Posting stays locked until a moderator approves this ID.</small>}
      {message && <p className="schoolIdMessage" role="status">{message}</p>}
    </article>
  );
}
