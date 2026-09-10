'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import { fetchMyRole } from '../../lib/supabase/trust';
import type { AppRole } from '../../lib/supabase/trust';
import AppDock from '../AppDock';
import AppLoader from '../AppLoader';
import SchoolVerificationCard from '../SchoolVerificationCard';
import PhoneVerificationCard from '../PhoneVerificationCard';
import IdentityVerificationCard from '../IdentityVerificationCard';
import MfaSecurityCard from '../MfaSecurityCard';
import PaymentConnectRow from '../PaymentConnectRow';
import ProfileAvatar from '../ProfileAvatar';
import UiIcon from '../UiIcon';

type ProfileView = {
  name: string;
  email: string;
  school: string;
  emailVerified: boolean;
  schoolVerified: boolean;
  phone: string;
  phoneVerified: boolean;
  idVerified: boolean;
  avatarUrl: string;
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

      const [{ data: profileRow }, { data: schoolVerification }, { data: identityVerification }, nextRole] = await Promise.all([
        supabase.from('profiles').select('display_name,name,full_name,school,home_campus_id,avatar_url,image_url').eq('id', user.id).maybeSingle(),
        supabase.from('school_verifications').select('status,verification_method,school_email').eq('user_id', user.id).maybeSingle(),
        supabase.from('identity_verifications').select('status').eq('user_id', user.id).maybeSingle(),
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
        email: user.email || '',
        school: typeof backendSchool === 'string' && backendSchool.trim() ? backendSchool.trim() : 'Unsupported / unknown campus',
        emailVerified: Boolean(user.email_confirmed_at),
        schoolVerified: schoolVerification?.status === 'verified',
        phone: user.phone || '',
        phoneVerified: Boolean(user.phone_confirmed_at),
        idVerified: identityVerification?.status === 'verified',
        avatarUrl: profileRow?.avatar_url || profileRow?.image_url || ''
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
  const initials = profile.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'A';
  const verifiedSignals = [profile.schoolVerified, profile.idVerified, profile.phoneVerified, profile.emailVerified].filter(Boolean).length;

  return (
    <main className="profilePage profilePagePolished">
      <AppDock active="profile" />

      <div className="profileShell profileShellPolished">
        <header className="profileTop profileTopPolished">
          <div className="profilePageHeading">
            <span>ACCOUNT</span>
            <h1>Profile</h1>
            <p>Manage your campus identity, verification, security, and payments in one place.</p>
          </div>
          <a className="profileBack" href="/campus"><UiIcon name="home" />Back home</a>
        </header>

        <section className="profileHero profileHeroPolished">
          <ProfileAvatar initialUrl={profile.avatarUrl} initials={initials} name={profile.name} />

          <div className="profileHeroCopy">
            <div className="profileHeroMeta">
              <span>PURDUE COMMUNITY</span>
              {role !== 'member' && <b>{role.toUpperCase()}</b>}
            </div>
            <h2>{profile.name}</h2>
            <p>{profile.school}</p>
            <div className="profileTrustChips" aria-label="Trust status">
              <span className={profile.schoolVerified ? 'verified' : ''}>{profile.schoolVerified ? '✓ Campus Verified' : 'Campus verification needed'}</span>
              <span className={profile.idVerified ? 'verified' : ''}>{profile.idVerified ? '✓ ID Verified' : 'ID optional'}</span>
              <span className={profile.phoneVerified ? 'verified' : ''}>{profile.phoneVerified ? '✓ Phone Verified' : 'Phone optional'}</span>
              <span className={profile.emailVerified ? 'verified' : ''}>{profile.emailVerified ? '✓ Email confirmed' : 'Email not confirmed'}</span>
            </div>
            <div className="profileHeroActions">
              <a href="#trust-passport">Manage verification</a>
              <a href="/connections"><UiIcon name="message" />Messages</a>
            </div>
          </div>

          <div className="profileSetupCard" aria-label={`${verifiedSignals} of 4 trust signals complete`}>
            <div className="profileSetupTop">
              <div><span>VERIFICATION SETUP</span><strong>{verifiedSignals} of 4</strong></div>
              <div className="profileSetupBadge"><UiIcon name="check" /></div>
            </div>
            <p>Complete the trust signals you want to use for higher-trust campus activity.</p>
            <div className={`profileSetupMeter level${verifiedSignals}`}><i /></div>
            <a href="#trust-passport">Review trust signals <UiIcon name="chevron" /></a>
          </div>
        </section>

        <section className="profileOverview">
          <div className="profileTrustPanel" id="trust-passport">
            <div className="profileSectionHeading">
              <div><span>TRUST & VERIFICATION</span><h2>Build a trusted campus profile.</h2></div>
              <p>Each signal is separate. Students can see what is verified without exposing the sensitive information behind it.</p>
            </div>

            <div className="profileTrustCards profileTrustCardsExpanded">
              <SchoolVerificationCard school={profile.school} />
              <IdentityVerificationCard />
              <MfaSecurityCard />
              <PhoneVerificationCard initialPhone={profile.phone} initiallyVerified={profile.phoneVerified} />
            </div>
          </div>

          <aside className="profileQuickPanel" id="account-settings">
            <div className="profileSectionHeading compact"><div><span>ACCOUNT</span><h2>Account & activity</h2></div></div>

            <div className="profileMenuList">
              <div className="profileMenuRow">
                <i><UiIcon name="home" /></i>
                <div><strong>Home campus</strong><span>{profile.school}</span></div>
                <b>{profile.schoolVerified ? 'Verified' : 'Review'}</b>
              </div>

              <a className="profileMenuRow" href="/connections">
                <i><UiIcon name="message" /></i>
                <div><strong>Messages</strong><span>Campus conversations and connections</span></div>
                <b><UiIcon name="chevron" /></b>
              </a>

              <PaymentConnectRow phoneVerified={profile.phoneVerified} schoolVerified={profile.schoolVerified} />

              <a className="profileMenuRow" href="/safety">
                <i><UiIcon name="check" /></i>
                <div><strong>Safety & privacy</strong><span>Reporting, blocking, verification, and privacy</span></div>
                <b><UiIcon name="chevron" /></b>
              </a>

              <a className="profileMenuRow" href="/marketplace-rules">
                <i><UiIcon name="tag" /></i>
                <div><strong>Marketplace rules</strong><span>Review expectations for campus exchanges</span></div>
                <b><UiIcon name="chevron" /></b>
              </a>

              {staff && (
                <a className="profileMenuRow moderator" href="/moderator">
                  <i><UiIcon name="user" /></i>
                  <div><strong>{role === 'admin' ? 'Admin console' : 'Moderation tools'}</strong><span>Review trust & safety queues</span></div>
                  <b><UiIcon name="chevron" /></b>
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
    </main>
  );
}
