import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '../../../lib/server/aspireServer';

const allowedInterests = new Set(['desktop', 'mobile', 'campus-launches', 'product-updates']);

function clientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip') || 'unknown';
}

function ipHash(ip: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'aspire-updates';
  return createHmac('sha256', secret).update(ip).digest('hex');
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body?.email || '').trim().toLowerCase();
    const school = String(body?.school || '').trim();
    const honeypot = String(body?.website || '').trim();
    const startedAt = Number(body?.startedAt || 0);
    const interests = Array.isArray(body?.interests)
      ? body.interests.map((item: unknown) => String(item)).filter((item: string) => allowedInterests.has(item))
      : [];

    // Silently accept honeypot submissions so simple bots do not learn the trap.
    if (honeypot) return NextResponse.json({ ok: true });

    if (!validEmail(email) || email.length > 254) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    if (!school || school.length > 140) {
      return NextResponse.json({ error: 'Tell us your school.' }, { status: 400 });
    }
    if (startedAt && Date.now() - startedAt < 900) {
      return NextResponse.json({ error: 'Please try again.' }, { status: 429 });
    }

    const supabase = getSupabaseServiceClient();
    const hash = ipHash(clientIp(request));
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count, error: countError } = await supabase
      .from('product_update_waitlist')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', hash)
      .gte('created_at', oneHourAgo);

    if (countError) throw countError;
    if ((count || 0) >= 8) {
      return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
    }

    const { data: existing, error: existingError } = await supabase
      .from('product_update_waitlist')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingError) throw existingError;

    const payload = {
      email,
      school,
      interests: interests.length ? interests : ['product-updates'],
      source: 'updates_page',
      ip_hash: hash,
      user_agent: (request.headers.get('user-agent') || '').slice(0, 500),
      updated_at: new Date().toISOString()
    };

    const query = existing
      ? supabase.from('product_update_waitlist').update(payload).eq('id', existing.id)
      : supabase.from('product_update_waitlist').insert(payload);

    const { error } = await query;
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('updates waitlist error', error);
    return NextResponse.json({ error: 'Could not save your signup right now.' }, { status: 500 });
  }
}
