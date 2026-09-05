'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { aspireLogo } from './logo';

type Mode = 'login' | 'signup';

const authCampuses = [
  { value: 'Purdue University', short: 'Purdue', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Purdue%20EngineeringMall.jpg?width=1400' },
  { value: 'UC Berkeley', short: 'Berkeley', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Sather%20gate%20berkeley.jpg?width=1400' },
  { value: 'UCLA', short: 'UCLA', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Royce%20Hall.jpg?width=1400' },
  { value: 'UC Davis', short: 'UC Davis', image: 'https://images.pexels.com/photos/7683700/pexels-photo-7683700.jpeg?auto=compress&cs=tinysrgb&w=1400' },
  { value: 'Rutgers University', short: 'Rutgers', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Queens%20Campus%20of%20Rutgers%20University%202026f.jpg?width=1400' },
  { value: 'University of Illinois Urbana-Champaign', short: 'UIUC', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Altgeld%20Hall.jpg?width=1400' },
  { value: 'The Ohio State University', short: 'OSU', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/University%20Hall%20%28Ohio%20State%20University%29.jpg?width=1400' },
  { value: 'University of Michigan', short: 'UMich', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Law%20Quadrangle%2C%20University%20of%20Michigan%2C%20University%20Avenue%20and%20State%20Street%2C%20Ann%20Arbor%2C%20MI%20-%2054381553310.jpg?width=1400' },
  { value: 'Other', short: 'Your campus', image: 'https://images.pexels.com/photos/7683692/pexels-photo-7683692.jpeg?auto=compress&cs=tinysrgb&w=1400' }
];

const peopleImage = 'https://images.pexels.com/photos/7973095/pexels-photo-7973095.jpeg?auto=compress&cs=tinysrgb&w=1000';
const imageFallback = 'https://images.pexels.com/photos/7683692/pexels-photo-7683692.jpeg?auto=compress&cs=tinysrgb&w=1200';

function readSafeNextPath() {
  if (typeof window === 'undefined') return '/campus';
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/campus';
}

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [school, setSchool] = useState('Purdue University');
  const [otherSchool, setOtherSchool] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [nextPath, setNextPath] = useState('/campus');

  useEffect(() => {
    const safeNext = readSafeNextPath();
    setNextPath(safeNext);

    if (mode === 'login') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('confirmed') === '1') {
        setMessage('Email confirmed. You’re ready to enter campus.');
      }
    }
  }, [mode]);

  const signup = mode === 'signup';
  const selectedCampus = useMemo(
    () => authCampuses.find((campus) => campus.value === school) ?? authCampuses[0],
    [school]
  );

  const finalSchool = school === 'Other' ? otherSchool.trim() : school;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setPendingConfirmation(false);

    try {
      const supabase = getSupabaseBrowserClient();

      if (mode === 'signup') {
        if (!finalSchool) throw new Error('Choose or enter your campus.');
        const nextQuery = `&next=${encodeURIComponent(nextPath)}`;
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: name.trim(),
              school: finalSchool
            },
            emailRedirectTo: `${window.location.origin}/login?confirmed=1${nextQuery}`
          }
        });
        if (error) throw error;

        if (data.session) {
          router.push(nextPath);
          router.refresh();
        } else {
          setPendingConfirmation(true);
          setMessage('Check your inbox and spam folder to confirm your account.');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });
        if (error) throw error;
        router.push(nextPath);
        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function resendConfirmation() {
    if (!email.trim()) return;
    setResending(true);
    setMessage('');

    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/login?confirmed=1&next=${encodeURIComponent('/campus')}`
        }
      });
      if (error) throw error;
      setMessage('Confirmation email sent. Check your inbox and spam folder.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not resend the confirmation email.');
    } finally {
      setResending(false);
    }
  }

  const nextQuery = nextPath === '/campus' ? '' : `?next=${encodeURIComponent(nextPath)}`;
  const switchHref = signup ? `/login${nextQuery}` : `/signup${nextQuery}`;
  const recoveryHref = `/forgot-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`;

  const handleImageError = (event: React.SyntheticEvent<HTMLImageElement>) => {
    if (event.currentTarget.src !== imageFallback) event.currentTarget.src = imageFallback;
  };

  return (
    <main className={`authPage ${signup ? 'authSignup' : 'authLogin'}`}>
      <header className="authTopbar">
        <a className="authBrand" href="/" aria-label="Aspire 101 home">
          <img src={aspireLogo} alt="" />
          <span>Aspire 101</span>
        </a>
        <a className="authBack" href="/">Back to campus ↗</a>
      </header>

      <section className="authShell">
        <div className="authVisual">
          <div className="authVisualGlow" />
          <div className="authVisualHeadline">
            <p className="eyebrow">{signup ? 'YOUR CAMPUS STARTS HERE' : 'WELCOME BACK'}</p>
            <h1>{signup ? <>Find what you need.<br /><em>Meet who’s nearby.</em></> : <>Your campus<br /><em>is still moving.</em></>}</h1>
          </div>

          <figure className="authCampusPhoto">
            <img src={selectedCampus.image} alt={`${selectedCampus.short} campus`} onError={handleImageError} />
            <span className="authPhotoShade" />
            <figcaption>{selectedCampus.short}</figcaption>
          </figure>

          <figure className="authPeoplePhoto">
            <img src={peopleImage} alt="College students together" onError={handleImageError} />
            <span className="authPhotoShade" />
          </figure>

          <div className="authSticker authStickerSchool">SAME CAMPUS.<br />REAL PEOPLE. ✓</div>
          <div className="authSticker authStickerAsk">JUST POST IT<br />ON ASPIRE ↗</div>
          <div className="authDoodle" aria-hidden="true">less asking around<br />more getting it done ↗</div>

          <div className="authRequestBits" aria-hidden="true">
            <span>Ride to IND Friday?</span>
            <span>Math 55 tonight?</span>
            <span>Valorant duo?</span>
          </div>
        </div>

        <form className="authCard" onSubmit={submit}>
          <div className="authCardTop">
            <div>
              <span>{signup ? 'JOIN ASPIRE' : 'LOG IN'}</span>
              <h2>{signup ? 'Enter your campus.' : 'Good to see you.'}</h2>
            </div>
            <a href={switchHref}>{signup ? 'Log in' : 'Sign up'} ↗</a>
          </div>

          {signup && (
            <>
              <label>
                <span>Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
              </label>

              <label>
                <span>Campus</span>
                <select value={school} onChange={(e) => setSchool(e.target.value)} required>
                  {authCampuses.map((campus) => <option key={campus.value} value={campus.value}>{campus.value}</option>)}
                </select>
              </label>

              {school === 'Other' && (
                <label>
                  <span>Your school</span>
                  <input value={otherSchool} onChange={(e) => setOtherSchool(e.target.value)} placeholder="Type your university" required />
                </label>
              )}
            </>
          )}

          <label>
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={signup ? 'you@school.edu' : 'you@example.com'} autoComplete="email" required />
          </label>
          {signup && <p className="authFieldNote">School email recommended for campus verification. Beta accounts can still use another email.</p>}

          <label>
            <span>Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" minLength={6} autoComplete={signup ? 'new-password' : 'current-password'} required />
          </label>

          {!signup && (
            <div className="authUtilityRow">
              <span>Can’t get in?</span>
              <a href={recoveryHref}>Forgot password?</a>
            </div>
          )}

          <button className="button buttonGold authSubmit" type="submit" disabled={busy}>
            {busy ? 'One second…' : signup ? 'Join your campus →' : 'Enter campus →'}
          </button>

          {pendingConfirmation && (
            <div className="authEmailActions">
              <button type="button" onClick={resendConfirmation} disabled={resending}>
                {resending ? 'Sending…' : 'Resend confirmation'}
              </button>
              <a href={recoveryHref}>I already had an account</a>
            </div>
          )}

          {message && <p className="authMessage" role="status">{message}</p>}

          <div className="authTrustRow" aria-label="Aspire trust features">
            <span>School-based</span><span>Mutual connect</span><span>Report + block</span>
          </div>

          <p className="authLegal">By continuing, you agree to Aspire 101&apos;s <a href="/terms">Terms</a>, <a href="/guidelines">Guidelines</a>, and <a href="/privacy">Privacy Policy</a>.</p>
        </form>
      </section>
    </main>
  );
}
