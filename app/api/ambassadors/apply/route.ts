import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '../../../../lib/server/aspireServer';

const allowedAvailability = new Set(['1–3 hrs/week', '3–5 hrs/week', '5–10 hrs/week', '10+ hrs/week']);
const allowedInterests = new Set(['Campus growth', 'Events', 'Content', 'Partnerships', 'Product feedback']);
const consumerEmailDomains = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'outlook.com', 'hotmail.com', 'live.com',
  'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'mail.com'
]);

type UniversityRow = {
  id: string;
  name: string;
  short_name: string;
  email_domains: string[] | null;
};

function clean(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function emailDomain(email: string) {
  return email.trim().toLowerCase().split('@')[1] || '';
}

function normalizeInstitution(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\b(the|university|college|campus|of|at|state)\b/g, ' ')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function levenshtein(a: string, b: string) {
  const rows = b.length + 1;
  const cols = a.length + 1;
  const matrix = Array.from({ length: rows }, (_, row) => Array(cols).fill(0));
  for (let col = 0; col < cols; col += 1) matrix[0][col] = col;
  for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = a[col - 1] === b[row - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

function schoolLooksLikeUniversity(school: string, university: UniversityRow) {
  const entered = normalizeInstitution(school);
  if (!entered || entered.length < 3) return false;
  const candidates = [university.name, university.short_name]
    .map(normalizeInstitution)
    .filter((value) => value.length >= 3);
  return candidates.some((candidate) => entered === candidate || entered.includes(candidate) || candidate.includes(entered));
}

function findDomainSignal(school: string, domain: string, universities: UniversityRow[]) {
  const exact = universities.find((university) => (university.email_domains || []).some((raw) => {
    const allowed = raw.trim().toLowerCase();
    return allowed && (domain === allowed || domain.endsWith(`.${allowed}`));
  }));
  if (exact) {
    return { status: 'matched' as const, universityId: exact.id, suggestion: null as string | null };
  }

  const schoolCandidates = universities.filter((university) => schoolLooksLikeUniversity(school, university));
  let best: { domain: string; distance: number } | null = null;
  schoolCandidates.forEach((university) => {
    (university.email_domains || []).forEach((raw) => {
      const allowed = raw.trim().toLowerCase();
      if (!allowed) return;
      const distance = levenshtein(domain, allowed);
      if (!best || distance < best.distance) best = { domain: allowed, distance };
    });
  });

  const maxDistance = domain.length >= 8 ? 2 : 1;
  const suggestion = best && best.distance <= maxDistance ? best.domain : null;
  return { status: 'unmatched' as const, universityId: null as string | null, suggestion };
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

    const domain = emailDomain(schoolEmail);
    if (consumerEmailDomains.has(domain)) {
      return NextResponse.json({
        error: 'Use your school-issued email address for the ambassador application.',
        code: 'SCHOOL_EMAIL_REQUIRED'
      }, { status: 422 });
    }

    const supabase = getSupabaseServiceClient();
    const { data: universityRows, error: universityError } = await supabase
      .from('universities')
      .select('id,name,short_name,email_domains')
      .eq('active', true);
    if (universityError) throw universityError;

    const domainSignal = findDomainSignal(school, domain, (universityRows || []) as UniversityRow[]);
    if (domainSignal.suggestion) {
      return NextResponse.json({
        error: `That school email domain looks like a typo. Did you mean @${domainSignal.suggestion}?`,
        code: 'SCHOOL_EMAIL_TYPO',
        suggestedDomain: domainSignal.suggestion
      }, { status: 422 });
    }

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
      school_email_domain: domain,
      school_email_status: domainSignal.status,
      school_email_suggestion: null,
      matched_university_id: domainSignal.universityId,
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

    return NextResponse.json({
      ok: true,
      emailStatus: domainSignal.status,
      emailNotice: domainSignal.status === 'unmatched'
        ? 'Your application was saved. This school email domain is not in Aspire’s campus directory yet, so we’ll verify it during review.'
        : null
    });
  } catch (error) {
    console.error('campus ambassador application error', error);
    return NextResponse.json({ error: 'Could not save your application right now.' }, { status: 500 });
  }
}
