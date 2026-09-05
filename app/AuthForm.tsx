'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { aspireLogo } from './logo';

type Mode = 'login' | 'signup';

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');

    try {
      const supabase = getSupabaseBrowserClient();

      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: name.trim(),
              school: school.trim()
            },
            emailRedirectTo: `${window.location.origin}/login?confirmed=1`
          }
        });
        if (error) throw error;

        if (data.session) {
          router.push('/');
          router.refresh();
        } else {
          setMessage('Check your email to confirm your account, then come back and log in.');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });
        if (error) throw error;
        router.push('/');
        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const signup = mode === 'signup';

  return (
    <main className="authPage">
      <a className="authBrand" href="/" aria-label="Aspire 101 home">
        <img src={aspireLogo} alt="" />
        <span>Aspire 101</span>
      </a>

      <section className="authShell">
        <div className="authStory">
          <p className="eyebrow">THE COLLEGE REQUEST NETWORK</p>
          <h1>{signup ? 'Join your campus.' : 'Welcome back.'}</h1>
          <p>{signup ? 'Post what you need, respond when you can help, and turn campus into people you know.' : 'Pick up where you left off and see what campus needs.'}</p>
          <div className="authMiniRequests" aria-hidden="true">
            <span>Need a ride to IND Friday?</span>
            <span>Math 55 study tonight?</span>
            <span>Can someone help move a desk?</span>
          </div>
        </div>

        <form className="authCard" onSubmit={submit}>
          <div className="authCardTop">
            <span>{signup ? 'CREATE ACCOUNT' : 'LOG IN'}</span>
            <a href={signup ? '/login' : '/signup'}>{signup ? 'Already joined?' : 'New here?'}</a>
          </div>

          {signup && (
            <>
              <label>
                <span>Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
              </label>
              <label>
                <span>School</span>
                <input value={school} onChange={(e) => setSchool(e.target.value)} placeholder="UC Berkeley, Purdue, Rutgers..." required />
              </label>
            </>
          )}

          <label>
            <span>School email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" autoComplete="email" required />
          </label>

          <label>
            <span>Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" minLength={6} autoComplete={signup ? 'new-password' : 'current-password'} required />
          </label>

          <button className="button buttonGold authSubmit" type="submit" disabled={busy}>
            {busy ? 'One second…' : signup ? 'Join Aspire →' : 'Log in →'}
          </button>

          {message && <p className="authMessage" role="status">{message}</p>}

          <p className="authLegal">By continuing, you agree to Aspire 101's Terms and Privacy Policy.</p>
        </form>
      </section>
    </main>
  );
}
