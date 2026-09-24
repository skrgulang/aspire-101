'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import { resolveUniversityByEmail } from '../../lib/supabase/universities';
import { fetchMyRole } from '../../lib/supabase/trust';
import type { AppRole } from '../../lib/supabase/trust';
import AppDock from '../AppDock';
import AppLoader from '../AppLoader';
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

type RecentActivity = {
  id: string;
  title: string;
  category: string;
  updatedAt: string;
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

function formatActivityDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [mfaEnabled, setMfaEnabled] = useState(false);
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

        const [{ data: recentConnectionRows }, mfaResult] = await Promise.all([
          supabase
            .from('connections')
            .select('id,request_id,updated_at')
            .eq('status', 'completed')
            .or(`requester_id.eq.${user.id},responder_id.eq.${user.id}`)
            .order('updated_at', { ascending: false })
            .limit(3),
          supabase.auth.mfa.listFactors().catch(() => ({ data: null, error: null }))
        ]);

        const recentRequestIds = [...new Set((recentConnectionRows ?? []).map((item) => String(item.request_id)).filter(Boolean))];
        let nextRecentActivity: RecentActivity[] = [];
        if (recentRequestIds.length) {
          const { data: recentRequestRows } = await supabase
            .from('requests')
            .select('id,title,category')
            .in('id', recentRequestIds);
          const recentRequestMap = new Map((recentRequestRows ?? []).map((item) => [String(item.id), item]));
          nextRecentActivity = (recentConnectionRows ?? []).map((item) => {
            const request = recentRequestMap.get(String(item.request_id));
            return {
              id: String(item.id),
              title: typeof request?.title === 'string' && request.title.trim() ? request.title.trim() : 'Completed connection',
              category: typeof request?.category === 'string' && request.category.trim() ? request.category.trim() : 'Connection',
              updatedAt: String(item.updated_at || '')
            };
          });
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
        setRecentActivity(nextRecentActivity);
        setMfaEnabled(Boolean(mfaResult.data?.all?.some((factor) => factor.status === 'verified')));
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

      <div className="profileShell profileShellPolished profileDashboard">
        <section className="profileDashboardMain">
          <section className="profileHero profileHeroPolished profileDashboardHero">
            <ProfileAvatar initialUrl={profile.avatarUrl} initials={initials} name={profile.name} />

            <div className="profileHeroCopy">
              <h1>{profile.name}</h1>
              <div className="profileDashboardSchool">
                <UiIcon name="school" />
                <span><strong>{profile.school}</strong>{profile.major && <small>{profile.major}{profile.graduationYear ? ` · Class of ${profile.graduationYear}` : ''}</small>}</span>
              </div>

              <p className="profileDashboardIntro">{profile.bio || 'Add a short intro so people on campus know a little about you.'}</p>
              {profile.interests.length > 0 && <p className="profileDashboardInterestLine">{profile.interests.join(' · ')}</p>}

              <div className="profileActivityLine">
                <span><UiIcon name="users" /><strong>{profile.completedCount}</strong> completed connection{profile.completedCount === 1 ? '' : 's'}</span>
                <span><UiIcon name="calendar" />Joined {formatJoined(profile.joinedAt)}</span>
              </div>

              <div className="profileHeroActions">
                <button type="button" onClick={beginEdit}>Edit profile</button>
                <a href="/connections"><UiIcon name="message" />Messages</a>
              </div>
              {saveMessage && <p className="authMessage" role="status">{saveMessage}</p>}
            </div>
          </section>

          <section className="profileDashboardCard profileAboutCard">
            <div className="profileDashboardCardHead">
              <h2>About</h2>
              <button type="button" onClick={beginEdit}>Edit <UiIcon name="edit" /></button>
            </div>
            <p>{profile.bio || 'Tell your campus what you are into, what you are working on, or what kind of people you would like to meet.'}</p>
            <div className="profileAboutInterests">
              {profile.interests.length
                ? profile.interests.map((interest) => <span key={interest}>{interest}</span>)
                : <button type="button" onClick={beginEdit}>+ Add interests</button>}
            </div>

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
          </section>

          <section className="profileDashboardCard profileRecentCard">
            <div className="profileDashboardCardHead">
              <h2>Recent activity</h2>
              <a href="/activity">View all <UiIcon name="chevron" /></a>
            </div>
            {recentActivity.length ? (
              <div className="profileRecentList">
                {recentActivity.map((item) => (
                  <a key={item.id} href="/connections" className="profileRecentRow">
                    <i><UiIcon name="activity" /></i>
                    <span><strong>{item.title}</strong><small>{item.category}</small></span>
                    <time>{formatActivityDate(item.updatedAt)}</time>
                    <b>Completed</b>
                    <UiIcon name="chevron" />
                  </a>
                ))}
              </div>
            ) : (
              <div className="profileRecentEmpty">
                <strong>No completed activity yet</strong>
                <span>Your completed connections will show up here.</span>
              </div>
            )}
          </section>
        </section>

        <aside className="profileDashboardAside">
          <section className="profileDashboardCard profileTrustSummary">
            <div className="profileDashboardAsideTitle"><UiIcon name="shield" /><h2>Trust & verification</h2><a href="/settings#security"><UiIcon name="chevron" /></a></div>
            <div className="profileTrustSummaryRows">
              <a href="/settings#security"><i className={profile.schoolVerified ? 'verified' : ''}><UiIcon name={profile.schoolVerified ? 'check' : 'school'} /></i><span><strong>{profile.school} email</strong><small>{profile.schoolVerified ? 'Verified student' : 'Verification available'}</small></span><UiIcon name="chevron" /></a>
              <a href="/settings#security"><i className={profile.phoneVerified ? 'verified' : ''}><UiIcon name={profile.phoneVerified ? 'check' : 'phone'} /></i><span><strong>Phone number</strong><small>{profile.phoneVerified ? `Verified · •••• ${profile.phone.slice(-4)}` : 'Not verified'}</small></span><UiIcon name="chevron" /></a>
              <a href="/settings#security"><i className={mfaEnabled ? 'verified' : ''}><UiIcon name={mfaEnabled ? 'check' : 'shield'} /></i><span><strong>Two-step verification</strong><small>{mfaEnabled ? 'Enabled' : 'Not enabled'}</small></span><UiIcon name="chevron" /></a>
            </div>
          </section>

          <section className="profileDashboardCard profilePayoutCard">
            <div className="profileDashboardAsideTitle"><UiIcon name="wallet" /><h2>Seller tools</h2><a href="/money"><UiIcon name="chevron" /></a></div>
            <h3>Set up payouts</h3>
            <p>Add a bank account securely in Stripe to receive earnings.</p>
            <PaymentConnectRow phoneVerified={profile.phoneVerified} schoolVerified={profile.schoolVerified} />
          </section>

          <section className="profileDashboardCard profileQuickLinks">
            <div className="profileDashboardAsideTitle"><UiIcon name="settings" /><h2>Account</h2></div>
            <a href="/settings#privacy"><span><strong>Profile audience</strong><small>{audienceLabel}</small></span><UiIcon name="chevron" /></a>
            <a href="/activity"><span><strong>My activity</strong><small>Connections and requests</small></span><UiIcon name="chevron" /></a>
            <a href="/settings#privacy"><span><strong>Privacy & security</strong><small>Account security and preferences</small></span><UiIcon name="chevron" /></a>
            <a href="/settings"><span><strong>Settings</strong><small>Notifications, appearance and more</small></span><UiIcon name="chevron" /></a>
          </section>
        </aside>
      </div>
    </main>
  );
}
