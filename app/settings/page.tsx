'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import AppDock from '../AppDock';
import AppLoader from '../AppLoader';
import MfaSecurityCard from '../MfaSecurityCard';
import PaymentConnectRow from '../PaymentConnectRow';
import UiIcon from '../UiIcon';

type LocationMode = 'off' | 'approximate' | 'precise_on_request';
type ProfileVisibility = 'private' | 'connections' | 'campus';
type ThemePreference = 'system' | 'light' | 'dark';

type Preferences = {
  location_mode: LocationMode;
  profile_visibility: ProfileVisibility;
  show_major: boolean;
  show_graduation_year: boolean;
  show_interests: boolean;
  show_completed: boolean;
  show_joined: boolean;
  ai_personalization: boolean;
  notify_messages: boolean;
  notify_connections: boolean;
  notify_post_updates: boolean;
  notify_payments: boolean;
  notify_safety: boolean;
  notify_marketing: boolean;
};

const defaults: Preferences = {
  location_mode: 'off',
  profile_visibility: 'connections',
  show_major: true,
  show_graduation_year: true,
  show_interests: true,
  show_completed: true,
  show_joined: true,
  ai_personalization: true,
  notify_messages: true,
  notify_connections: true,
  notify_post_updates: true,
  notify_payments: true,
  notify_safety: true,
  notify_marketing: false
};

