'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import { fetchMyRole } from '../../lib/supabase/trust';
import type { AppRole } from '../../lib/supabase/trust';
import AppDock from '../AppDock';
import AppLoader from '../AppLoader';
import ProfileAvatar from '../ProfileAvatar';
import UiIcon from '../UiIcon';

type ProfileView = {
  name: string;
  email: string;
  school: string;
  emailVerified: boolean;
  schoolVerified: boolean;
  phoneVerified: boolean;
  idVerified: boolean;
  avatarUrl: string;
  bio: string;
  major: string;
  graduationYear: number | null;
  interests: string[];
  joinedAt: string;
  completedCount: number;
};

type EditDraft = {
  name: string;
  major: string;
  graduationYear: string;
  bio: string;
  interests: string;
};

function joinedLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [role, setRole] = useState<AppRole>('member');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editMessage, setEditMessage] = useState('');
  const [draft, setDraft] = useState<EditDraft>({ name: '', major: '', graduationYear: '', bio: '', interests: '' });

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      if (!user) {
        router.replace('/login?next=%2Fprofile');
        return;
      }

      const [{ data: profileRow }, { data: schoolVerification }, { data: identityVerification }, { count: completedCount }, nextRole] = await Promise.all([
        supabase
          .from('profiles')
          .select('display_name,name,full_name,school,home_campus_id,avatar_url,image_url,bio,major,graduation_year,interests,created_at')
          .eq('id', user.id)
          .maybeSingle(),
        supabase.from('school_verifications').select('status,verification_method,school_email').eq('user_id', user.id).maybeSingle(),
        supabase.from('identity_verifications').select('status').eq('user_id', user.id).maybeSingle(),
        supabase.from('requests').select('id', { count: 'exact', head: true }).eq('poster_id', user.id).eq('status', 'completed'),
        fetchMyRole().catch(() => 'member' as AppRole)
      ]);

      const metadata = user.user_metadata ?? {};
      const backendName = profileRow?.display_name || profileRow?.full_name || profileRow?.name;
      const backendSchool = profileRow?.school;
      const interests = Array.isArray(profileRow?.interests)
        ? profileRow.interests.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];

      setProfile({
        name: typeof backendName === 'string' && backendName.trim()
          ? backendName.trim()
          : typeof metadata.display_name === 'string' && metadata.display_name.trim()
            ? metadata.display_name.trim()
            : user.email?.split('@')[0] || 'Aspire student',
        email: user.email || '',
        school: typeof backendSchool === 'string' && backendSchool.trim() ? backendSchool.trim() : 'Campus not set',
        emailVerified: Boolean(user.email_confirmed_at),
        schoolVerified: schoolVerification?.status === 'verified',
        phoneVerified: Boolean(user.phone_confirmed_at),
        idVerified: identityVerification?.status === 'verified',
        avatarUrl: profileRow?.avatar_url || profileRow?.image_url || '',
        bio: typeof profileRow?.bio === 'string' ? profileRow.bio : '',
        major: typeof profileRow?.major === 'string' ? profileRow.major : '',
        graduationYear: typeof profileRow?.graduation_year === 'number' ? profileRow.graduation_year : null,
        interests,
        joinedAt: typeof profileRow?.created_at === 'string' ? profileRow.created_at : user.created_at,
        completedCount: completedCount || 0
      });
      setRole(nextRole);
    });
  }, [router]);

  function beginEdit() {
    if (!profile) return;
    setDraft({
      name: profile.name,
      major: profile.major,
      graduationYear: profile.graduationYear ? String(profile.graduationYear) : '',
      bio: profile.bio,
      interests: profile.interests.join(', ')
    });
    setEditMessage('');
    setEditing(true);
  }

  async function saveProfile() {
    if (!profile || saving) return;
    const name = draft.name.trim();
    const major = draft.major.trim();
    const bio = draft.bio.trim();
    const graduationYear = draft.graduationYear.trim() ? Number(draft.graduationYear) : null;
    const interests = Array.from(new Set(draft.interests.split(',').map((item) => item.trim()).filter(Boolean))).slice(0, 8);

    if (!name) {
      setEditMessage('Display name is required.');
      return;
    }
    if (name.length > 80) {
      setEditMessage('Display name must be 80 characters or fewer.');
      return;
    }
    if (bio.length > 240) {
      setEditMessage('Bio must be 240 characters or fewer.');
      return;
    }
    if (graduationYear !== null && (!Number.isInteger(graduationYear) || graduationYear < 2020 || graduationYear > 2100)) {
      setEditMessage('Enter a valid graduation year.');
      return;
    }

    setSaving(true);
    setEditMessage('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error('Sign in again before editing your profile.');

      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: name,
          major: major || null,
          graduation_year: graduationYear,
          bio: bio || null,
          interests
        })
        .eq('id', authData.user.id);
      if (error) throw error;

      setProfile({ ...profile, name, major, graduationYear, bio, interests });
      setEditMessage('Profile saved.');
      setEditing(false);
    } catch (error) {
      setEditMessage(error instanceof Error ? error.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return <AppLoader label="Opening your profile…" detail="Campus identity" />;

  const initials = profile.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'A';
  const classLabel = profile.graduationYear ? `Class of ${profile.graduationYear}` : 'Add graduation year';
  const majorLabel = profile.major || 'Add your major';
  const staff = role === 'moderator' || role === 'admin';

  return (
    <main className="profilePage profilePagePolished profileIdentityPage">
      <AppDock active="profile" />

      <div className="profileShell profileShellPolished">
        <header className="profileTop profileTopPolished">
          <div className="profilePageHeading">
            <span>YOUR IDENTITY</span>
            <h1>Profile</h1>
            <p>This is how other students recognize you across Aspire 101.</p>
          </div>
          <a className="profileBack" href="/campus"><UiIcon name="home" />Back home</a>
        </header>

        <section className="profileHero profileHeroPolished profileIdentityHero">
          <ProfileAvatar initialUrl={profile.avatarUrl} initials={initials} name={profile.name} />

          <div className="profileHeroCopy profileIdentityCopy">
            <div className="profileHeroMeta">
              <span>{profile.schoolVerified ? 'VERIFIED CAMPUS PROFILE' : 'CAMPUS PROFILE'}</span>
              {staff && <b>{role.toUpperCase()}</b>}
            </div>
            <h2>{profile.name}</h2>
            <div className="profileCampusLine">
              <UiIcon name="mapPin" />
              <span>{profile.school}</span>
              {profile.schoolVerified && <b><UiIcon name="check" />Verified</b>}
            </div>

            <div className="profileIdentityFacts">
              <span><small>MAJOR</small><strong>{majorLabel}</strong></span>
              <span><small>CLASS</small><strong>{classLabel}</strong></span>
            </div>

            <p className={`profileBio ${profile.bio ? '' : 'empty'}`}>{profile.bio || 'Add a short bio so people know a little about you.'}</p>

            <div className="profileInterests" aria-label="Interests">
              {profile.interests.length > 0
                ? profile.interests.map((interest) => <span key={interest}>{interest}</span>)
                : <button type="button" onClick={beginEdit}>+ Add interests</button>}
            </div>

            <div className="profileHeroActions profileIdentityActions">
              <button type="button" onClick={beginEdit}><UiIcon name="user" />Edit profile</button>
              <a href="/settings"><UiIcon name="settings" />Settings</a>
              <a href="/connections"><UiIcon name="message" />Messages</a>
            </div>
          </div>

          <div className="profileIdentityStats" aria-label="Profile activity">
            <div>
              <span>COMPLETED</span>
              <strong>{profile.completedCount}</strong>
              <small>requests</small>
            </div>
            <div>
              <span>JOINED</span>
              <strong>{joinedLabel(profile.joinedAt)}</strong>
              <small>Aspire 101</small>
            </div>
          </div>
        </section>

        {editing && (
          <section className="profileEditPanel" aria-label="Edit profile">
            <div className="profileSectionHeading">
              <div><span>EDIT PROFILE</span><h2>Make your profile feel like you.</h2></div>
              <button type="button" className="profileEditClose" onClick={() => setEditing(false)}>Cancel</button>
            </div>

            <div className="profileEditGrid">
              <label>
                <span>Display name</span>
                <input value={draft.name} maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Your name" />
              </label>
              <label>
                <span>Verified campus</span>
                <input value={profile.school} disabled />
                <small>Campus identity is managed through verification, not profile editing.</small>
              </label>
              <label>
                <span>Major</span>
                <input value={draft.major} maxLength={100} onChange={(event) => setDraft({ ...draft, major: event.target.value })} placeholder="Computer Science" />
              </label>
              <label>
                <span>Graduation year</span>
                <input value={draft.graduationYear} inputMode="numeric" maxLength={4} onChange={(event) => setDraft({ ...draft, graduationYear: event.target.value.replace(/\D/g, '') })} placeholder="2028" />
              </label>
              <label className="wide">
                <span>Signature / Bio</span>
                <textarea value={draft.bio} maxLength={240} onChange={(event) => setDraft({ ...draft, bio: event.target.value })} placeholder="Tell campus what you study, build, enjoy, or care about." />
                <small>{draft.bio.length}/240</small>
              </label>
              <label className="wide">
                <span>Interests</span>
                <input value={draft.interests} onChange={(event) => setDraft({ ...draft, interests: event.target.value })} placeholder="Startups, gaming, basketball, design" />
                <small>Separate interests with commas. Up to 8 will be shown.</small>
              </label>
            </div>

            <div className="profileEditActions">
              <p>{editMessage}</p>
              <button type="button" onClick={saveProfile} disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
            </div>
          </section>
        )}

        {!editing && editMessage && <p className="profileInlineMessage">{editMessage}</p>}

        <section className="profileIdentityOverview">
          <div className="profileIdentityCard">
            <div className="profileSectionHeading compact">
              <div><span>PROFILE PREVIEW</span><h2>What people can know about you</h2></div>
            </div>
            <div className="profileVisibilityRows">
              <div><i><UiIcon name="check" /></i><span><strong>Campus identity</strong><small>{profile.schoolVerified ? 'Verified campus badge is visible.' : 'Campus verification is not complete yet.'}</small></span></div>
              <div><i><UiIcon name="book" /></i><span><strong>Student details</strong><small>{profile.major || profile.graduationYear ? `${profile.major || 'Major not set'}${profile.graduationYear ? ` · Class of ${profile.graduationYear}` : ''}` : 'Add your major and graduation year.'}</small></span></div>
              <div><i><UiIcon name="activity" /></i><span><strong>Activity</strong><small>{profile.completedCount} completed · Joined {joinedLabel(profile.joinedAt)}</small></span></div>
              <div><i><UiIcon name="shield" /></i><span><strong>Privacy controls</strong><small>Choose exactly what other students can see in Settings.</small></span></div>
            </div>
            <a className="profilePrivacyLink" href="/settings#privacy">Manage profile visibility <UiIcon name="chevron" /></a>
          </div>

          <aside className="profileIdentityCard profileQuickActions">
            <div className="profileSectionHeading compact"><div><span>QUICK ACTIONS</span><h2>Your account</h2></div></div>
            <a href="/settings"><i><UiIcon name="settings" /></i><span><strong>Settings</strong><small>Account, security, privacy, notifications</small></span><b><UiIcon name="chevron" /></b></a>
            <a href="/connections"><i><UiIcon name="message" /></i><span><strong>Messages</strong><small>Open your campus conversations</small></span><b><UiIcon name="chevron" /></b></a>
            <a href="/safety"><i><UiIcon name="shield" /></i><span><strong>Safety & help</strong><small>Reporting, blocking, and support</small></span><b><UiIcon name="chevron" /></b></a>
            <div className="profileEmailSummary"><span>ACCOUNT EMAIL</span><strong>{profile.email}</strong><small>{profile.emailVerified ? 'Confirmed' : 'Confirmation needed'}</small></div>
          </aside>
        </section>

        <footer className="profileOperator">Aspire 101 is a product operated by Cloudora Labs, Inc.</footer>
      </div>
    </main>
  );
}
