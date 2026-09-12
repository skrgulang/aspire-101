import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '../../../../lib/server/aspireServer';

const allowedAvailability = new Set(['1–3 hrs/week', '3–5 hrs/week', '5–10 hrs/week', '10+ hrs/week']);
const allowedInterests = new Set(['Campus growth', 'Events', 'Content', 'Partnerships', 'Product feedback']);

function clean(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function clientIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

function ipHash(ip: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'aspire-ambassadors';
  return createHmac('sha256', secret).update(ip).digest('hex');
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const fullName = clean(body?.fullName, 120);
    const school = clean(body?.school, 160);
    const schoolEmail = clean(body?.schoolEmail, 254).toLowerCase();
    const majorYear = clean(body?.majorYear, 160);
    const whyAspire = clean(body?.whyAspire, 3000);
    const campusInvolvement = clean(body?.campusInvolvement, 2000);
    const socialLinks = clean(body?.socialLinks, 1000);
    const availabilityRaw = clean(body?.availability, 40);
    const availability = allowedAvailability.has(availabilityRaw) ? availabilityRaw : null;
    const interests = Array.isArray(body?.interests)
      ? body.interests.map((item: unknown) => String(item)).filter((item: string) => allowedInterests.has(item)).slice(0, 5)
      : [];
    const honeypot = clean(body?.website, 120);
    const startedAt = Number(body?.startedAt || 0);

    if (honeypot) return NextResponse.json({ ok: true });
    if (!fullName) return NextResponse.json({ error: 'Enter your name.' }, { status: 400 });
    if (!school) return NextResponse.json({ error: 'Enter your school.' }, { status: 400 });
    if (!validEmail(schoolEmail)) return NextResponse.json({ error: 'Enter a valid school email.' }, { status: 400 });
    if (whyAspire.length < 10) return NextResponse.json({ error: 'Tell us a little more about why you want to join.' }, { status: 400 });
    if (startedAt && Date.now() - startedAt < 1200) return NextResponse.json({ error: 'Please try again.' }, { status: 429 });

    const supabase = getSupabaseServiceClient();
    const hash = ipHash(clientIp(request));
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase
      .from('campus_ambassador_applications')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', hash)
      .gte('created_at', oneHourAgo);
    if (countError) throw countError;
    if ((count || 0) >= 5) return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });

    const { data: existing, error: existingError } = await supabase
      .from('campus_ambassador_applications')
      .select('id')
      .ilike('school_email', schoolEmail)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;

    const payload = {
      full_name: fullName,
      school,
      school_email: schoolEmail,
      major_year: majorYear || null,
      why_aspire: whyAspire,
      campus_involvement: campusInvolvement || null,
      social_links: socialLinks || null,
      availability,
      interested_in: interests,
      status: 'new',
      source: 'ambassadors_page',
      ip_hash: hash,
      user_agent: clean(request.headers.get('user-agent'), 500),
      updated_at: new Date().toISOString()
    };

    const query = existing
      ? supabase.from('campus_ambassador_applications').update(payload).eq('id', existing.id)
      : supabase.from('campus_ambassador_applications').insert(payload);
    const { error } = await query;
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('campus ambassador application error', error);
    return NextResponse.json({ error: 'Could not save your application right now.' }, { status: 500 });
  }
}
