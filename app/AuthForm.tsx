'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { findNearestUniversity, NearestUniversity, resolveUniversityByEmail, University } from '../lib/supabase/universities';
import { aspireLogo } from './logo';
import AppLoader from './AppLoader';

type Mode = 'login' | 'signup';

const peopleImage = 'https://images.pexels.com/photos/7973095/pexels-photo-7973095.jpeg?auto=compress&cs=tinysrgb&w=1000';
const imageFallback = 'https://images.pexels.com/photos/7683692/pexels-photo-7683692.jpeg?auto=compress&cs=tinysrgb&w=1200';

function readSafeNextPath() {
  if (typeof window === 'undefined') return '/campus';
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/campus';
}

function emailDomain(value: string) {
  return value.trim().toLowerCase().split('@')[1] ?? '';
}

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const signup = mode === 'signup';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [entering, setEntering] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [nextPath, setNextPath] = useState('/campus');
  const [detectedCampus, setDetectedCampus] = useState<University | null>(null);
  const [checkingSchool, setCheckingSchool] = useState(false);
  const [schoolChecked, setSchoolChecked] = useState(false);
  const [nearestCampus, setNearestCampus] = useState<NearestUniversity | null>(null);
  const [locationRequested, setLocationRequested] = useState(false);

  useEffect(() => {
    const safeNext = readSafeNextPath();
    setNextPath(safeNext);

    const params = new URLSearchParams(window.location.search);
    if (mode === 'login' && params.get('confirmed') === '1') {
      setMessage('Email confirmed. Your school identity is ready.');
    }
  }, [mode]);

  useEffect(() => {
    if (!signup) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.includes('@') || emailDomain(cleanEmail).length < 4) {
      setDetectedCampus(null);
      setSchoolChecked(false);
      setCheckingSchool(false);
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      setCheckingSchool(true);
      try {
        const campus = await resolveUniversityByEmail(cleanEmail);
        if (!active) return;
        setDetectedCampus(campus);
        setSchoolChecked(true);

        if (campus && !locationRequested && 'geolocation' in navigator) {
          setLocationRequested(true);
          navigator.geolocation.getCurrentPosition(
            async (position) => {
              try {
                const nearest = await findNearestUniversity(position.coords.latitude, position.coords.longitude);
                if (active) setNearestCampus(nearest);
              } catch {
                // Location is a contextual suggestion only; signup must still work without it.
              }
            },
            () => undefined,
            { enableHighAccuracy: false, timeout: 6500, maximumAge: 300000 }
          );
        }
      } catch {
        if (active) {
          setDetectedCampus(null);
          setSchoolChecked(true);
        }
      } finally {
        if (active) setCheckingSchool(false);
      }
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [email, signup, locationRequested]);

  function enterCircle(path: string) {
    setEntering(true);
    window.setTimeout(() => {
      router.push(path);
      router.refresh();
    }, 320);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setPendingConfirmation(false);

    try {
      const supabase = getSupabaseBrowserClient();
      const cleanEmail = email.trim().toLowerCase();

      if (signup) {
        const campus = await resolveUniversityByEmail(cleanEmail);
        if (!campus) {
          const domain = emailDomain(cleanEmail);
          if (!domain.endsWith('.edu')) throw new Error('Use your university .edu email to create an Aspire account.');
          throw new Error('Aspire is not open for this university email yet.');
        }

        setDetectedCampus(campus);
        const nextQuery = `&next=${encodeURIComponent(nextPath)}`;
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              display_name: name.trim()
            },
            emailRedirectTo: `${window.location.origin}/login?confirmed=1${nextQuery}`
          }
        });
        if (error) throw error;

        if (data.session) {
          enterCircle(nextPath);
        } else {
          setPendingConfirmation(true);
          setMessage(`Check ${cleanEmail} to confirm your ${campus.short_name} account.`);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password
        });
        if (error) throw error;
        enterCircle(nextPath);
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Something went wrong. Try again.';
      setMessage(text.includes('Aspire signup requires a supported university email')
        ? 'Use a supported university .edu email to create an Aspire account.'
        : text);
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
        email: email.trim().toLowerCase(),
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

  const domain = emailDomain(email);
  const unsupportedMessage = domain
    ? domain.endsWith('.edu')
      ? 'This .edu campus is not supported yet.'
      : 'Aspire accounts require a university .edu email.'
    : '';
  const nearSupportedCampus = nearestCampus && nearestCampus.distance_miles <= 50 ? nearestCampus : null;
  const visitingCampus = nearSupportedCampus && detectedCampus && nearSupportedCampus.id !== detectedCampus.id ? nearSupportedCampus : null;
  const visualCampusName = detectedCampus?.short_name ?? 'Your campus';
  const visualCampusImage = detectedCampus?.cover_image || imageFallback;

  if (entering) {
    return <AppLoader label="Entering your circle…" detail="Opening Community Circle" />;
  }

  return (
    <main className={`authPage ${signup ? 'authSignup' : 'authLogin'}`}>
      <header className="authTopbar">
        <a className="authBrand" href="/" aria-label="Aspire 101 home">
          <img src={aspireLogo} alt="" />
          <span>Aspire 101</span>
        </a>
        <a className="authBack" href="/">Back to home ↗</a>
      </header>

      <section className="authShell">
        <div className="authVisual">
          <div className="authVisualGlow" />
          <div className="authVisualHeadline">
            <p className="eyebrow">{signup ? 'YOUR CAMPUS STARTS HERE' : 'WELCOME BACK'}</p>
            <h1>{signup ? <>Your school email.<br /><em>Your real campus.</em></> : <>Your campus<br /><em>is still moving.</em></>}</h1>
          </div>

          <figure className="authCampusPhoto">
            <img src={visualCampusImage} alt={`${visualCampusName} campus`} onError={handleImageError} />
            <span className="authPhotoShade" />
            <figcaption>{visualCampusName}</figcaption>
          </figure>

          <figure className="authPeoplePhoto">
            <img src={peopleImage} alt="College students together" onError={handleImageError} />
            <span className="authPhotoShade" />
          </figure>

          <div className="authSticker authStickerSchool">SAME CAMPUS.<br />REAL PEOPLE. ✓</div>
          <div className="authSticker authStickerAsk">JUST POST IT<br />ON ASPIRE ↗</div>
          <div className="authDoodle" aria-hidden="true">school email in<br />campus circle opens ↗</div>

          <div className="authRequestBits" aria-hidden="true">
            <span>Ride to IND Friday?</span>
            <span>Math 55 tonight?</span>
            <span>Valorant duo?</span>
          </div>
        </div>

        <form className="authCard" onSubmit={submit}>
          <div className="authCardTop">
            <div>
              <span>{signup ? 'JOIN ASPIRE' : 'SIGN IN'}</span>
              <h2>{signup ? 'Find your campus.' : 'Good to see you.'}</h2>
            </div>
            <a href={switchHref}>{signup ? 'Sign in' : 'Sign up'} ↗</a>
          </div>

          {signup && (
            <label>
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
            </label>
          )}

          <label>
            <span>{signup ? 'University email' : 'Email'}</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={signup ? 'you@university.edu' : 'you@example.com'} autoComplete="email" required />
          </label>

          {signup && (
            <div className={`authSchoolDetection ${detectedCampus ? 'isDetected' : schoolChecked ? 'isUnsupported' : ''}`} aria-live="polite">
              {checkingSchool && <span className="authDetecting"><i /> Checking school…</span>}
              {!checkingSchool && detectedCampus && (
                <div className="authDetectedSchool">
                  <span>SCHOOL DETECTED</span>
                  <strong>{detectedCampus.name} ✓</strong>
                  <small>{detectedCampus.city}{detectedCampus.state ? `, ${detectedCampus.state}` : ''} · confirmed after you verify this email</small>
                </div>
              )}
              {!checkingSchool && schoolChecked && !detectedCampus && unsupportedMessage && (
                <div className="authUnsupportedSchool"><span>NOT AVAILABLE</span><strong>{unsupportedMessage}</strong></div>
              )}
              {detectedCampus && nearSupportedCampus && !visitingCampus && (
                <div className="authNearbyCampus">● You appear to be near {nearSupportedCampus.short_name}</div>
              )}
              {detectedCampus && visitingCampus && (
                <div className="authNearbyCampus isVisiting">● You appear to be near {visitingCampus.short_name}. Your home campus will still be {detectedCampus.short_name}.</div>
              )}
            </div>
          )}

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

          <button className="button buttonGold authSubmit" type="submit" disabled={busy || (signup && checkingSchool)}>
            {busy ? (signup ? 'Creating account…' : 'Signing in…') : signup ? 'Create school account →' : 'Enter Community Circle →'}
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
            <span>School email required</span><span>Mutual connect</span><span>Report + block</span>
          </div>

          <p className="authLegal">By continuing, you agree to Aspire 101&apos;s <a href="/terms">Terms</a>, <a href="/guidelines">Guidelines</a>, and <a href="/privacy">Privacy Policy</a>.</p>
        </form>
      </section>
    </main>
  );
}
