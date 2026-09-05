'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import { aspireLogo } from '../logo';
import AppDock from '../AppDock';

type ProfileView = {
  name: string;
  email: string;
  school: string;
  emailVerified: boolean;
  phone: string;
  phoneVerified: boolean;
};

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileView | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user) {
        router.replace('/login?next=%2Fprofile');
        return;
      }
      const metadata = user.user_metadata ?? {};
      setProfile({
        name: typeof metadata.display_name === 'string' && metadata.display_name.trim() ? metadata.display_name.trim() : user.email?.split('@')[0] || 'Aspire student',
        email: user.email || '',
        school: typeof metadata.school === 'string' && metadata.school.trim() ? metadata.school.trim() : 'Your campus',
        emailVerified: Boolean(user.email_confirmed_at),
        phone: user.phone || '',
        phoneVerified: Boolean(user.phone_confirmed_at)
      });
    });
  }, [router]);

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace('/');
    router.refresh();
  }

  if (!profile) {
    return <main className="profilePage"><div className="profileShell"><p>Loading profile…</p></div><AppDock active="profile" /></main>;
  }

  return (
    <main className="profilePage">
      <div className="profileShell">
        <header className="profileTop"><img src={aspireLogo} alt="" /><strong>Aspire 101</strong></header>
        <section className="profileHero">
          <p className="eyebrow">YOUR ASPIRE</p>
          <h1>{profile.name}</h1>
          <p>{profile.school}. Your trust details stay simple: verify what matters, then keep connecting.</p>
        </section>

        <section className="profileCards" aria-label="Account and trust status">
          <article className={`profileCard ${profile.emailVerified ? 'isVerified' : ''}`}>
            <span>SCHOOL / EMAIL</span>
            <strong>{profile.emailVerified ? 'Verified ✓' : 'Not verified'}</strong>
            <p>{profile.email || 'No email on account'}</p>
          </article>
          <article className={`profileCard ${profile.phoneVerified ? 'isVerified' : ''}`}>
            <span>PHONE</span>
            <strong>{profile.phoneVerified ? 'Verified ✓' : 'Not added yet'}</strong>
            <p>{profile.phoneVerified ? profile.phone : 'Phone verification will be used for higher-trust actions such as rides and paid exchanges.'}</p>
          </article>
          <article className="profileCard">
            <span>COMMUNITY</span>
            <strong>{profile.school}</strong>
            <p>Your Community Circle is scoped to campus activity rather than exposing precise location.</p>
          </article>
          <article className="profileCard">
            <span>CONNECTIONS</span>
            <strong>Mutual by default</strong>
            <p>Private chat opens only after both sides choose the connection.</p>
          </article>
        </section>

        <button type="button" className="profileSignOut" onClick={signOut}>Sign out</button>
      </div>
      <AppDock active="profile" />
    </main>
  );
}
