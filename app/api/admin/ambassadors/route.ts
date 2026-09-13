import { NextResponse } from 'next/server';
import { getAuthenticatedUser, getSupabaseServiceClient } from '../../../../lib/server/aspireServer';
import { ambassadorEmailConfigured, sendAmbassadorEmail, type AmbassadorEmailType } from '../../../../lib/server/ambassadorEmail';

export const runtime = 'nodejs';

const allowedStatuses = new Set(['new', 'reviewing', 'interview', 'accepted', 'declined']);
const allowedEmailTypes = new Set<AmbassadorEmailType>(['interview_invite', 'accepted', 'declined', 'follow_up']);
const applicationSelect = 'id,full_name,school,school_email,school_email_domain,school_email_status,school_email_suggestion,matched_university_id,major_year,why_aspire,campus_involvement,social_links,availability,interested_in,status,internal_notes,reviewed_by,reviewed_at,created_at,updated_at';
const emailEventSelect = 'id,application_id,email_type,recipient,status,provider,provider_message_id,error_message,created_by,created_at,sent_at';

async function requireAdmin(request: Request) {
  const { user } = await getAuthenticatedUser(request);
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (data?.role !== 'admin') throw new Error('ADMIN_REQUIRED');
  return { user, supabase };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  if (message === 'ADMIN_REQUIRED') return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  console.error('ambassador admin error', error);
  return NextResponse.json({ error: 'Could not load ambassador applications.' }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const { supabase } = await requireAdmin(request);
    const [{ data: applications, error: applicationError }, { data: emailEvents, error: emailError }] = await Promise.all([
      supabase
        .from('campus_ambassador_applications')
        .select(applicationSelect)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('ambassador_email_events')
        .select(emailEventSelect)
        .order('created_at', { ascending: false })
        .limit(1000)
    ]);
    if (applicationError) throw applicationError;
    if (emailError) throw emailError;
    return NextResponse.json({
      applications: applications ?? [],
      emailEvents: emailEvents ?? [],
      emailConfigured: ambassadorEmailConfigured(),
      replyToConfigured: Boolean(process.env.AMBASSADOR_REPLY_TO_EMAIL || process.env.AMBASSADOR_ADMIN_EMAIL)
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, supabase } = await requireAdmin(request);
    const body = await request.json().catch(() => ({})) as {
      id?: string;
      status?: string;
      internalNotes?: string | null;
    };
    const id = String(body.id || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Valid application id required.' }, { status: 400 });

    const update: Record<string, unknown> = {
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (body.status !== undefined) {
      const status = String(body.status).trim();
      if (!allowedStatuses.has(status)) return NextResponse.json({ error: 'Invalid application status.' }, { status: 400 });
      update.status = status;
    }
    if (body.internalNotes !== undefined) {
      const notes = body.internalNotes === null ? '' : String(body.internalNotes);
      if (notes.length > 10000) return NextResponse.json({ error: 'Internal notes are too long.' }, { status: 400 });
      update.internal_notes = notes.trim() || null;
    }
    if (body.status === undefined && body.internalNotes === undefined) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('campus_ambassador_applications')
      .update(update)
      .eq('id', id)
      .select(applicationSelect)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    return NextResponse.json({ application: data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireAdmin(request);
    const body = await request.json().catch(() => ({})) as { id?: string; emailType?: string };
    const id = String(body.id || '').trim();
    const emailType = String(body.emailType || '').trim() as AmbassadorEmailType;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Valid application id required.' }, { status: 400 });
    if (!allowedEmailTypes.has(emailType)) return NextResponse.json({ error: 'Invalid email template.' }, { status: 400 });

    const { data: application, error } = await supabase
      .from('campus_ambassador_applications')
      .select(applicationSelect)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!application) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });

    const requiredStatus: Partial<Record<AmbassadorEmailType, string>> = {
      interview_invite: 'interview',
      accepted: 'accepted',
      declined: 'declined'
    };
    if (requiredStatus[emailType] && application.status !== requiredStatus[emailType]) {
      return NextResponse.json({ error: `Move this applicant to ${requiredStatus[emailType]} before sending that email.` }, { status: 409 });
    }

    const result = await sendAmbassadorEmail({
      supabase,
      application,
      type: emailType,
      createdBy: user.id
    });
    if (!result.ok) {
      const status = 'skipped' in result && result.skipped ? 503 : 502;
      return NextResponse.json({ error: result.reason || 'Email could not be sent.', event: result.event ?? null }, { status });
    }

    return NextResponse.json({ ok: true, event: result.event ?? null, alreadySent: 'alreadySent' in result ? result.alreadySent : false });
  } catch (error) {
    return errorResponse(error);
  }
}
