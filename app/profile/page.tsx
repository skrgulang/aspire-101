'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import { fetchMyRole } from '../../lib/supabase/trust';
import type { AppRole } from '../../lib/supabase/trust';
import { aspireLogo } from '../logo';
import AppDock from '../AppDock';
import AppLoader from '../AppLoader';
import SchoolVerificationCard from '../SchoolVerificationCard';

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
  const [role, setRole] = useState<AppRole>('member');

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      if (!user) {
        router.replace('/login?next=%2Fprofile');
        return;
      }

      const [{ data: profileRow }, nextRole] = await Promise.all([
        supabase.from('profiles').select('display_name,name,full_name,school,email,home_campus_id').eq('id', user.id).maybeSingle(),
        fetchMyRole().catch(() => 'member' as AppRole)
      ]);
      const metadata = user.user_metadata ?? {};
      const backendName = profileRow?.display_name || profileRow?.full_name || profileRow?.name;
      const backendSchool = profileRow?.school;

      setProfile({
        name: typeof backendName === 'string' && backendName.trim()
          ? backendName.trim()
          : typeof metadata.display_name === 'string' && metadata.display_name.trim()
            ? metadata.display_name.trim()
            : user.email?.split('@')[0] || 'Aspire student',
        email: user.email || profileRow?.email || '',
        school: typeof backendSchool === 'string' && backendSchool.trim() ? backendSchool.trim() : 'Unsupported / unknown campus',
        emailVerified: Boolean(user.email_confirmed_at),
        phone: user.phone || '',
        phoneVerified: Boolean(user.phone_confirmed_at)
      });
      setRole(nextRole);
    });
  }, [router]);

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace('/');
    router.refresh();
  }

  if (!profile) return <AppLoader label="Opening your profile…" detail="Trust + campus" />;

  const staff = role === 'moderator' || role === 'admin';

  return (
    <main className="profilePage">
      <div className="profileShell">
        <header className="profileTop"><img src={aspireLogo} alt="" /><strong>Aspire 101</strong></header>
        <section className="profileHero">
          <p className="eyebrow">YOUR ASPIRE</p>
          <h1>{profile.name}</h1>
          <p>{profile.school}. Your home campus comes from your university identity, not a dropdown.</p>
        </section>

        <section className="profileCards" aria-label="Account and trust status">
          <article className={`profileCard ${profile.emailVerified ? 'isVerified' : ''}`}>
            <span>ACCOUNT EMAIL</span>
            <strong>{profile.emailVerified ? 'Confirmed ✓' : 'Not confirmed'}</strong>
            <p>{profile.email || 'No email on account'}</p>
            <small>Email confirmation and school verification are separate trust states.</small>
          </article>

          <SchoolVerificationCard school={profile.school} />

          <article className={`profileCard ${profile.phoneVerified ? 'isVerified' : ''}`}>
            <span>PHONE</span>
            <strong>{profile.phoneVerified ? 'Verified ✓' : 'Not added yet'}</strong>
            <p>{profile.phoneVerified ? profile.phone : 'Phone verification will be used for higher-trust actions such as rides and paid exchanges.'}</p>
          </article>

          <article className="profileCard">
            <span>HOME CAMPUS</span>
            <strong>{profile.school}</strong>
            <p>Browsing another campus later will not change the school tied to your Aspire identity.</p>
          </article>

          <article className="profileCard">
            <span>CONNECTIONS</span>
            <strong>Mutual by default</strong>
            <p>Private chat opens only after both sides choose the connection.</p>
          </article>

          {staff && (
            <a className="profileCard profileModeratorCard" href="/moderator">
              <span>{role === 'admin' ? 'ADMIN' : 'MODERATOR'}</span>
              <strong>Moderation tools →</strong>
              <p>Review legacy school IDs, safety reports, and requests.{role === 'admin' ? ' Admins can also add moderators.' : ''}</p>
            </a>
          )}
        </section>

        <button type="button" className="profileSignOut" onClick={signOut}>Sign out</button>
      </div>
      <AppDock active="profile" />
    </main>
  );
}
