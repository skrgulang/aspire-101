'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import { resolveUniversityByEmail } from '../../lib/supabase/universities';
import { fetchMyRole } from '../../lib/supabase/trust';
import type { AppRole } from '../../lib/supabase/trust';
import AppDock from '../AppDock';
import AppLoader from '../AppLoader';
import SchoolVerificationCard from '../SchoolVerificationCard';
import PhoneVerificationCard from '../PhoneVerificationCard';
import MfaSecurityCard from '../MfaSecurityCard';
import ProfileAvatar from '../ProfileAvatar';
import UiIcon from '../UiIcon';
import PaymentConnectRow from '../PaymentConnectRow';

type ProfileVisibility = 'private' | 'connections' | 'campus';

type ProfileView = {
  name: string;
  school: string;
  emailVerified: boolean;
  schoolVerified: boolean;
  phone: string;
  phoneVerified: boolean;
  avatarUrl: string;
  major: string;
  graduationYear: number | null;
  bio: string;
  interests: string[];
  joinedAt: string;
  completedCount: number;
  profileVisibility: ProfileVisibility;
};

type ProfileDraft = {
  name: string;
  major: string;
  graduationYear: string;
  bio: string;
  interests: string[];
};

type MyProfileDetailsRow = {
  display_name: string | null;
  name: string | null;
  full_name: string | null;
  school: string | null;
  home_campus_id: string | null;
  current_campus_id: string | null;
  avatar_url: string | null;
  image_url: string | null;
  major: string | null;
  graduation_year: number | null;
  bio: string | null;
  interests: string[] | null;
  created_at: string;
};

const interestOptions = ['Study','Gaming','Rides','Startups','Gym','Buy & Sell','Projects','Events','Housing','Photography','Food','Outdoors'];

