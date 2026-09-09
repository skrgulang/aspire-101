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
        <strong>Checking your campus access…</strong>
        <small>Verified university email</small>
      </div>
    );
  }

  if (verification?.status !== 'verified') {
    return (
      <section className="postVerificationGate">
        <div className="verificationGateBadge">UNIVERSITY EMAIL REQUIRED</div>
        <div className="verificationGateRadar" aria-hidden="true"><span /><i /></div>
        <h1>Confirm your school email first.</h1>
        <p>Aspire uses your confirmed supported university email as the core campus identity check. Government ID is not required for normal C2C posting.</p>
        <div className="verificationGateSteps">
          <span className="done"><b>01</b> Create account</span>
          <span className="current"><b>02</b> Confirm .edu email</span>
          <span><b>03</b> Post to campus</span>
        </div>
        <div className="verificationGateActions">
          <a className="button buttonGold" href="/profile">Open Profile →</a>
          <a href="/discover">Browse campus instead</a>
        </div>
      </section>
    );
  }

  return <PostRequestForm />;
}
