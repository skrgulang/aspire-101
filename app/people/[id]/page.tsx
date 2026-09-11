'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppDock from '../../AppDock';
import AppLoader from '../../AppLoader';
import UiIcon from '../../UiIcon';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import { fetchPublicProfile, PublicProfileView } from '../../../lib/supabase/public-profile';

function joinedLabel(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function lockedCopy(visibility: PublicProfileView['visibility']) {
  if (visibility === 'private') return 'This student keeps their Aspire profile private.';
  if (visibility === 'campus') return 'This profile is available only to students in the same verified campus community.';
  return 'This profile is available to confirmed Aspire connections.';
}

export default function PublicProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const userId = useMemo(() => typeof params?.id === 'string' ? params.id : '', [params]);
  const [profile, setProfile] = useState<PublicProfileView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userId) return;
    let alive = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!data.user) {
          router.replace(`/login?next=${encodeURIComponent(`/people/${userId}`)}`);
          return;
        }
        const next = await fetchPublicProfile(userId);
        if (!alive) return;
        setProfile(next);
      } catch (nextError) {
        if (!alive) return;
        setError(nextError instanceof Error ? nextError.message : 'Could not open this profile.');
      } finally {
        if (alive) setLoading(false);
      }
    }

    void load();
    return () => { alive = false; };
  }, [router, userId]);

  if (loading) return <AppLoader label="Opening student profile…" detail="Privacy-aware profile" />;

  if (error) {
    return (
      <main className="publicProfilePage">
        <AppDock active="profile" />
        <div className="publicProfileShell">
          <section className="publicProfileStateCard">
            <i><UiIcon name="shield" /></i>
            <span>PROFILE UNAVAILABLE</span>
            <h1>Couldn&apos;t open this profile.</h1>
            <p>{error}</p>
            <button type="button" onClick={() => router.back()}>Go back</button>
          </section>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="publicProfilePage">
        <AppDock active="profile" />
        <div className="publicProfileShell">
          <section className="publicProfileStateCard">
            <i><UiIcon name="user" /></i>
            <span>PROFILE NOT FOUND</span>
            <h1>This Aspire profile doesn&apos;t exist.</h1>
            <p>The account may have been removed or the link may be incorrect.</p>
            <button type="button" onClick={() => router.back()}>Go back</button>
          </section>
        </div>
      </main>
    );
  }

  if (!profile.can_view) {
    return (
      <main className="publicProfilePage">
        <AppDock active="profile" />
        <div className="publicProfileShell">
          <header className="publicProfileTop">
            <button type="button" onClick={() => router.back()}><UiIcon name="chevron" />Back</button>
          </header>
          <section className="publicProfileStateCard locked">
            <i><UiIcon name="shield" /></i>
            <span>PROFILE PRIVACY</span>
            <h1>This profile is restricted.</h1>
            <p>{lockedCopy(profile.visibility)}</p>
            <div className="publicProfileLockNotes">
              <small>Aspire only shows fields the student has chosen to share.</small>
              <small>Verification details, email, phone number, and private account data are never shown here.</small>
            </div>
            <a href="/connections">View your connections</a>
          </section>
        </div>
      </main>
    );
  }

  const initials = (profile.display_name || 'Aspire student').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'A';
  const joined = joinedLabel(profile.joined_at);
  const relationLabel = profile.owner_view
    ? 'YOUR PROFILE'
    : profile.is_connection
      ? 'ASPIRE CONNECTION'
      : profile.same_campus
        ? 'YOUR CAMPUS'
        : 'ASPIRE STUDENT';

  return (
    <main className="publicProfilePage">
      <AppDock active="profile" />
      <div className="publicProfileShell">
        <header className="publicProfileTop">
          <button type="button" onClick={() => router.back()}><UiIcon name="chevron" />Back</button>
          <span>{relationLabel}</span>
        </header>

        <section className="publicProfileHero">
          <div className="publicProfileAvatar">
            {profile.avatar_url ? <img src={profile.avatar_url} alt={`${profile.display_name || 'Student'} profile`} /> : initials}
          </div>

          <div className="publicProfileIdentity">
            <div className="publicProfileEyebrow">
              <span>{relationLabel}</span>
              {profile.school_verified && <b><UiIcon name="check" />Verified campus</b>}
            </div>
            <h1>{profile.display_name || 'Aspire student'}</h1>
            <div className="publicProfileCampus"><UiIcon name="mapPin" />{profile.school || 'Campus not listed'}</div>

            {(profile.major || profile.graduation_year) && (
              <div className="publicProfileAcademic">
                {profile.major && <span><small>MAJOR</small><strong>{profile.major}</strong></span>}
                {profile.graduation_year && <span><small>CLASS</small><strong>Class of {profile.graduation_year}</strong></span>}
              </div>
            )}

            {profile.bio && <p className="publicProfileBio">{profile.bio}</p>}

            {profile.interests && profile.interests.length > 0 && (
              <div className="publicProfileInterests">
                {profile.interests.map((interest) => <span key={interest}>{interest}</span>)}
              </div>
            )}

            <div className="publicProfileActions">
              {profile.owner_view ? (
                <a className="primary" href="/profile"><UiIcon name="user" />Edit my profile</a>
              ) : profile.is_connection ? (
                <a className="primary" href="/connections"><UiIcon name="message" />Message</a>
              ) : (
                <a className="primary" href="/campus"><UiIcon name="home" />Back to campus</a>
              )}
              <a href="/safety"><UiIcon name="shield" />Safety & help</a>
            </div>
          </div>

          {(profile.completed_count !== null || joined) && (
            <aside className="publicProfileStats">
              {profile.completed_count !== null && (
                <div><span>COMPLETED</span><strong>{profile.completed_count}</strong><small>requests</small></div>
              )}
              {joined && (
                <div><span>JOINED</span><strong>{joined}</strong><small>Aspire 101</small></div>
              )}
            </aside>
          )}
        </section>

        <section className="publicProfileTrustCard">
          <div>
            <i><UiIcon name="shield" /></i>
            <span><strong>Privacy-aware profile</strong><small>You are only seeing information this student has chosen to share with your relationship level.</small></span>
          </div>
          <a href="/settings#privacy">Your privacy settings <UiIcon name="chevron" /></a>
        </section>

        <footer className="profileOperator">Aspire 101 is a product operated by Cloudora Labs, Inc.</footer>
      </div>
    </main>
  );
}
