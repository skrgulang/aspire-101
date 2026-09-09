'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthForm from '../AuthForm';

export default function SignupPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!params.get('next')) {
      const next = new URLSearchParams(params.toString());
      next.set('next', '/post');
      router.replace(`/signup?${next.toString()}`);
      return;
    }
    setReady(true);
  }, [params, router]);

  if (!ready) return null;
  return <AuthForm mode="signup" />;
}
