'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { findNearbyUniversities, NearbyUniversity, resolveUniversityByEmail, University } from '../lib/supabase/universities';
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
  const [nearbyCampuses, setNearbyCampuses] = useState<NearbyUniversity[]>([]);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);

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
  }, [email, signup]);

  function enterCircle(path: string) {
    setEntering(true);
    window.setTimeout(() => {
      router.push(path);
      router.refresh();
    }, 320);
  }

  async function findCampusesNearMe() {
    if (!('geolocation' in navigator)) {
      setLocationMessage('Location is not available in this browser.');
      return;
    }
    setLocating(true);
    setLocationMessage('');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const campuses = await findNearbyUniversities(position.coords.latitude, position.coords.longitude, { limit: 5, maxMiles: 250 });
          setNearbyCampuses(campuses);
          setLocationMessage(campuses.length ? 'Nearby campus context found.' : 'No supported campuses found nearby yet.');
        } catch (error) {
          setLocationMessage(error instanceof Error ? error.message : 'Could not find nearby campuses.');
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocationMessage('Location was not shared. Your school email still determines your home campus.');
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  }

  async function checkMfaBeforeEntering() {
    const supabase = getSupabaseBrowserClient();
    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError) throw aalError;
    if (aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2') {
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;
      const available = [
        ...(factors?.totp ?? []),
        ...(factors?.phone ?? [])
      ].find((factor) => factor.status === 'verified');
      if (!available) throw new Error('Two-step verification is enabled, but no verified factor could be found.');
      setMfaFactorId(available.id);
      setMfaRequired(true);
      setMessage('Enter your verification code to finish signing in.');
      return true;
    }
    return false;
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
            data: { display_name: name.trim() },
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
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) throw error;
        const needsMfa = await checkMfaBeforeEntering();
        if (!needsMfa) enterCircle(nextPath);
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

  async function verifyMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mfaCode.trim().length < 6 || !mfaFactorId) return;
    setMfaBusy(true);
    setMessage('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challenge.id,
        code: mfaCode.trim()
      });
      if (verifyError) throw verifyError;
      enterCircle(nextPath);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'That verification code did not work.');
    } finally {
      setMfaBusy(false);
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
        options: { emailRedirectTo: `${window.location.origin}/login?confirmed=1&next=${encodeURIComponent('/campus')}` }
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
  const nearbyPrimary = nearbyCampuses[0] ?? null;
  const visitingCampus = nearbyPrimary && detectedCampus && nearbyPrimary.id !== detectedCampus.id ? nearbyPrimary : null;
  const visualCampusName = detectedCampus?.short_name ?? nearbyPrimary?.short_name ?? 'Your campus';
  const visualCampusImage = detectedCampus?.cover_image || nearbyPrimary?.cover_image || imageFallback;

  if (entering) return <AppLoader label="Entering your circle…" detail="Opening Community Circle" />;

  return (
    <main className={`authPage ${signup ? 'authSignup' : 'authLogin'}`}>
      <header className="authTopbar">
        <a className="authBrand" href="/" aria-label="Aspire 101 home"><img src={aspireLogo} alt="" /><span>Aspire 101</span></a>
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
            <span className="authPhotoShade" /><figcaption>{visualCampusName}</figcaption>
          </figure>
          <figure className="authPeoplePhoto"><img src={peopleImage} alt="College students together" onError={handleImageError} /><span className="authPhotoShade" /></figure>
          <div className="authSticker authStickerSchool">SAME CAMPUS.<br />REAL PEOPLE. ✓</div>
          <div className="authSticker authStickerAsk">JUST POST IT<br />ON ASPIRE ↗</div>
          <div className="authDoodle" aria-hidden="true">home campus verified<br />nearby campus optional ↗</div>
          <div className="authRequestBits" aria-hidden="true"><span>Ride to IND Friday?</span><span>Math 55 tonight?</span><span>Valorant duo?</span></div>
        </div>

        {mfaRequired ? (
          <form className="authCard authMfaCard" onSubmit={verifyMfa}>
            <div className="authCardTop">
              <div><span>SECOND STEP</span><h2>Verification code.</h2></div>
              <button type="button" className="authMfaBack" onClick={() => { setMfaRequired(false); setMfaCode(''); }}>Back</button>
            </div>
            <div className="authMfaSeal">02</div>
            <p className="authMfaIntro">Your password was correct. Enter the code from your enrolled authenticator or phone factor to finish signing in.</p>
            <label>
              <span>6-digit code</span>
              <input className="authMfaInput" inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="000000" autoFocus />
            </label>
            <button className="button buttonGold authSubmit" type="submit" disabled={mfaBusy || mfaCode.length < 6}>{mfaBusy ? 'Verifying…' : 'Verify + enter →'}</button>
            {message && <p className="authMessage" role="status">{message}</p>}
            <div className="authTrustRow"><span>Password ✓</span><span>Second factor</span><span>AAL2 security</span></div>
          </form>
        ) : (
          <form className="authCard" onSubmit={submit}>
            <div className="authCardTop">
              <div><span>{signup ? 'JOIN ASPIRE' : 'SIGN IN'}</span><h2>{signup ? 'Find your campus.' : 'Good to see you.'}</h2></div>
              <a href={switchHref}>{signup ? 'Sign in' : 'Sign up'} ↗</a>
            </div>

            {signup && <label><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required /></label>}
            <label><span>{signup ? 'University email' : 'Email'}</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={signup ? 'you@university.edu' : 'you@example.com'} autoComplete="email" required /></label>

            {signup && (
              <div className={`authSchoolDetection ${detectedCampus ? 'isDetected' : schoolChecked ? 'isUnsupported' : ''}`} aria-live="polite">
                {checkingSchool && <span className="authDetecting"><i /> Checking school…</span>}
                {!checkingSchool && detectedCampus && (
                  <div className="authDetectedSchool"><span>HOME CAMPUS DETECTED</span><strong>{detectedCampus.name} ✓</strong><small>{detectedCampus.city}{detectedCampus.state ? `, ${detectedCampus.state}` : ''} · confirmed after you verify this email</small></div>
                )}
                {!checkingSchool && schoolChecked && !detectedCampus && unsupportedMessage && <div className="authUnsupportedSchool"><span>NOT AVAILABLE</span><strong>{unsupportedMessage}</strong></div>}

                {detectedCampus && (
                  <button className="authFindNearby" type="button" onClick={findCampusesNearMe} disabled={locating}>
                    <span>◎</span><div><strong>{locating ? 'Finding nearby campuses…' : 'Find campuses near me'}</strong><small>Optional · your home campus never changes</small></div><b>→</b>
                  </button>
                )}
                {locationMessage && <p className="authLocationMessage">{locationMessage}</p>}
                {nearbyCampuses.length > 0 && (
                  <div className="authNearbyList">
                    {nearbyCampuses.slice(0, 3).map((campus) => (
                      <div key={campus.id}><span>● {campus.short_name}</span><b>{campus.distance_miles < 10 ? campus.distance_miles.toFixed(1) : Math.round(campus.distance_miles)} mi</b></div>
                    ))}
                  </div>
                )}
                {detectedCampus && visitingCampus && <div className="authNearbyCampus isVisiting">VISITING CONTEXT · Near {visitingCampus.short_name}. Your verified home campus remains {detectedCampus.short_name}.</div>}
              </div>
            )}

            <label><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" minLength={6} autoComplete={signup ? 'new-password' : 'current-password'} required /></label>
            {!signup && <div className="authUtilityRow"><span>Two-step verification runs automatically if enabled.</span><a href={recoveryHref}>Forgot password?</a></div>}

            <button className="button buttonGold authSubmit" type="submit" disabled={busy || (signup && checkingSchool)}>{busy ? (signup ? 'Creating account…' : 'Signing in…') : signup ? 'Create school account →' : 'Continue securely →'}</button>

            {pendingConfirmation && <div className="authEmailActions"><button type="button" onClick={resendConfirmation} disabled={resending}>{resending ? 'Sending…' : 'Resend confirmation'}</button><a href={recoveryHref}>I already had an account</a></div>}
            {message && <p className="authMessage" role="status">{message}</p>}
            <div className="authTrustRow" aria-label="Aspire trust features"><span>School email</span><span>Optional MFA</span><span>Report + block</span></div>
            <p className="authLegal">By continuing, you agree to Aspire 101&apos;s <a href="/terms">Terms</a>, <a href="/guidelines">Guidelines</a>, and <a href="/privacy">Privacy Policy</a>.</p>
          </form>
        )}
      </section>
    </main>
  );
}