function formatJoined(value: string) {
  if (!value) return 'New member';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'New member';
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [role, setRole] = useState<AppRole>('member');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [draft, setDraft] = useState<ProfileDraft>({ name: '', major: '', graduationYear: '', bio: '', interests: [] });

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;
    setLoadError('');

    void (async () => {
      try {
        const { data, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        const user = data.user;
        if (!user) {
          router.replace('/login?next=%2Fprofile');
          return;
        }

        const [{ data: profileRows, error: profileError }, { data: schoolVerificationRows }, { data: preferenceRow }, completedResult, nextRole] = await Promise.all([
          supabase.rpc('get_my_profile_details'),
          supabase.rpc('get_my_school_verification'),
          supabase.from('user_preferences').select('profile_visibility').eq('user_id', user.id).maybeSingle(),
          supabase.from('connections').select('id', { count: 'exact', head: true }).eq('status', 'completed').or(`requester_id.eq.${user.id},responder_id.eq.${user.id}`),
          fetchMyRole().catch(() => 'member' as AppRole)
        ]);
        if (profileError) throw profileError;
        const profileRow = ((profileRows ?? [])[0] ?? null) as MyProfileDetailsRow | null;
        const schoolVerification = ((schoolVerificationRows ?? [])[0] ?? null);

        const metadata = user.user_metadata ?? {};
        const backendName = profileRow?.display_name || profileRow?.full_name || profileRow?.name;
        const backendSchool = typeof profileRow?.school === 'string' && profileRow.school.trim() ? profileRow.school.trim() : '';
        const verifiedSchool = schoolVerification?.status === 'verified' && typeof schoolVerification.school === 'string' && schoolVerification.school.trim()
          ? schoolVerification.school.trim()
          : '';
        const verifiedUniversityId = schoolVerification?.status === 'verified' && typeof schoolVerification.university_id === 'string' && schoolVerification.university_id.trim()
          ? schoolVerification.university_id.trim()
          : '';

        let resolvedUniversity: Awaited<ReturnType<typeof resolveUniversityByEmail>> = null;
        if (user.email && ((!profileRow?.home_campus_id && !verifiedUniversityId) || (!backendSchool && !verifiedSchool))) {
          resolvedUniversity = await resolveUniversityByEmail(user.email).catch(() => null);
        }

        const metadataSchool = typeof metadata.school === 'string' && metadata.school.trim() ? metadata.school.trim() : '';
        const resolvedSchool = verifiedSchool || backendSchool || resolvedUniversity?.name || metadataSchool || 'Campus not set';
        const inferredUniversityId = verifiedUniversityId || resolvedUniversity?.id || '';

        if (
          inferredUniversityId
          && (!profileRow?.home_campus_id || !profileRow?.current_campus_id || !backendSchool)
        ) {
          await supabase.rpc('repair_my_profile_campus');
        }

        const nextProfile: ProfileView = {
          name: typeof backendName === 'string' && backendName.trim()
            ? backendName.trim()
            : typeof metadata.display_name === 'string' && metadata.display_name.trim()
              ? metadata.display_name.trim()
              : user.email?.split('@')[0] || 'Aspire student',
          school: resolvedSchool,
          emailVerified: Boolean(user.email_confirmed_at),
          schoolVerified: schoolVerification?.status === 'verified',
          phone: user.phone || '',
          phoneVerified: Boolean(user.phone_confirmed_at),
          avatarUrl: profileRow?.avatar_url || profileRow?.image_url || '',
          major: typeof profileRow?.major === 'string' ? profileRow.major : '',
          graduationYear: typeof profileRow?.graduation_year === 'number' ? profileRow.graduation_year : null,
          bio: typeof profileRow?.bio === 'string' ? profileRow.bio : '',
          interests: Array.isArray(profileRow?.interests) ? profileRow.interests.filter((item): item is string => typeof item === 'string') : [],
          joinedAt: typeof profileRow?.created_at === 'string' ? profileRow.created_at : '',
          completedCount: completedResult.count ?? 0,
          profileVisibility: preferenceRow?.profile_visibility === 'private' || preferenceRow?.profile_visibility === 'campus' ? preferenceRow.profile_visibility : 'connections'
        };

        if (cancelled) return;
        setProfile(nextProfile);
        setDraft({ name: nextProfile.name, major: nextProfile.major, graduationYear: nextProfile.graduationYear?.toString() || '', bio: nextProfile.bio, interests: nextProfile.interests });
        setRole(nextRole);
      } catch (error) {
        console.error('profile load failed', error);
        if (!cancelled) setLoadError('We could not load your profile right now.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, loadAttempt]);

  const audienceLabel = useMemo(() => {
    if (!profile) return '';
    if (profile.profileVisibility === 'private') return 'Only me';
    if (profile.profileVisibility === 'campus') return 'My verified campus';
    return 'My Aspire connections';
  }, [profile]);

  function beginEdit() {
    if (!profile) return;
    setDraft({ name: profile.name, major: profile.major, graduationYear: profile.graduationYear?.toString() || '', bio: profile.bio, interests: profile.interests });
    setSaveMessage('');
    setEditing(true);
  }

  function toggleInterest(value: string) {
    setDraft((current) => {
      const exists = current.interests.includes(value);
      if (exists) return { ...current, interests: current.interests.filter((item) => item !== value) };
      if (current.interests.length >= 8) return current;
      return { ...current, interests: [...current.interests, value] };
    });
  }

  async function saveProfile() {
    if (!profile) return;
    const year = draft.graduationYear.trim() ? Number(draft.graduationYear) : null;
    if (year !== null && (!Number.isInteger(year) || year < 2020 || year > 2045)) {
      setSaveMessage('Use a valid graduation year.');
      return;
    }
    if (!draft.name.trim()) {
      setSaveMessage('Add a display name.');
      return;
    }
    setSaving(true);
    setSaveMessage('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error('Sign in again to update your profile.');
      const payload = {
        display_name: draft.name.trim().slice(0, 80),
        major: draft.major.trim().slice(0, 120) || null,
        graduation_year: year,
        bio: draft.bio.trim().slice(0, 240) || null,
        interests: draft.interests.slice(0, 8)
      };
      const { error } = await supabase.rpc('update_my_profile_details', {
        p_display_name: payload.display_name,
        p_major: payload.major,
        p_graduation_year: payload.graduation_year,
        p_bio: payload.bio,
        p_interests: payload.interests
      });
      if (error) throw error;
      setProfile((current) => current ? { ...current, name: payload.display_name, major: payload.major || '', graduationYear: year, bio: payload.bio || '', interests: payload.interests } : current);
      setEditing(false);
      setSaveMessage('Profile updated.');
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : 'Could not update your profile.');
    } finally {
      setSaving(false);
    }
  }

  if (!profile && loadError) {
    return (
      <main className="profilePage profilePagePolished">
        <AppDock active="profile" />
        <div className="profileLoadError" role="alert">
          <strong>Could not open your profile.</strong>
          <p>{loadError} Your saved profile data has not been changed.</p>
          <div>
            <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Try again</button>
            <a href="/settings">Open Settings</a>
          </div>
        </div>
      </main>
    );
  }

  if (!profile) return <AppLoader label="Opening your profile…" detail="Campus identity" />;

  const initials = profile.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'A';
  const verifiedSignals = [profile.schoolVerified, profile.phoneVerified, profile.emailVerified].filter(Boolean).length;
  const identityLine = [profile.major || null, profile.graduationYear ? `Class of ${profile.graduationYear}` : null].filter(Boolean).join(' · ');

  return (
    <main className="profilePage profilePagePolished">
      <AppDock active="profile" />

      <div className="profileShell profileShellPolished">
        <header className="profileTop profileTopPolished">
          <div className="profilePageHeading">
            <span>CAMPUS IDENTITY</span>
            <h1>Profile</h1>
            <p>Your campus profile, activity, and trust signals in one place.</p>
          </div>
          <a className="profileBack" href="/settings"><UiIcon name="settings" />Settings</a>
        </header>

        <section className="profileHero profileHeroPolished">
          <ProfileAvatar initialUrl={profile.avatarUrl} initials={initials} name={profile.name} />

          <div className="profileHeroCopy">
            <div className="profileHeroMeta">
              <span>{profile.schoolVerified ? 'VERIFIED STUDENT' : 'CAMPUS PROFILE'}</span>
              {role !== 'member' && <b>{role.toUpperCase()}</b>}
            </div>
            <h2>{profile.name} {profile.schoolVerified && <span aria-label="Verified">✓</span>}</h2>
            <p>{profile.school}</p>
            {identityLine && <div className="studentProfileMetaLine"><span>{identityLine}</span></div>}
            <p className="studentProfileBio">{profile.bio || 'Add a short signature so your connections know a little about you.'}</p>
            <div className="studentProfileInterests">
              {profile.interests.length
                ? profile.interests.map((interest) => <span key={interest}>{interest}</span>)
                : <button type="button" onClick={beginEdit}>+ Add interests</button>}
            </div>
            <div className="profileActivityLine">
              <span><strong>{profile.completedCount}</strong> completed connection{profile.completedCount === 1 ? '' : 's'}</span>
              <span>Joined {formatJoined(profile.joinedAt)}</span>
              {profile.schoolVerified && <span><strong>✓</strong> campus verified</span>}
            </div>
            <div className="profileHeroActions">
              <button type="button" onClick={beginEdit}>Edit profile</button>
              <a href="/connections"><UiIcon name="message" />Messages</a>
            </div>
            {saveMessage && <p className="authMessage" role="status">{saveMessage}</p>}

            {editing && (
              <div className="studentEditPanel">
                <div className="studentEditGrid">
                  <label><span>Display name</span><input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} maxLength={80} /></label>
                  <label><span>Major / program</span><input value={draft.major} onChange={(event) => setDraft((current) => ({ ...current, major: event.target.value }))} placeholder="Computer Science" maxLength={120} /></label>
                  <label><span>Expected graduation</span><input inputMode="numeric" value={draft.graduationYear} onChange={(event) => setDraft((current) => ({ ...current, graduationYear: event.target.value.replace(/\D/g,'').slice(0,4) }))} placeholder="2028" /></label>
                  <label className="studentEditFull"><span>Signature / bio</span><textarea value={draft.bio} onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))} placeholder="Always down for study groups, pickup hoops, and building things." maxLength={240} /></label>
                  <div className="studentEditInterests"><span>Interests · choose up to 8</span><div className="studentEditInterestGrid">{interestOptions.map((interest) => <button type="button" key={interest} className={`studentInterestButton ${draft.interests.includes(interest) ? 'active' : ''}`} onClick={() => toggleInterest(interest)}>{interest}</button>)}</div></div>
                  <div className="studentEditActions"><button type="button" onClick={() => setEditing(false)}>Cancel</button><button type="button" onClick={saveProfile} disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button></div>
                </div>
              </div>
            )}
          </div>

        </section>

        <section className="profileOverview">
          <div className="profileTrustPanel" id="trust-passport">
            <div className="profileSectionHeading">
              <div><span>TRUST & VERIFICATION</span><h2>Verification</h2></div>
              <p>{verifiedSignals} of 3 trust signals complete. Private details stay private.</p>
            </div>

            <div className="profileTrustCards profileTrustCardsExpanded">
              <SchoolVerificationCard school={profile.school} />
              <MfaSecurityCard />
              <PhoneVerificationCard initialPhone={profile.phone} initiallyVerified={profile.phoneVerified} />
            </div>
          </div>

          <aside className="studentIdentityAside">
            <div className="studentIdentityAsideCard profilePayoutCard">
              <span>SELLER TOOLS</span>
              <h3>Seller payouts</h3>
              <p>Connect Stripe when you are ready to receive protected Aspire payments.</p>
              <PaymentConnectRow phoneVerified={profile.phoneVerified} schoolVerified={profile.schoolVerified} />
            </div>

            <div className="studentIdentityAsideCard profileQuickLinks">
              <span>ACCOUNT</span>
              <a href="/settings#privacy"><span><strong>Profile audience</strong><small>{audienceLabel}</small></span><UiIcon name="chevron" /></a>
              <a href="/activity"><span><strong>My activity</strong><small>Connections and requests</small></span><UiIcon name="chevron" /></a>
              <a href="/settings#privacy"><span><strong>Privacy & security</strong><small>Visibility, security and account controls</small></span><UiIcon name="chevron" /></a>
              <a href="/settings"><span><strong>Settings</strong><small>Notifications, appearance and preferences</small></span><UiIcon name="chevron" /></a>
            </div>
          </aside>
        </section>

        <footer className="profileOperator">Aspire 101 is a product operated by Cloudora Labs, Inc.</footer>
      </div>
    </main>
  );
}
