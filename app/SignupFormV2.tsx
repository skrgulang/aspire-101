'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { findNearbyUniversities, NearbyUniversity, resolveUniversityByEmail, University } from '../lib/supabase/universities';
import { aspireLogo } from './logo';
import AppLoader from './AppLoader';

const peopleImage = 'https://images.pexels.com/photos/7973095/pexels-photo-7973095.jpeg?auto=compress&cs=tinysrgb&w=1000';
const imageFallback = 'https://images.pexels.com/photos/7683692/pexels-photo-7683692.jpeg?auto=compress&cs=tinysrgb&w=1200';
const interestOptions = ['Study','Gaming','Rides','Startups','Gym','Buy & Sell','Projects','Events','Housing','Photography','Food','Outdoors'];

function safeNextPath() {
  if (typeof window === 'undefined') return '/campus';
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/campus';
}

function emailDomain(value: string) {
  return value.trim().toLowerCase().split('@')[1] ?? '';
}

export default function SignupFormV2() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [major, setMajor] = useState('');
  const [graduationYear, setGraduationYear] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [nextPath, setNextPath] = useState('/campus');
  const [detectedCampus, setDetectedCampus] = useState<University | null>(null);
  const [checkingSchool, setCheckingSchool] = useState(false);
  const [schoolChecked, setSchoolChecked] = useState(false);
  const [nearbyCampuses, setNearbyCampuses] = useState<NearbyUniversity[]>([]);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [entering, setEntering] = useState(false);
  const [resending, setResending] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => setNextPath(safeNextPath()), []);

  useEffect(() => {
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
    return () => { active = false; window.clearTimeout(timer); };
  }, [email]);

  function toggleInterest(value: string) {
    setInterests((current) => {
      if (current.includes(value)) return current.filter((item) => item !== value);
      if (current.length >= 6) return current;
      return [...current, value];
    });
  }

  function enter(path: string) {
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
          setLocationMessage(campuses.length ? 'Nearby campus context found. This does not change your verified home campus.' : 'No supported campuses found nearby yet.');
        } catch (error) {
          setLocationMessage(error instanceof Error ? error.message : 'Could not find nearby campuses.');
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocationMessage('Location was not shared. That is completely fine — your school email still determines your home campus.');
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setPendingConfirmation(false);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const campus = await resolveUniversityByEmail(cleanEmail);
      if (!campus) {
        const domain = emailDomain(cleanEmail);
        if (!domain.endsWith('.edu')) throw new Error('Use your university .edu email to create an Aspire account.');
        throw new Error('Aspire is not open for this university email yet.');
      }
      const year = graduationYear.trim() ? Number(graduationYear) : null;
      if (year !== null && (!Number.isInteger(year) || year < 2020 || year > 2045)) throw new Error('Use a valid expected graduation year.');

      const supabase = getSupabaseBrowserClient();
      const nextQuery = `&next=${encodeURIComponent(nextPath)}`;
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            display_name: name.trim(),
            major: major.trim().slice(0,120),
            graduation_year: year,
            interests
          },
          emailRedirectTo: `${window.location.origin}/login?confirmed=1${nextQuery}`
        }
      });
      if (error) throw error;
      setDetectedCampus(campus);
      if (data.session) enter(nextPath);
      else {
        setPendingConfirmation(true);
        setMessage(`Check ${cleanEmail} to confirm your ${campus.short_name} account.`);
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
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: `${window.location.origin}/login?confirmed=1&next=${encodeURIComponent(nextPath)}` }
      });
      if (error) throw error;
      setMessage('Confirmation email sent. Check your inbox and spam folder.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not resend the confirmation email.');
    } finally {
      setResending(false);
    }
  }

  const domain = emailDomain(email);
  const unsupportedMessage = domain ? domain.endsWith('.edu') ? 'This .edu campus is not supported yet.' : 'Aspire accounts require a university .edu email.' : '';
  const nearbyPrimary = nearbyCampuses[0] ?? null;
  const visualCampusName = detectedCampus?.short_name ?? nearbyPrimary?.short_name ?? 'Your campus';
  const visualCampusImage = detectedCampus?.cover_image || nearbyPrimary?.cover_image || imageFallback;
  const switchHref = nextPath === '/campus' ? '/login' : `/login?next=${encodeURIComponent(nextPath)}`;

  if (entering) return <AppLoader label="Entering your circle…" detail="Opening Community Circle" />;

  return (
    <main className="authPage authSignup">
      <header className="authTopbar">
        <a className="authBrand" href="/" aria-label="Aspire 101 home"><img src={aspireLogo} alt="" /><span>Aspire 101</span></a>
        <a className="authBack" href="/">Back to home ↗</a>
      </header>

      <section className="authShell">
        <div className="authVisual">
          <div className="authVisualGlow" />
          <div className="authVisualHeadline"><p className="eyebrow">YOUR CAMPUS STARTS HERE</p><h1>Your school email.<br /><em>Your campus identity.</em></h1></div>
          <figure className="authCampusPhoto"><img src={visualCampusImage} alt={`${visualCampusName} campus`} onError={(event) => { if (event.currentTarget.src !== imageFallback) event.currentTarget.src = imageFallback; }} /><span className="authPhotoShade" /><figcaption>{visualCampusName}</figcaption></figure>
          <figure className="authPeoplePhoto"><img src={peopleImage} alt="College students together" onError={(event) => { if (event.currentTarget.src !== imageFallback) event.currentTarget.src = imageFallback; }} /><span className="authPhotoShade" /></figure>
          <div className="authSticker authStickerSchool">SAME CAMPUS.<br />REAL PEOPLE. ✓</div>
          <div className="authSticker authStickerAsk">MADE FOR<br />YOUR CAMPUS ↗</div>
          <div className="authDoodle" aria-hidden="true">major + interests help Aspire<br />recommend better campus tasks ↗</div>
          <div className="authRequestBits" aria-hidden="true"><span>Study group?</span><span>Hackathon team?</span><span>Ride Friday?</span></div>
        </div>

        <form className="authCard" onSubmit={submit}>
          <div className="authCardTop"><div><span>JOIN ASPIRE</span><h2>Build your campus profile.</h2></div><a href={switchHref}>Sign in ↗</a></div>

          <label><span>Name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your display name" maxLength={80} required /></label>
          <label><span>University email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@university.edu" autoComplete="email" required /></label>

          <div className={`authSchoolDetection ${detectedCampus ? 'isDetected' : schoolChecked ? 'isUnsupported' : ''}`} aria-live="polite">
            {checkingSchool && <span className="authDetecting"><i /> Checking school…</span>}
            {!checkingSchool && detectedCampus && <div className="authDetectedSchool"><span>HOME CAMPUS DETECTED</span><strong>{detectedCampus.name} ✓</strong><small>{detectedCampus.city}{detectedCampus.state ? `, ${detectedCampus.state}` : ''} · confirmed after you verify this email</small></div>}
            {!checkingSchool && schoolChecked && !detectedCampus && unsupportedMessage && <div className="authUnsupportedSchool"><span>NOT AVAILABLE</span><strong>{unsupportedMessage}</strong></div>}
            {detectedCampus && <button className="authFindNearby" type="button" onClick={findCampusesNearMe} disabled={locating}><span>◎</span><div><strong>{locating ? 'Finding nearby campuses…' : 'Use my location for nearby campuses'}</strong><small>Optional · Aspire asks only after you tap this</small></div><b>→</b></button>}
            {locationMessage && <p className="authLocationMessage">{locationMessage}</p>}
          </div>

          <div className="authStudentBasics">
            <label><span>Major / program</span><input value={major} onChange={(event) => setMajor(event.target.value)} placeholder="Computer Science" maxLength={120} /></label>
            <label><span>Class of</span><input inputMode="numeric" value={graduationYear} onChange={(event) => setGraduationYear(event.target.value.replace(/\D/g,'').slice(0,4))} placeholder="2028" /></label>
          </div>
          <p className="authStudentHint">These help Aspire recommend relevant posts and tasks. They are soft signals — they never limit what you can discover.</p>

          <div className="authStudentInterests">
            <span>Pick a few interests · optional</span>
            <div className="authStudentInterestGrid">{interestOptions.map((interest) => <button type="button" key={interest} className={interests.includes(interest) ? 'active' : ''} onClick={() => toggleInterest(interest)}>{interest}</button>)}</div>
          </div>

          <label><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" minLength={6} autoComplete="new-password" required /></label>
          <button className="button buttonGold authSubmit" type="submit" disabled={busy || checkingSchool}>{busy ? 'Creating account…' : 'Create school account →'}</button>
          {pendingConfirmation && <div className="authEmailActions"><button type="button" onClick={resendConfirmation} disabled={resending}>{resending ? 'Sending…' : 'Resend confirmation'}</button><a href={switchHref}>I already had an account</a></div>}
          {message && <p className="authMessage" role="status">{message}</p>}
          <div className="authTrustRow" aria-label="Aspire trust features"><span>School email</span><span>Student profile</span><span>Privacy controls</span></div>
          <p className="authLegal">By continuing, you agree to Aspire 101&apos;s <a href="/terms">Terms</a>, <a href="/guidelines">Guidelines</a>, and <a href="/privacy">Privacy Policy</a>.</p>
        </form>
      </section>
    </main>
  );
}
