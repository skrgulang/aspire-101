'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { fetchMySchoolVerification } from '../lib/supabase/trust';
import type { SchoolVerification } from '../lib/supabase/trust';
import PostRequestForm from './PostRequestForm';

export default function PostAccessGate() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [verification, setVerification] = useState<SchoolVerification | null>(null);

  useEffect(() => {
    let alive = true;
    const supabase = getSupabaseBrowserClient();

    supabase.auth.getUser().then(async ({ data }) => {
      if (!alive) return;
      if (!data.user) {
        router.replace('/login?next=%2Fpost');
        return;
      }
      try {
        const value = await fetchMySchoolVerification();
        if (alive) setVerification(value);
      } finally {
        if (alive) setLoading(false);
      }
    });

    return () => { alive = false; };
  }, [router]);

  if (loading) {
    return (
      <div className="postGateLoading" aria-live="polite" aria-busy="true">
        <div className="postGateLoadingRadar" aria-hidden="true"><span /><i /></div>
        <strong>Checking your trust pass…</strong>
        <small>School verification</small>
      </div>
    );
  }

  if (verification?.status !== 'verified') {
    const pending = verification?.status === 'pending';
    const rejected = verification?.status === 'rejected';
    return (
      <section className="postVerificationGate">
        <div className="verificationGateBadge">SCHOOL ID REQUIRED</div>
        <div className="verificationGateRadar" aria-hidden="true"><span /><i /></div>
        <h1>{pending ? 'Your ID is under review.' : rejected ? 'Your school ID needs attention.' : 'Verify before you post.'}</h1>
        <p>{pending
          ? 'A moderator needs to approve your school ID before requests can go live.'
          : rejected
            ? 'Open your profile, review the moderator note, and resubmit your school ID.'
            : 'Aspire lets you browse first. Posting is unlocked after your school ID is reviewed and verified.'}</p>
        <div className="verificationGateSteps">
          <span className={verification ? 'done' : ''}><b>01</b> Enter school ID</span>
          <span className={pending || rejected ? 'current' : ''}><b>02</b> Moderator review</span>
          <span><b>03</b> Post to campus</span>
        </div>
        {rejected && verification?.review_note && <div className="verificationGateNote"><span>MODERATOR NOTE</span><p>{verification.review_note}</p></div>}
        <div className="verificationGateActions">
          <a className="button buttonGold" href="/profile#school-verification">{pending ? 'View verification →' : 'Verify school ID →'}</a>
          <a href="/discover">Browse campus instead</a>
        </div>
      </section>
    );
  }

  return <PostRequestForm />;
}
