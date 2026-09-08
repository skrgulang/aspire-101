'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { fetchActiveUniversities } from '../lib/supabase/universities';
import AspireAgentPanel from './AspireAgentPanel';
import CampusPulsePanel from './CampusPulsePanel';

export default function AspireAgentLauncher() {
  const [open, setOpen] = useState(false);
  const [campus, setCampus] = useState<{ id: string; shortName: string } | null>(null);

  useEffect(() => {
    let alive = true;
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!alive || !data.user) return;
      const [{ data: profile }, campuses] = await Promise.all([
        supabase.from('profiles').select('home_campus_id,current_campus_id').eq('id', data.user.id).maybeSingle(),
        fetchActiveUniversities()
      ]);
      if (!alive) return;
      const stored = typeof window !== 'undefined' ? window.sessionStorage.getItem('aspire-active-campus-id') : null;
      const id = stored || profile?.current_campus_id || profile?.home_campus_id || '';
      const selected = campuses.find((item) => item.id === id) || campuses.find((item) => item.id === profile?.home_campus_id);
      if (selected) setCampus({ id: selected.id, shortName: selected.short_name });
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  if (!campus) return null;

  return (
    <>
      <button className="aspireAgentLauncher" type="button" onClick={() => setOpen(true)} aria-label="Open Aspire Brain">
        <i>✦</i><span><b>Aspire Brain</b><small>route · match · act</small></span>
      </button>
      {open && (
        <div className="aspireAgentOverlay" role="dialog" aria-modal="true" aria-label="Aspire Brain">
          <div className="aspireAgentModal">
            <button className="aspireAgentModalClose" type="button" onClick={() => setOpen(false)} aria-label="Close Aspire Brain">×</button>
            <a className="aspireAgentFeatureGuide" href="/intelligence">See everything Aspire Intelligence can do →</a>
            <AspireAgentPanel campusId={campus.id} campusName={campus.shortName} />
            <CampusPulsePanel campusId={campus.id} campusName={campus.shortName} />
          </div>
        </div>
      )}
    </>
  );
}
