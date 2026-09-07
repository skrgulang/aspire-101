import { NextResponse } from 'next/server';
import { getAuthenticatedUser, getSupabaseServiceClient, requireEnv } from '../../../../lib/server/aspireServer';

export const runtime = 'nodejs';

const model = process.env.ASPIRE_AI_MODEL || 'gpt-5.6-terra';

type Row = { id: string; title: string; category: string; kind: string; created_at: string };
type AiPayload = { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; error?: { message?: string } };

function outputText(payload: AiPayload) {
  if (payload.output_text?.trim()) return payload.output_text;
  for (const item of payload.output ?? []) for (const content of item.content ?? []) if (content.type === 'output_text' && content.text?.trim()) return content.text;
  return '';
}

function bucket(row: Row) {
  const text = `${row.category} ${row.title}`.toLowerCase();
  if (row.kind === 'buy_sell' || /sell|buy|market|fridge|chair|desk|lamp|electronics/.test(text)) return 'Market';
  if (/ride|airport|transport|pickup|chicago|indy|sfo|ord|oak/.test(text)) return 'Rides';
  if (/study|class|tutor|math|exam|homework|course/.test(text)) return 'Study';
  if (/project|collab|hackathon|startup|code|design/.test(text)) return 'Projects';
  if (/gaming|valorant|fortnite|league|cs2|duo/.test(text)) return 'Gaming';
  return 'Community';
}

export async function POST(request: Request) {
  try {
    await getAuthenticatedUser(request);
    const body = await request.json().catch(() => ({})) as { campusId?: string };
    const campusId = String(body.campusId || '').trim();
    if (!campusId) return NextResponse.json({ error: 'Campus is required.' }, { status: 400 });

    const supabase = getSupabaseServiceClient();
    const { data: campus } = await supabase.from('universities').select('id,name,short_name').eq('id', campusId).eq('active', true).maybeSingle();
    if (!campus) return NextResponse.json({ error: 'Campus is not available.' }, { status: 404 });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('requests')
      .select('id,title,category,kind,created_at')
      .eq('campus_id', campusId)
      .eq('moderation_status', 'approved')
      .eq('status', 'open')
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    const rows = (data ?? []) as Row[];

    const now = Date.now();
    const counts = new Map<string, { total: number; recent: number; previous: number }>();
    for (const row of rows) {
      const label = bucket(row);
      const current = counts.get(label) ?? { total: 0, recent: 0, previous: 0 };
      current.total += 1;
      const age = now - new Date(row.created_at).getTime();
      if (age <= 24 * 60 * 60 * 1000) current.recent += 1;
      else if (age <= 48 * 60 * 60 * 1000) current.previous += 1;
      counts.set(label, current);
    }

    const aggregates = [...counts.entries()].map(([label, value]) => ({
      label,
      count: value.total,
      last_24h: value.recent,
      previous_24h: value.previous,
      trend: value.recent > value.previous ? 'up' : value.recent < value.previous ? 'down' : 'steady'
    })).sort((a, b) => b.count - a.count);

    if (!rows.length) {
      return NextResponse.json({
        ok: true,
        campus: { id: campus.id, name: campus.name, shortName: campus.short_name },
        pulse: { headline: `${campus.short_name} is quiet right now.`, summary: 'There are no approved open requests from the last seven days yet. Starting one gives the campus something to respond to.', signals: [], watch_for: 'New activity will appear here as the campus network grows.' },
        generatedAt: new Date().toISOString()
      });
    }

    const apiKey = requireEnv('OPENAI_API_KEY');
    const schema = {
      type: 'object', additionalProperties: false,
      required: ['headline','summary','signals','watch_for'],
      properties: {
        headline: { type: 'string', maxLength: 120 },
        summary: { type: 'string', maxLength: 360 },
        signals: { type: 'array', maxItems: 4, items: { type: 'object', additionalProperties: false, required: ['label','count','trend','note'], properties: { label: { type: 'string', maxLength: 40 }, count: { type: 'integer', minimum: 0 }, trend: { type: 'string', enum: ['up','down','steady','new'] }, note: { type: 'string', maxLength: 120 } } } },
        watch_for: { type: 'string', maxLength: 180 }
      }
    };
    const latestTitles = rows.slice(0, 10).map((row) => ({ title: row.title.slice(0, 120), category: row.category, kind: row.kind, age_hours: Math.round((now - new Date(row.created_at).getTime()) / 3600000) }));

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 650,
        instructions: `You write Aspire Campus Pulse for verified college students. Summarize only the supplied aggregate/open-request data. Never invent counts, events, precise locations, identities, or claims about the whole student body. Keep it energetic, useful, and concise. Trends refer only to Aspire activity, not campus-wide reality.`,
        input: `CAMPUS: ${campus.name}\nAGGREGATES: ${JSON.stringify(aggregates)}\nLATEST APPROVED OPEN REQUEST TITLES: ${JSON.stringify(latestTitles)}`,
        text: { format: { type: 'json_schema', name: 'aspire_campus_pulse', strict: true, schema } }
      }),
      cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({})) as AiPayload;
    if (!response.ok) return NextResponse.json({ error: payload.error?.message || 'Campus Pulse could not run.' }, { status: 502 });
    const text = outputText(payload);
    if (!text) return NextResponse.json({ error: 'Campus Pulse returned no summary.' }, { status: 502 });
    const pulse = JSON.parse(text);

    return NextResponse.json({ ok: true, campus: { id: campus.id, name: campus.name, shortName: campus.short_name }, pulse, aggregates, generatedAt: new Date().toISOString() });
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'UNKNOWN';
    if (raw === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Sign in again to use Campus Pulse.' }, { status: 401 });
    if (raw.startsWith('MISSING_ENV:OPENAI_API_KEY')) return NextResponse.json({ error: 'Campus Pulse is not connected to AI on this deployment yet.', code: 'AI_NOT_CONFIGURED' }, { status: 503 });
    return NextResponse.json({ error: 'Campus Pulse could not finish.' }, { status: 500 });
  }
}
