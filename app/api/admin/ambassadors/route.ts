import { NextResponse } from 'next/server';
import { getAuthenticatedUser, getSupabaseServiceClient } from '../../../../lib/server/aspireServer';

export const runtime = 'nodejs';

const allowedStatuses = new Set(['new', 'reviewing', 'interview', 'accepted', 'declined']);
const applicationSelect = 'id,full_name,school,school_email,school_email_domain,school_email_status,school_email_suggestion,matched_university_id,major_year,why_aspire,campus_involvement,social_links,availability,interested_in,status,internal_notes,reviewed_by,reviewed_at,created_at,updated_at';

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
    const { data, error } = await supabase
      .from('campus_ambassador_applications')
      .select(applicationSelect)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    return NextResponse.json({ applications: data ?? [] });
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
