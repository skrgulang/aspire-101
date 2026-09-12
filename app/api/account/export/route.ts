import { NextResponse } from 'next/server';
import { buildAccountExport } from '../../../../lib/server/accountData';
import { apiError, getAuthenticatedUser, getSupabaseServiceClient } from '../../../../lib/server/aspireServer';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const supabase = getSupabaseServiceClient();
    const payload = await buildAccountExport(supabase, user);
    const filename = `aspire-101-data-${new Date().toISOString().slice(0, 10)}.json`;

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'UNKNOWN';
    if (raw.startsWith('ACCOUNT_DATA:')) {
      return NextResponse.json({ error: 'Could not prepare your data export. Try again in a moment.' }, { status: 500 });
    }
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
