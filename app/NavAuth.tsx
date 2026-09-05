'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

function labelFor(user: User) {
  const metadataName = user.user_metadata?.display_name || user.user_metadata?.full_name || user.user_metadata?.name;
  if (typeof metadataName === 'string' && metadataName.trim()) return metadataName.trim().split(' ')[0];
  return user.email?.split('@')[0] || 'You';
}

export default function NavAuth() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user ?? null);
      setReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setReady(true);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    setUser(null);
    router.refresh();
  }

  if (!ready) {
    return <div className="navAuthSkeleton" aria-hidden="true" />;
  }

  if (!user) {
    return (
      <div className="navActions">
        <a className="textLink" href="/login">Log in</a>
        <a className="button buttonGold buttonSmall" href="/signup">Join Aspire <span>↗</span></a>
      </div>
    );
  }

  return (
    <div className="navActions navSignedIn">
      <a className="button buttonGold buttonSmall" href="/post">Post a request <span>+</span></a>
      <span className="navUserChip" title={user.email ?? undefined}>
        <i>{labelFor(user).slice(0, 1).toUpperCase()}</i>
        <span>{labelFor(user)}</span>
      </span>
      <button className="navSignOut" type="button" onClick={signOut}>Sign out</button>
    </div>
  );
}
