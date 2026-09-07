import { NextResponse } from 'next/server';
import { getAuthenticatedUser, getSupabaseServiceClient, requireEnv } from '../../../../lib/server/aspireServer';

export const runtime = 'nodejs';
const model = process.env.ASPIRE_AI_MODEL || 'gpt-5.6-terra';

type AiPayload = { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; error?: { message?: string } };
function outputText(payload: AiPayload) {
  if (payload.output_text?.trim()) return payload.output_text;
  for (const item of payload.output ?? []) for (const content of item.content ?? []) if (content.type === 'output_text' && content.text?.trim()) return content.text;
  return '';
}

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const body = await request.json().catch(() => ({})) as { connectionId?: string };
    const connectionId = String(body.connectionId || '').trim();
    if (!connectionId) return NextResponse.json({ error: 'Choose a connection first.' }, { status: 400 });

    const supabase = getSupabaseServiceClient();
    const { data: connection, error: connectionError } = await supabase
      .from('connections')
      .select('id,request_id,requester_id,responder_id,status,agreed_amount_cents,payment_method,agreed_terms')
      .eq('id', connectionId)
      .maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection) return NextResponse.json({ error: 'Connection not found.' }, { status: 404 });
    if (connection.requester_id !== user.id && connection.responder_id !== user.id) return NextResponse.json({ error: 'You cannot use Copilot for this connection.' }, { status: 403 });

    const [{ data: requestRow }, { data: messageRows }] = await Promise.all([
      supabase.from('requests').select('title,details,category,kind,amount_cents,market_intent,fulfillment_method').eq('id', connection.request_id).maybeSingle(),
      supabase.from('connection_messages').select('sender_id,body,created_at').eq('connection_id', connectionId).order('created_at', { ascending: false }).limit(40)
    ]);
    const messages = (messageRows ?? []).slice().reverse().map((message) => ({
      speaker: message.sender_id === user.id ? 'you' : 'other student',
      body: String(message.body || '').slice(0, 1800),
      created_at: message.created_at
    }));

    const apiKey = requireEnv('OPENAI_API_KEY');
    const schema = {
      type: 'object', additionalProperties: false,
      required: ['summary','plan_status','proposed_time','proposed_place','proposed_amount_cents','open_questions','suggested_reply','safety_note'],
      properties: {
        summary: { type: 'string', maxLength: 360 },
        plan_status: { type: 'string', enum: ['clear','almost_ready','needs_coordination'] },
        proposed_time: { type: ['string','null'], maxLength: 120 },
        proposed_place: { type: ['string','null'], maxLength: 160 },
        proposed_amount_cents: { type: ['integer','null'], minimum: 0, maximum: 10000000 },
        open_questions: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 160 } },
        suggested_reply: { type: 'string', maxLength: 420 },
        safety_note: { type: 'string', maxLength: 220 }
      }
    };

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 850,
        instructions: `You are Aspire Connection Copilot. Help two already-connected college students turn their conversation into a clear plan. Use only the supplied request, connection terms, and messages. Never invent a time, place, amount, promise, identity, or completed action. If something is not agreed, leave it null and list it as an open question. Do not repeat exact private street addresses in your summary; say "agreed pickup location" unless the location is clearly a public campus place. Suggested replies must be optional and natural. Never send anything or claim anything was sent. If money is involved, distinguish an agreed amount from an unconfirmed proposal.`,
        input: JSON.stringify({ request: requestRow, connection: { status: connection.status, agreed_amount_cents: connection.agreed_amount_cents, payment_method: connection.payment_method, agreed_terms: connection.agreed_terms }, messages }),
        text: { format: { type: 'json_schema', name: 'aspire_connection_copilot', strict: true, schema } }
      }),
      cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({})) as AiPayload;
    if (!response.ok) return NextResponse.json({ error: payload.error?.message || 'Connection Copilot could not run.' }, { status: 502 });
    const text = outputText(payload);
    if (!text) return NextResponse.json({ error: 'Connection Copilot returned no plan.' }, { status: 502 });
    return NextResponse.json({ ok: true, copilot: JSON.parse(text) });
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'UNKNOWN';
    if (raw === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Sign in again to use Connection Copilot.' }, { status: 401 });
    if (raw.startsWith('MISSING_ENV:OPENAI_API_KEY')) return NextResponse.json({ error: 'Connection Copilot is not connected to AI on this deployment yet.', code: 'AI_NOT_CONFIGURED' }, { status: 503 });
    return NextResponse.json({ error: 'Connection Copilot could not finish.' }, { status: 500 });
  }
}
