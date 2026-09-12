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
        <small>Campus verification</small>
      </div>
    );
  }

  if (verification?.status !== 'verified') {
    const pending = verification?.status === 'pending';
    const rejected = verification?.status === 'rejected';
    return (
      <section className="postVerificationGate">
        <div className="verificationGateBadge">CAMPUS VERIFICATION REQUIRED</div>
        <div className="verificationGateRadar" aria-hidden="true"><span /><i /></div>
        <h1>{pending ? 'Your campus verification is under review.' : rejected ? 'Your verification needs attention.' : 'Verify your campus before you post.'}</h1>
        <p>{pending
          ? 'Your verification is being reviewed. Posting unlocks as soon as your campus status is approved.'
          : rejected
            ? 'Open Profile to review the verification note and submit updated information.'
            : 'New Aspire accounts verify with a supported university email. Existing beta accounts can finish verification from Profile.'}</p>
        <div className="verificationGateSteps">
          <span className={verification ? 'done' : ''}><b>01</b> Verify campus</span>
          <span className={pending || rejected ? 'current' : ''}><b>02</b> Confirm status</span>
          <span><b>03</b> Post to campus</span>
        </div>
        {rejected && verification?.review_note && <div className="verificationGateNote"><span>VERIFICATION NOTE</span><p>{verification.review_note}</p></div>}
        <div className="verificationGateActions">
          <a className="button buttonGold" href="/profile#school-verification">Open verification →</a>
          <a href="/discover">Browse campus instead</a>
        </div>
      </section>
    );
  }

  return <PostRequestForm />;
}
