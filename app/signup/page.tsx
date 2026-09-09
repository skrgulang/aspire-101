'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthForm from '../AuthForm';

export default function SignupPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get('next')) {
      params.set('next', '/post');
      router.replace(`/signup?${params.toString()}`);
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) return null;
  return <AuthForm mode="signup" />;
}
