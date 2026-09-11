'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import AppDock from '../AppDock';
import AppLoader from '../AppLoader';
import UiIcon from '../UiIcon';
import SchoolVerificationCard from '../SchoolVerificationCard';
import PhoneVerificationCard from '../PhoneVerificationCard';
import IdentityVerificationCard from '../IdentityVerificationCard';
import MfaSecurityCard from '../MfaSecurityCard';

type ProfileVisibility = 'private' | 'connections' | 'campus';
type LocationMode = 'off' | 'approximate' | 'precise_on_request';

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

type BooleanPreferenceKey = Exclude<keyof Preferences, 'location_mode' | 'profile_visibility'>;

type AccountView = {
  email: string;
  emailVerified: boolean;
  phone: string;
  phoneVerified: boolean;
  school: string;
};

const DEFAULT_PREFERENCES: Preferences = {
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

const privacyToggles: Array<{ key: BooleanPreferenceKey; label: string; detail: string }> = [
  { key: 'show_major', label: 'Show major', detail: 'Display your major on your student profile.' },
  { key: 'show_graduation_year', label: 'Show graduation year', detail: 'Display your class year on your profile.' },
  { key: 'show_interests', label: 'Show interests', detail: 'Let people see the interests you add to your profile.' },
  { key: 'show_completed', label: 'Show completed count', detail: 'Display how many Aspire requests you have completed.' },
  { key: 'show_joined', label: 'Show joined date', detail: 'Display when you joined Aspire 101.' }
];

const notificationToggles: Array<{ key: BooleanPreferenceKey; label: string; detail: string }> = [
  { key: 'notify_messages', label: 'Messages', detail: 'New replies and chat activity.' },
  { key: 'notify_connections', label: 'Connections', detail: 'Mutual connections and connection requests.' },
  { key: 'notify_post_updates', label: 'Post updates', detail: 'Responses and changes on your requests.' },
  { key: 'notify_payments', label: 'Payments', detail: 'Payment, refund, and transaction updates.' },
  { key: 'notify_safety', label: 'Safety notices', detail: 'Important trust and safety notices.' },
  { key: 'notify_marketing', label: 'Product updates', detail: 'Occasional Aspire product and community news.' }
];

export default function SettingsPage() {
  const router = useRouter();
  const [account, setAccount] = useState<AccountView | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [preferencesMessage, setPreferencesMessage] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [password, setPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      if (!user) {
        router.replace('/login?next=%2Fsettings');
        return;
      }

      const [{ data: profileRow }, { data: preferenceRow }] = await Promise.all([
        supabase.from('profiles').select('school').eq('id', user.id).maybeSingle(),
        supabase
          .from('user_preferences')
          .select('location_mode,profile_visibility,show_major,show_graduation_year,show_interests,show_completed,show_joined,ai_personalization,notify_messages,notify_connections,notify_post_updates,notify_payments,notify_safety,notify_marketing')
          .eq('user_id', user.id)
          .maybeSingle()
      ]);

      setAccount({
        email: user.email || '',
        emailVerified: Boolean(user.email_confirmed_at),
        phone: user.phone || '',
        phoneVerified: Boolean(user.phone_confirmed_at),
        school: typeof profileRow?.school === 'string' && profileRow.school.trim() ? profileRow.school.trim() : 'Campus not set'
      });
      setNewEmail(user.email || '');

      if (preferenceRow) {
        setPreferences({
          location_mode: preferenceRow.location_mode === 'approximate' || preferenceRow.location_mode === 'precise_on_request' ? preferenceRow.location_mode : 'off',
          profile_visibility: preferenceRow.profile_visibility === 'private' || preferenceRow.profile_visibility === 'campus' ? preferenceRow.profile_visibility : 'connections',
          show_major: preferenceRow.show_major !== false,
          show_graduation_year: preferenceRow.show_graduation_year !== false,
          show_interests: preferenceRow.show_interests !== false,
          show_completed: preferenceRow.show_completed !== false,
          show_joined: preferenceRow.show_joined !== false,
          ai_personalization: preferenceRow.ai_personalization !== false,
          notify_messages: preferenceRow.notify_messages !== false,
          notify_connections: preferenceRow.notify_connections !== false,
          notify_post_updates: preferenceRow.notify_post_updates !== false,
          notify_payments: preferenceRow.notify_payments !== false,
          notify_safety: preferenceRow.notify_safety !== false,
          notify_marketing: preferenceRow.notify_marketing === true
        });
      }
    });
  }, [router]);

  function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPreferences((current) => ({ ...current, [key]: value }));
    setPreferencesMessage('');
  }

  async function savePreferences() {
    if (savingPreferences) return;
    setSavingPreferences(true);
    setPreferencesMessage('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!data.user) throw new Error('Sign in again before saving settings.');
      const { error } = await supabase.from('user_preferences').upsert({ user_id: data.user.id, ...preferences }, { onConflict: 'user_id' });
      if (error) throw error;
      setPreferencesMessage('Settings saved.');
    } catch (error) {
      setPreferencesMessage(error instanceof Error ? error.message : 'Could not save settings.');
    } finally {
      setSavingPreferences(false);
    }
  }

  async function updateEmail() {
    if (!account || accountBusy) return;
    const next = newEmail.trim();
    if (!next || next === account.email) {
      setEmailMessage(next === account.email ? 'This is already your account email.' : 'Enter a valid email address.');
      return;
    }
    setAccountBusy(true);
    setEmailMessage('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ email: next });
      if (error) throw error;
      setEmailMessage('Check both your current and new inbox if Supabase asks you to confirm the change.');
    } catch (error) {
      setEmailMessage(error instanceof Error ? error.message : 'Could not update your email.');
    } finally {
      setAccountBusy(false);
    }
  }

  async function updatePassword() {
    if (accountBusy) return;
    if (password.length < 8) {
      setPasswordMessage('Use at least 8 characters.');
      return;
    }
    setAccountBusy(true);
    setPasswordMessage('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword('');
      setPasswordMessage('Password updated.');
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : 'Could not update your password.');
    } finally {
      setAccountBusy(false);
    }
  }

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace('/');
    router.refresh();
  }

  if (!account) return <AppLoader label="Opening settings…" detail="Account + privacy" />;

  return (
    <main className="settingsPage">
      <AppDock active="profile" />

      <div className="settingsShell">
        <header className="settingsTop">
          <div>
            <span>ACCOUNT CONTROL</span>
            <h1>Settings</h1>
            <p>Security, privacy, notifications, and Aspire preferences live here — separate from your public-facing profile.</p>
          </div>
          <a href="/profile"><UiIcon name="user" />View profile</a>
        </header>

        <nav className="settingsJump" aria-label="Settings sections">
          <a href="#account">Account & security</a>
          <a href="#verification">Verification</a>
          <a href="#privacy">Privacy</a>
          <a href="#notifications">Notifications</a>
          <a href="#personalization">Personalization</a>
        </nav>

        <section className="settingsSection" id="account">
          <div className="settingsSectionHeading">
            <div><span>ACCOUNT & SECURITY</span><h2>Protect your account.</h2></div>
            <p>Your profile details are edited on the Profile page. Login and security controls stay here.</p>
          </div>

          <div className="settingsGrid two">
            <article className="settingsCard">
              <div className="settingsCardTitle"><i><UiIcon name="message" /></i><div><strong>Email</strong><span>{account.emailVerified ? 'Confirmed account email' : 'Email confirmation needed'}</span></div></div>
              <label className="settingsField">
                <span>Account email</span>
                <input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} />
              </label>
              {emailMessage && <p className="settingsMessage">{emailMessage}</p>}
              <button className="settingsButton secondary" type="button" onClick={updateEmail} disabled={accountBusy}>Update email</button>
            </article>

            <article className="settingsCard">
              <div className="settingsCardTitle"><i><UiIcon name="shield" /></i><div><strong>Password</strong><span>Change your sign-in password</span></div></div>
              <label className="settingsField">
                <span>New password</span>
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder="At least 8 characters" />
              </label>
              {passwordMessage && <p className="settingsMessage">{passwordMessage}</p>}
              <button className="settingsButton secondary" type="button" onClick={updatePassword} disabled={accountBusy}>Update password</button>
            </article>
          </div>
        </section>

        <section className="settingsSection" id="verification">
          <div className="settingsSectionHeading">
            <div><span>TRUST & VERIFICATION</span><h2>Verification and two-factor security.</h2></div>
            <p>These controls support campus trust. Sensitive verification details are not shown on your public profile.</p>
          </div>
          <div className="profileTrustCards profileTrustCardsExpanded settingsTrustGrid">
            <SchoolVerificationCard school={account.school} />
            <IdentityVerificationCard />
            <MfaSecurityCard />
            <PhoneVerificationCard initialPhone={account.phone} initiallyVerified={account.phoneVerified} />
          </div>
        </section>

        <section className="settingsSection" id="privacy">
          <div className="settingsSectionHeading">
            <div><span>PRIVACY</span><h2>Choose who sees your profile.</h2></div>
            <p>Visibility controls affect the student profile people will open from Aspire conversations and community activity.</p>
          </div>

          <div className="settingsGrid two">
            <article className="settingsCard settingsVisibilityCard">
              <div className="settingsCardTitle"><i><UiIcon name="user" /></i><div><strong>Profile visibility</strong><span>Who can open your Aspire profile</span></div></div>
              <div className="settingsChoiceGroup">
                {([
                  ['private', 'Private', 'Only you can open the full profile.'],
                  ['connections', 'Connections', 'Only people you mutually connect with can open it.'],
                  ['campus', 'Campus', 'Signed-in students in supported Aspire campuses can open it.']
                ] as Array<[ProfileVisibility, string, string]>).map(([value, label, detail]) => (
                  <button key={value} type="button" className={preferences.profile_visibility === value ? 'selected' : ''} onClick={() => setPreference('profile_visibility', value)}>
                    <span><strong>{label}</strong><small>{detail}</small></span>
                    <b>{preferences.profile_visibility === value ? '✓' : ''}</b>
                  </button>
                ))}
              </div>
            </article>

            <article className="settingsCard">
              <div className="settingsCardTitle"><i><UiIcon name="sliders" /></i><div><strong>Visible profile details</strong><span>Fine-tune what appears</span></div></div>
              <div className="settingsToggleList">
                {privacyToggles.map((item) => (
                  <label key={item.key}>
                    <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                    <input type="checkbox" checked={preferences[item.key]} onChange={(event) => setPreference(item.key, event.target.checked)} />
                    <i />
                  </label>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section className="settingsSection" id="notifications">
          <div className="settingsSectionHeading">
            <div><span>NOTIFICATIONS</span><h2>Control what gets your attention.</h2></div>
            <p>Keep important campus activity on while turning off updates you do not need.</p>
          </div>
          <article className="settingsCard settingsWideCard">
            <div className="settingsToggleList split">
              {notificationToggles.map((item) => (
                <label key={item.key}>
                  <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                  <input type="checkbox" checked={preferences[item.key]} onChange={(event) => setPreference(item.key, event.target.checked)} />
                  <i />
                </label>
              ))}
            </div>
          </article>
        </section>

        <section className="settingsSection" id="personalization">
          <div className="settingsSectionHeading">
            <div><span>PERSONALIZATION</span><h2>Location and Aspire intelligence.</h2></div>
            <p>Location is off by default. Precise location is only requested when a feature needs it and you choose to share it.</p>
          </div>

          <div className="settingsGrid two">
            <article className="settingsCard">
              <div className="settingsCardTitle"><i><UiIcon name="mapPin" /></i><div><strong>Location mode</strong><span>Used for nearby-campus relevance</span></div></div>
              <label className="settingsField">
                <span>Default location behavior</span>
                <select value={preferences.location_mode} onChange={(event) => setPreference('location_mode', event.target.value as LocationMode)}>
                  <option value="off">Off</option>
                  <option value="approximate">Approximate only</option>
                  <option value="precise_on_request">Ask for precise location when needed</option>
                </select>
              </label>
            </article>

            <article className="settingsCard">
              <div className="settingsCardTitle"><i><UiIcon name="compass" /></i><div><strong>Aspire personalization</strong><span>Recommendations and helpful ranking</span></div></div>
              <div className="settingsToggleList">
                <label>
                  <span><strong>Personalized Aspire experience</strong><small>Use your Aspire activity and preferences to improve recommendations inside the product.</small></span>
                  <input type="checkbox" checked={preferences.ai_personalization} onChange={(event) => setPreference('ai_personalization', event.target.checked)} />
                  <i />
                </label>
              </div>
            </article>
          </div>
        </section>

        <div className="settingsSaveBar">
          <div><strong>{preferencesMessage || 'Settings are saved to your Aspire account.'}</strong><span>Profile changes themselves are edited from /profile.</span></div>
          <button type="button" onClick={savePreferences} disabled={savingPreferences}>{savingPreferences ? 'Saving…' : 'Save settings'}</button>
        </div>

        <section className="settingsSection settingsAccountFoot">
          <div><span>ACCOUNT</span><strong>{account.email}</strong><small>{account.emailVerified ? 'Confirmed' : 'Not confirmed'}</small></div>
          <button type="button" onClick={signOut}>Log out</button>
        </section>

        <footer className="profileOperator">Aspire 101 is a product operated by Cloudora Labs, Inc.</footer>
      </div>
    </main>
  );
}
