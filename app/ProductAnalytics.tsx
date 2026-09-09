'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { recordProductEvent, type AnalyticsSurface } from '../lib/supabase/productAnalytics';

function surfaceFor(pathname: string): { surface: AnalyticsSurface; target: string } {
  if (pathname === '/') return { surface: 'home', target: 'home' };
  if (pathname.startsWith('/signup')) return { surface: 'auth', target: 'signup' };
  if (pathname.startsWith('/login') || pathname.startsWith('/forgot-password') || pathname.startsWith('/reset-password')) return { surface: 'auth', target: 'login' };
  if (pathname.startsWith('/discover')) return { surface: 'discover', target: 'discover' };
  if (pathname.startsWith('/post')) return { surface: 'post', target: 'post' };
  if (pathname.startsWith('/connections')) return { surface: 'inbox', target: 'inbox' };
  if (pathname.startsWith('/profile')) return { surface: 'profile', target: 'profile' };
  if (pathname.startsWith('/pay') || pathname.startsWith('/payments')) return { surface: 'payments', target: 'payments' };
  return { surface: 'other', target: 'other' };
}

function safeClickTarget(element: Element) {
  const explicit = element.getAttribute('data-analytics');
  if (explicit && /^[a-z0-9_:-]{1,64}$/.test(explicit)) return explicit;
  if (element instanceof HTMLAnchorElement) {
    try {
      const path = new URL(element.href, window.location.origin).pathname;
      if (path.startsWith('/signup')) return 'nav_signup';
      if (path.startsWith('/login')) return 'nav_login';
      if (path.startsWith('/post')) return 'nav_post';
      if (path.startsWith('/discover')) return 'nav_discover';
      if (path.startsWith('/connections')) return 'nav_inbox';
      if (path.startsWith('/profile')) return 'nav_profile';
      if (path.startsWith('/pay') || path.startsWith('/payments')) return 'nav_payments';
    } catch { return null; }
  }
  const text = (element.textContent || '').trim().toLowerCase();
  if (text.includes("i'm interested") || text.includes('im interested')) return 'request_interest';
  if (text.includes('create account') || text === 'sign up' || text === 'signup') return 'signup_cta';
  if (text.includes('confirm connection')) return 'confirm_connection';
  if (text === 'choose' || text.startsWith('choose ')) return 'choose_response';
  if (text.includes('review + submit') || text.includes('post request')) return 'post_submit';
  return null;
}

export default function ProductAnalytics() {
  const pathname = usePathname();
  useEffect(() => {
    const page = surfaceFor(pathname || '/');
    void recordProductEvent('page_view', page.surface, page.target);
    if (pathname?.startsWith('/login')) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('confirmed') === '1') void recordProductEvent('signup_success', 'auth', 'email_confirmed');
    }
  }, [pathname]);
  useEffect(() => {
    function onClick(event: MouseEvent) {
      const origin = event.target instanceof Element ? event.target.closest('a,button') : null;
      if (!origin) return;
      const target = safeClickTarget(origin);
      if (!target) return;
      const page = surfaceFor(window.location.pathname);
      void recordProductEvent('cta_click', page.surface, target);
      if (target === 'signup_cta' && page.surface === 'auth') void recordProductEvent('signup_submit', 'auth', 'signup');
    }
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);
  return null;
}