function Toggle({ checked, onChange, label, detail, locked = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; detail: string; locked?: boolean }) {
  return (
    <label className={`settingsToggleRow ${locked ? 'isLocked' : ''}`}>
      <span><strong>{label}</strong><small>{detail}</small></span>
      <input type="checkbox" checked={checked} disabled={locked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [school, setSchool] = useState('Your campus');
  const [schoolVerified, setSchoolVerified] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [prefs, setPrefs] = useState<Preferences>(defaults);
  const [theme, setTheme] = useState<ThemePreference>('system');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let alive = true;
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      if (!user) {
        router.replace('/login?next=%2Fsettings');
        return;
      }
      const [{ data: profile }, { data: preferenceRow }, { data: verification }] = await Promise.all([
        supabase.from('profiles').select('school').eq('id', user.id).maybeSingle(),
        supabase.from('user_preferences').select('location_mode,profile_visibility,show_major,show_graduation_year,show_interests,show_completed,show_joined,ai_personalization,notify_messages,notify_connections,notify_post_updates,notify_payments,notify_safety,notify_marketing').eq('user_id', user.id).maybeSingle(),
        supabase.from('school_verifications').select('status').eq('user_id', user.id).maybeSingle()
      ]);
      if (!alive) return;
      setUserId(user.id);
      setEmail(user.email || '');
      setSchool(profile?.school || 'Your campus');
      setSchoolVerified(verification?.status === 'verified');
      setPhoneVerified(Boolean(user.phone_confirmed_at));
      if (preferenceRow) setPrefs({ ...defaults, ...(preferenceRow as Preferences) });
      const storedTheme = window.localStorage.getItem('aspire-theme');
      setTheme(storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system' ? storedTheme : 'system');
      setLoading(false);
    });
    return () => { alive = false; };
  }, [router]);

  const profileAudienceCopy = useMemo(() => {
    if (prefs.profile_visibility === 'private') return 'Only you can open your full Aspire profile.';
    if (prefs.profile_visibility === 'campus') return 'Verified students at your home campus can open your profile.';
    return 'Only people you have an active or completed Aspire connection with can open your profile.';
  }, [prefs.profile_visibility]);

  function patch<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPrefs((current) => ({ ...current, [key]: value }));
    setStatus('');
  }

  function applyTheme(next: ThemePreference) {
    setTheme(next);
    window.localStorage.setItem('aspire-theme', next);
    const actual = next === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      : next;
    document.documentElement.dataset.aspireTheme = actual;
  }

  async function save() {
    if (!userId) return;
    setSaving(true);
    setStatus('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.from('user_preferences').upsert({ user_id: userId, ...prefs }, { onConflict: 'user_id' });
      if (error) throw error;
      setStatus('Settings saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace('/');
    router.refresh();
  }

  if (loading) return <AppLoader label="Opening settings…" detail="Privacy + preferences" />;

  return (
    <main className="settingsPage">
      <AppDock active="settings" />
      <div className="settingsShell">
        <header className="settingsHero">
          <div>
            <span>YOUR ASPIRE</span>
            <h1>Settings</h1>
            <p>Control privacy, location, notifications, payments, and how Aspire personalizes your campus experience.</p>
          </div>
          <a href="/profile" className="settingsProfileLink"><UiIcon name="user" />View profile</a>
        </header>

        <div className="settingsGrid">
          <nav className="settingsIndex" aria-label="Settings sections">
            <a href="#account"><UiIcon name="user" />Account & security</a>
            <a href="#campus"><UiIcon name="home" />Campus & verification</a>
            <a href="#privacy"><UiIcon name="shield" />Privacy & location</a>
            <a href="#notifications"><UiIcon name="bell" />Notifications</a>
            <a href="#personalization"><UiIcon name="compass" />Aspire personalization</a>
            <a href="#payments"><UiIcon name="wallet" />Payments & payouts</a>
            <a href="#appearance"><UiIcon name="moon" />Appearance</a>
          </nav>

          <div className="settingsContent">
            <section className="settingsCard" id="account">
              <div className="settingsCardHead"><i><UiIcon name="user" /></i><div><span>ACCOUNT & SECURITY</span><h2>Your private account</h2><p>These details are never part of your public student profile.</p></div></div>
              <div className="settingsInfoRow"><div><strong>Email</strong><span>{email}</span></div><b>Confirmed</b></div>
              <MfaSecurityCard />
              <div className="settingsInlineLinks"><a href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`}>Change password</a><button type="button" onClick={signOut}>Log out</button></div>
            </section>

            <section className="settingsCard" id="campus">
              <div className="settingsCardHead"><i><UiIcon name="home" /></i><div><span>CAMPUS & VERIFICATION</span><h2>Your verified home base</h2><p>Your home campus comes from school verification, not your device location.</p></div></div>
              <div className="settingsCampusRow"><div><strong>{school}</strong><span>{schoolVerified ? 'Verified student identity' : 'Campus verification still needed'}</span></div><b className={schoolVerified ? 'verified' : ''}>{schoolVerified ? '✓ VERIFIED' : 'REVIEW'}</b></div>
              <a className="settingsTextLink" href="/profile#trust-passport">Manage verification <UiIcon name="chevron" /></a>
            </section>

            <section className="settingsCard" id="privacy">
              <div className="settingsCardHead"><i><UiIcon name="shield" /></i><div><span>PRIVACY & LOCATION</span><h2>You decide what gets shared.</h2><p>Precise location is never displayed on your profile. Aspire only asks for location when a feature needs it.</p></div></div>

              <div className="settingsChoiceGroup">
                <strong>Who can open my profile?</strong>
                <div className="settingsSegmented">
                  {(['private','connections','campus'] as ProfileVisibility[]).map((value) => (
                    <button type="button" key={value} className={prefs.profile_visibility === value ? 'active' : ''} onClick={() => patch('profile_visibility', value)}>
                      {value === 'private' ? 'Only me' : value === 'connections' ? 'Connections' : 'My campus'}
                    </button>
                  ))}
                </div>
                <small>{profileAudienceCopy}</small>
              </div>

              <div className="settingsChoiceGroup">
                <strong>Location permission preference</strong>
                <div className="settingsLocationChoices">
                  <button type="button" className={prefs.location_mode === 'off' ? 'active' : ''} onClick={() => patch('location_mode','off')}><UiIcon name="mapPin" /><span><b>Off</b><small>Do not use device location.</small></span></button>
                  <button type="button" className={prefs.location_mode === 'approximate' ? 'active' : ''} onClick={() => patch('location_mode','approximate')}><UiIcon name="compass" /><span><b>Approximate</b><small>Ask when nearby campus or distance features need it.</small></span></button>
                  <button type="button" className={prefs.location_mode === 'precise_on_request' ? 'active' : ''} onClick={() => patch('location_mode','precise_on_request')}><UiIcon name="mapPin" /><span><b>Ask for precise</b><small>Only for a specific ride, pickup, or meetup. Never always-on.</small></span></button>
                </div>
                <small>Choosing a preference does not grant browser permission by itself. Your browser will still ask you before location is shared.</small>
              </div>

              <div className="settingsToggleStack">
                <Toggle checked={prefs.show_major} onChange={(v) => patch('show_major',v)} label="Show major" detail="Visible only to your selected profile audience." />
                <Toggle checked={prefs.show_graduation_year} onChange={(v) => patch('show_graduation_year',v)} label="Show graduation year" detail="Example: Class of 2028." />
                <Toggle checked={prefs.show_interests} onChange={(v) => patch('show_interests',v)} label="Show interests" detail="Helps connections understand what you are into." />
                <Toggle checked={prefs.show_completed} onChange={(v) => patch('show_completed',v)} label="Show Completed count" detail="An objective trust signal — not a student rating." />
                <Toggle checked={prefs.show_joined} onChange={(v) => patch('show_joined',v)} label="Show joined date" detail="Shows how long you have been part of Aspire." />
              </div>
            </section>

            <section className="settingsCard" id="notifications">
              <div className="settingsCardHead"><i><UiIcon name="bell" /></i><div><span>NOTIFICATIONS</span><h2>Only the updates you want</h2><p>Safety and transaction-critical messages stay separate from marketing.</p></div></div>
              <div className="settingsToggleStack">
                <Toggle checked={prefs.notify_messages} onChange={(v) => patch('notify_messages',v)} label="Messages" detail="New chat messages from your connections." />
                <Toggle checked={prefs.notify_connections} onChange={(v) => patch('notify_connections',v)} label="Connections" detail="Responses, accepts, and completion updates." />
                <Toggle checked={prefs.notify_post_updates} onChange={(v) => patch('notify_post_updates',v)} label="Post updates" detail="Activity on requests and listings you created." />
                <Toggle checked={prefs.notify_payments} onChange={(v) => patch('notify_payments',v)} label="Payments & payouts" detail="Receipts, payout status, refunds, and disputes." />
                <Toggle checked={prefs.notify_safety} onChange={() => undefined} label="Safety alerts" detail="Important account and safety notices cannot be disabled." locked />
                <Toggle checked={prefs.notify_marketing} onChange={(v) => patch('notify_marketing',v)} label="Product & campus updates" detail="Optional news, launches, and Aspire announcements." />
              </div>
            </section>

            <section className="settingsCard" id="personalization">
              <div className="settingsCardHead"><i><UiIcon name="compass" /></i><div><span>ASPIRE PERSONALIZATION</span><h2>Make the campus feed more relevant.</h2><p>Major, graduation year, interests, and your Aspire activity can boost useful posts. They never hide the rest of your campus.</p></div></div>
              <Toggle checked={prefs.ai_personalization} onChange={(v) => patch('ai_personalization',v)} label="Personalized recommendations" detail="Use your profile and Aspire activity as soft ranking signals." />
              <div className="settingsAiNote"><UiIcon name="check" /><span><strong>Boost, not filter.</strong> A CS student can still discover art, rides, marketplace, clubs, and everything else on campus.</span></div>
              <a className="settingsTextLink" href="/profile">Edit major & interests <UiIcon name="chevron" /></a>
            </section>

            <section className="settingsCard" id="payments">
              <div className="settingsCardHead"><i><UiIcon name="wallet" /></i><div><span>PAYMENTS & PAYOUTS</span><h2>Money stays separate from your profile.</h2><p>Manage Aspire payment setup and transaction activity privately.</p></div></div>
              <div className="profileMenuList settingsPaymentWrap"><PaymentConnectRow phoneVerified={phoneVerified} schoolVerified={schoolVerified} /></div>
              <a className="settingsTextLink" href="/transactions">Open transaction history <UiIcon name="chevron" /></a>
            </section>

            <section className="settingsCard" id="appearance">
              <div className="settingsCardHead"><i><UiIcon name="moon" /></i><div><span>APPEARANCE</span><h2>Choose your Aspire look.</h2><p>Appearance belongs in Settings instead of taking up a separate account-menu item.</p></div></div>
              <div className="settingsThemeChoices">
                <button type="button" className={theme === 'system' ? 'active' : ''} onClick={() => applyTheme('system')}><UiIcon name="settings" /><span>System</span></button>
                <button type="button" className={theme === 'light' ? 'active' : ''} onClick={() => applyTheme('light')}><UiIcon name="sun" /><span>Light</span></button>
                <button type="button" className={theme === 'dark' ? 'active' : ''} onClick={() => applyTheme('dark')}><UiIcon name="moon" /><span>Black & Gold</span></button>
              </div>
            </section>

            <section className="settingsCard settingsHelpCard">
              <div><span>SAFETY & HELP</span><h2>Need help with a connection?</h2><p>Reporting, blocking, guidelines, and support stay in Aspire Safety.</p></div>
              <a href="/safety"><UiIcon name="shield" />Open Safety & Help</a>
            </section>

            <div className="settingsSaveBar">
              <span>{status || 'Changes to privacy, notifications, and personalization are saved to your account.'}</span>
              <button type="button" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
