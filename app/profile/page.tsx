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
import IdentityVerificationCard from '../IdentityVerificationCard';
import MfaSecurityCard from '../MfaSecurityCard';
import ProfileAvatar from '../ProfileAvatar';
import UiIcon from '../UiIcon';

type ProfileVisibility = 'private' | 'connections' | 'campus';

type ProfileView = {
  name: string;
  school: string;
  emailVerified: boolean;
  schoolVerified: boolean;
  phone: string;
  phoneVerified: boolean;
  idVerified: boolean;
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
  const [draft, setDraft] = useState<ProfileDraft>({ name: '', major: '', graduationYear: '', bio: '', interests: [] });

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      if (!user) {
        router.replace('/login?next=%2Fprofile');
        return;
      }

      const [{ data: profileRow }, { data: schoolVerification }, { data: identityVerification }, { data: preferenceRow }, completedResult, nextRole] = await Promise.all([
        supabase.from('profiles').select('display_name,name,full_name,school,home_campus_id,current_campus_id,avatar_url,image_url,major,graduation_year,bio,interests,created_at').eq('id', user.id).maybeSingle(),
        supabase.from('school_verifications').select('status,verification_method,school_email,school,university_id').eq('user_id', user.id).maybeSingle(),
        supabase.from('identity_verifications').select('status').eq('user_id', user.id).maybeSingle(),
        supabase.from('user_preferences').select('profile_visibility').eq('user_id', user.id).maybeSingle(),
        supabase.from('connections').select('id', { count: 'exact', head: true }).eq('status', 'completed').or(`requester_id.eq.${user.id},responder_id.eq.${user.id}`),
        fetchMyRole().catch(() => 'member' as AppRole)
      ]);

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

      const repairPayload: Record<string, string> = {};
      if (!profileRow?.home_campus_id && inferredUniversityId) repairPayload.home_campus_id = inferredUniversityId;
      if (!profileRow?.current_campus_id && inferredUniversityId) repairPayload.current_campus_id = inferredUniversityId;
      if (!backendSchool && resolvedSchool !== 'Campus not set') repairPayload.school = resolvedSchool;
      if (Object.keys(repairPayload).length) {
        await supabase.from('profiles').update(repairPayload).eq('id', user.id);
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
        idVerified: identityVerification?.status === 'verified',
        avatarUrl: profileRow?.avatar_url || profileRow?.image_url || '',
        major: typeof profileRow?.major === 'string' ? profileRow.major : '',
        graduationYear: typeof profileRow?.graduation_year === 'number' ? profileRow.graduation_year : null,
        bio: typeof profileRow?.bio === 'string' ? profileRow.bio : '',
        interests: Array.isArray(profileRow?.interests) ? profileRow.interests.filter((item): item is string => typeof item === 'string') : [],
        joinedAt: typeof profileRow?.created_at === 'string' ? profileRow.created_at : '',
        completedCount: completedResult.count ?? 0,
        profileVisibility: preferenceRow?.profile_visibility === 'private' || preferenceRow?.profile_visibility === 'campus' ? preferenceRow.profile_visibility : 'connections'
      };

      setProfile(nextProfile);
      setDraft({ name: nextProfile.name, major: nextProfile.major, graduationYear: nextProfile.graduationYear?.toString() || '', bio: nextProfile.bio, interests: nextProfile.interests });
      setRole(nextRole);
    });
  }, [router]);

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
      const { error } = await supabase.from('profiles').update(payload).eq('id', authData.user.id);
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

  if (!profile) return <AppLoader label="Opening your profile…" detail="Campus identity" />;

  const initials = profile.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'A';
  const verifiedSignals = [profile.schoolVerified, profile.idVerified, profile.phoneVerified, profile.emailVerified].filter(Boolean).length;
  const identityLine = [profile.major || null, profile.graduationYear ? `Class of ${profile.graduationYear}` : null].filter(Boolean).join(' · ');

  return (
    <main className="profilePage profilePagePolished">
      <AppDock active="profile" />

      <div className="profileShell profileShellPolished">
        <header className="profileTop profileTopPolished">
          <div className="profilePageHeading">
            <span>CAMPUS IDENTITY</span>
            <h1>Profile</h1>
            <p>This is the student identity people you connect with can see. Private account controls live in Settings.</p>
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
              {profile.interests.length ? profile.interests.map((interest) => <span key={interest}>{interest}</span>) : <span>Add interests</span>}
            </div>
            <div className="studentProfileStats">
              <div className="studentProfileStat"><strong>{profile.completedCount}</strong><span>Completed</span></div>
              <div className="studentProfileStat"><strong>{formatJoined(profile.joinedAt)}</strong><span>Joined</span></div>
              <div className="studentProfileStat"><strong>{profile.schoolVerified ? '✓' : '—'}</strong><span>Campus verified</span></div>
            </div>
            <div className="profileHeroActions">
              <button type="button" onClick={beginEdit}>Edit profile</button>
              <a href="/connections"><UiIcon name="message" />Messages</a>
              <a href="/settings"><UiIcon name="settings" />Settings</a>
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

          <div className="profileSetupCard" aria-label={`${verifiedSignals} of 4 trust signals complete`}>
            <div className="profileSetupTop">
              <div><span>TRUST SETUP</span><strong>{verifiedSignals} of 4</strong></div>
              <div className="profileSetupBadge"><UiIcon name="check" /></div>
            </div>
            <p>Verification supports safer campus connections without turning students into a public score.</p>
            <div className={`profileSetupMeter level${verifiedSignals}`}><i /></div>
            <a href="#trust-passport">Review trust signals <UiIcon name="chevron" /></a>
          </div>
        </section>

        <section className="profileOverview">
          <div className="profileTrustPanel" id="trust-passport">
            <div className="profileSectionHeading">
              <div><span>TRUST & VERIFICATION</span><h2>Real student, not a student rating.</h2></div>
              <p>Aspire uses verification and completed connections as trust signals. Sensitive details stay private.</p>
            </div>

            <div className="profileTrustCards profileTrustCardsExpanded">
              <SchoolVerificationCard school={profile.school} />
              <IdentityVerificationCard />
              <MfaSecurityCard />
              <PhoneVerificationCard initialPhone={profile.phone} initiallyVerified={profile.phoneVerified} />
            </div>
          </div>

          <aside className="studentIdentityAside">
            <div className="studentIdentityAsideCard">
              <span>PROFILE AUDIENCE</span>
              <h3>{audienceLabel}</h3>
              <p>Choose who can open your full student profile. Precise location, email, phone, and private account information are never included.</p>
              <a href="/settings#privacy">Privacy settings <UiIcon name="chevron" /></a>
            </div>
            <div className="studentIdentityAsideCard">
              <span>COMPLETED</span>
              <h3>{profile.completedCount} completed connection{profile.completedCount === 1 ? '' : 's'}</h3>
              <p>Completed is an objective activity signal — no public student-wide star rating required.</p>
              <a href="/activity">My activity <UiIcon name="chevron" /></a>
            </div>
            <div className="studentIdentityAsideCard">
              <span>PRIVATE CONTROLS</span>
              <h3>Settings are separate now.</h3>
              <p>Location consent, notifications, payments, security, appearance, and AI personalization belong in Settings.</p>
              <a href="/settings">Open Settings <UiIcon name="chevron" /></a>
            </div>
          </aside>
        </section>

        <footer className="profileOperator">Aspire 101 is a product operated by Cloudora Labs, Inc.</footer>
      </div>
    </main>
  );
}
