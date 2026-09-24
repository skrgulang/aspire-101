import { NextResponse } from 'next/server';
import { REQUEST_PUBLIC_SELECT } from '../../../../lib/supabase/requestProjection';
import { getSupabaseServiceClient } from '../../../../lib/server/aspireServer';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    const campusId = new URL(request.url).searchParams.get('campusId')?.trim() || '';
    if (!UUID_PATTERN.test(campusId)) {
      return NextResponse.json({ error: 'Choose a valid campus.' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { data: campus, error: campusError } = await supabase
      .from('universities')
      .select('id')
      .eq('id', campusId)
      .eq('active', true)
      .maybeSingle();

    if (campusError) throw campusError;
    if (!campus) {
      return NextResponse.json({ error: 'This campus is not available.' }, { status: 404 });
    }

    // Keep the anonymous catalog deliberately narrower than signed-in discovery:
    // only approved, open, protected-checkout sale listings and public fields.
    const { data, error } = await supabase
      .from('requests')
      .select(REQUEST_PUBLIC_SELECT)
      .eq('campus_id', campusId)
      .eq('status', 'open')
      .eq('moderation_status', 'approved')
      .eq('kind', 'buy_sell')
      .eq('market_intent', 'sell')
      .eq('payment_method', 'aspire')
      .order('created_at', { ascending: false })
      .limit(80);

    if (error) throw error;

    return NextResponse.json(
      { items: data || [] },
      { headers: { 'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=120' } }
    );
  } catch (error) {
    console.error('public marketplace catalog error', error);
    return NextResponse.json({ error: 'Could not load the market.' }, { status: 500 });
  }
}
