'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import { fetchMyRole } from '../../lib/supabase/trust';
import type { AppRole } from '../../lib/supabase/trust';
import { aspireLogo } from '../logo';
import AppDock from '../AppDock';
import AppLoader from '../AppLoader';
import SchoolVerificationCard from '../SchoolVerificationCard';
import PhoneVerificationCard from '../PhoneVerificationCard';

type ProfileView = {
  name: string;
  email: string;
  school: string;
  emailVerified: boolean;
  schoolVerified: boolean;
  schoolVerificationMethod: string;
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

      const [{ data: profileRow }, { data: schoolVerification }, nextRole] = await Promise.all([
        supabase.from('profiles').select('display_name,name,full_name,school,email,home_campus_id').eq('id', user.id).maybeSingle(),
        supabase.from('school_verifications').select('status,verification_method,school_email').eq('user_id', user.id).maybeSingle(),
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
        schoolVerified: schoolVerification?.status === 'verified',
        schoolVerificationMethod: schoolVerification?.verification_method || '',
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
  const initials = useMemo(() => profile.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'A', [profile.name]);

  return (
    <main className="profilePage profilePagePolished">
      <div className="profileShell profileShellPolished">
        <header className="profileTop profileTopPolished">
          <a className="profileBrand" href="/campus"><img src={aspireLogo} alt="" /><strong>Aspire 101</strong></a>
          <a className="profileBack" href="/campus">Back to your circle →</a>
        </header>

        <section className="profileHero profileHeroPolished">
          <div className="profileAvatar" aria-hidden="true">{initials}</div>
          <div className="profileHeroCopy">
            <div className="profileHeroMeta"><span>YOUR ASPIRE</span>{role !== 'member' && <b>{role.toUpperCase()}</b>}</div>
            <h1>{profile.name}</h1>
            <p>{profile.school}</p>
            <div className="profileTrustChips" aria-label="Trust status">
              <span className={profile.schoolVerified ? 'verified' : ''}>{profile.schoolVerified ? '✓ Verified student' : 'School verification needed'}</span>
              <span className={profile.emailVerified ? 'verified' : ''}>{profile.emailVerified ? '✓ Email confirmed' : 'Email not confirmed'}</span>
              <span className={profile.phoneVerified ? 'verified' : ''}>{profile.phoneVerified ? '✓ Phone verified' : 'Phone optional'}</span>
            </div>
          </div>
        </section>

        <section className="profileOverview">
          <div className="profileTrustPanel">
            <div className="profileSectionHeading">
              <div><span>TRUST PASSPORT</span><h2>Verify what matters.</h2></div>
              <p>School, phone, and payment identity stay separate. Aspire only shows the trust signals that are actually verified.</p>
            </div>

            <div className="profileTrustCards">
              <SchoolVerificationCard school={profile.school} />
              <PhoneVerificationCard initialPhone={profile.phone} initiallyVerified={profile.phoneVerified} />
            </div>
          </div>

          <aside className="profileQuickPanel">
            <div className="profileSectionHeading compact"><div><span>ACCOUNT</span><h2>Your Aspire.</h2></div></div>

            <div className="profileMenuList">
              <div className="profileMenuRow">
                <i>⌂</i><div><strong>Home campus</strong><span>{profile.school}</span></div><b>Verified identity</b>
              </div>
              <a className="profileMenuRow" href="/connections">
                <i>♧</i><div><strong>Connections</strong><span>Mutual connections and messages</span></div><b>→</b>
              </a>
              <div className="profileMenuRow muted" aria-disabled="true">
                <i>$</i><div><strong>Payments & earnings</strong><span>Stripe Connect comes next</span></div><b>SOON</b>
              </div>
              <a className="profileMenuRow" href="/safety">
                <i>◇</i><div><strong>Safety & privacy</strong><span>Reporting, blocking, and privacy</span></div><b>→</b>
              </a>
              {staff && (
                <a className="profileMenuRow moderator" href="/moderator">
                  <i>✦</i><div><strong>{role === 'admin' ? 'Admin console' : 'Moderation tools'}</strong><span>Review trust & safety queues</span></div><b>→</b>
                </a>
              )}
            </div>

            <div className="profileAccountFoot">
              <div><span>ACCOUNT EMAIL</span><strong>{profile.email}</strong><small>{profile.emailVerified ? 'Confirmed' : 'Not confirmed'}</small></div>
              <button type="button" onClick={signOut}>Log out</button>
            </div>
          </aside>
        </section>

        <footer className="profileOperator">Aspire 101 is a product operated by Cloudora Labs, Inc.</footer>
      </div>
      <AppDock active="profile" />
    </main>
  );
}
