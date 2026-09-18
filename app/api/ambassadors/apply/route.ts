import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseServiceClient, requireEnv } from '../../../../lib/server/aspireServer';
import { sendAmbassadorEmail } from '../../../../lib/server/ambassadorEmail';

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

type DomainSignal = {
  status: 'matched' | 'unmatched';
  universityId: string | null;
  suggestion: string | null;
  issue: 'typo' | 'mismatch' | null;
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

function damerauLevenshtein(a: string, b: string) {
  const rows = b.length + 1;
  const cols = a.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
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
      if (
        row > 1 && col > 1 &&
        a[col - 1] === b[row - 2] &&
        a[col - 2] === b[row - 1]
      ) {
        matrix[row][col] = Math.min(matrix[row][col], matrix[row - 2][col - 2] + 1);
      }
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

function primaryDomain(university: UniversityRow) {
  return (university.email_domains || []).map((value) => value.trim().toLowerCase()).find(Boolean) || null;
}

function domainTld(domain: string) {
  const parts = domain.toLowerCase().split('.').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

function closestDomain(domain: string, universities: UniversityRow[], maxDistance: number) {
  const enteredTld = domainTld(domain);
  let bestDistance = Number.POSITIVE_INFINITY;
  const best = new Set<string>();

  for (const university of universities) {
    for (const raw of university.email_domains || []) {
      const allowed = raw.trim().toLowerCase();
      if (!allowed || domainTld(allowed) !== enteredTld) continue;
      const distance = damerauLevenshtein(domain, allowed);
      if (distance < bestDistance) {
        bestDistance = distance;
        best.clear();
        best.add(allowed);
      } else if (distance === bestDistance) {
        best.add(allowed);
      }
    }
  }

  return bestDistance <= maxDistance && best.size === 1 ? [...best][0] : null;
}

function findDomainSignal(school: string, domain: string, universities: UniversityRow[]): DomainSignal {
  const schoolCandidates = universities.filter((university) => schoolLooksLikeUniversity(school, university));
  const exact = universities.find((university) => (university.email_domains || []).some((raw) => {
    const allowed = raw.trim().toLowerCase();
    return allowed && (domain === allowed || domain.endsWith(`.${allowed}`));
  }));

  if (exact) {
    const schoolPointsSomewhereElse = schoolCandidates.length > 0 && !schoolCandidates.some((candidate) => candidate.id === exact.id);
    if (schoolPointsSomewhereElse) {
      return {
        status: 'unmatched',
        universityId: null,
        suggestion: primaryDomain(schoolCandidates[0]),
        issue: 'mismatch'
      };
    }
    return { status: 'matched', universityId: exact.id, suggestion: null, issue: null };
  }

  const schoolSuggestion = schoolCandidates.length
    ? closestDomain(domain, schoolCandidates, domain.length >= 8 ? 2 : 1)
    : null;
  if (schoolSuggestion) {
    return { status: 'unmatched', universityId: null, suggestion: schoolSuggestion, issue: 'typo' };
  }

  // Catch high-confidence transposition / one-character mistakes even when the applicant
  // entered an abbreviated or vague school name (for example prudue.edu → purdue.edu).
  const globalSuggestion = closestDomain(domain, universities, 1);
  return {
    status: 'unmatched',
    universityId: null,
    suggestion: globalSuggestion,
    issue: globalSuggestion ? 'typo' : null
  };
}

function clientIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

function ipHash(ip: string) {
  const secret = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
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
    if (domainSignal.issue === 'typo' && domainSignal.suggestion) {
      return NextResponse.json({
        error: `That school email domain looks like a typo. Did you mean @${domainSignal.suggestion}?`,
        code: 'SCHOOL_EMAIL_TYPO',
        suggestedDomain: domainSignal.suggestion
      }, { status: 422 });
    }
    if (domainSignal.issue === 'mismatch' && domainSignal.suggestion) {
      return NextResponse.json({
        error: `That email domain does not appear to match the school you entered. ${school} usually uses @${domainSignal.suggestion}.`,
        code: 'SCHOOL_EMAIL_MISMATCH',
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
      .eq('school_email', schoolEmail)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;

    // This endpoint is public, so possession of an email address is not proof of
    // ownership. Never let a duplicate unauthenticated submission overwrite an
    // existing application. Return a generic success instead.
    if (existing) {
      return NextResponse.json({
        ok: true,
        emailStatus: domainSignal.status,
        confirmationEmail: 'not_sent',
        emailNotice: domainSignal.status === 'unmatched'
          ? 'Your application was saved. This school email domain is not in Aspire’s campus directory yet, so we’ll verify it during review.'
          : null
      });
    }

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

    const savedFields = 'id,full_name,school,school_email,major_year,why_aspire,campus_involvement,availability,interested_in,status';
    const { data: savedApplication, error } = await supabase
      .from('campus_ambassador_applications')
      .insert(payload)
      .select(savedFields)
      .single();
    if (error) throw error;
    if (!savedApplication) throw new Error('Application could not be loaded after saving.');

    const [confirmationDelivery] = await Promise.allSettled([
      sendAmbassadorEmail({ supabase, application: savedApplication, type: 'application_received' }),
      sendAmbassadorEmail({ supabase, application: savedApplication, type: 'admin_new_application' })
    ]);
    const confirmationResult = confirmationDelivery.status === 'fulfilled' ? confirmationDelivery.value : null;
    const confirmationEmail = confirmationResult?.ok
      ? 'sent'
      : confirmationResult && 'skipped' in confirmationResult && confirmationResult.skipped
        ? 'not_configured'
        : 'failed';

    return NextResponse.json({
      ok: true,
      emailStatus: domainSignal.status,
      confirmationEmail,
      emailNotice: domainSignal.status === 'unmatched'
        ? 'Your application was saved. This school email domain is not in Aspire’s campus directory yet, so we’ll verify it during review.'
        : null
    });
  } catch (error) {
    console.error('campus ambassador application error', error);
    return NextResponse.json({ error: 'Could not save your application right now.' }, { status: 500 });
  }
}
