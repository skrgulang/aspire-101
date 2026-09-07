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

async function requireReviewer(request: Request) {
  const auth = await getAuthenticatedUser(request);
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', auth.user.id).maybeSingle();
  if (data?.role !== 'admin' && data?.role !== 'moderator') throw new Error('REVIEWER_REQUIRED');
  return { ...auth, supabase };
}

export async function GET(request: Request) {
  try {
    const { supabase } = await requireReviewer(request);
    const { data: disputes, error } = await supabase
      .from('market_disputes')
      .select('id,market_order_id,reason,details,status,created_at,updated_at')
      .in('status', ['open','under_review'])
      .order('created_at', { ascending: true })
      .limit(50);
    if (error) throw error;
    const orderIds = [...new Set((disputes ?? []).map((item) => item.market_order_id))];
    let orders: Array<Record<string, any>> = [];
    let requests: Array<Record<string, any>> = [];
    if (orderIds.length) {
      const { data } = await supabase.from('market_orders').select('id,request_id,agreed_amount_cents,currency,status,listing_intent,created_at').in('id', orderIds);
      orders = data ?? [];
      const requestIds = [...new Set(orders.map((item) => item.request_id))];
      if (requestIds.length) {
        const { data: requestRows } = await supabase.from('requests').select('id,title,category,market_intent').in('id', requestIds);
        requests = requestRows ?? [];
      }
    }
    const orderMap = new Map(orders.map((item) => [item.id, item]));
    const requestMap = new Map(requests.map((item) => [item.id, item]));
    const queue = (disputes ?? []).map((dispute) => {
      const order = orderMap.get(dispute.market_order_id);
      const requestRow = order ? requestMap.get(order.request_id) : null;
      return {
        id: dispute.id,
        reason: dispute.reason,
        details: dispute.details,
        status: dispute.status,
        created_at: dispute.created_at,
        order_status: order?.status || null,
        amount_cents: order?.agreed_amount_cents || null,
        currency: order?.currency || 'USD',
        title: requestRow?.title || 'Marketplace order'
      };
    });
    return NextResponse.json({ ok: true, disputes: queue });
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'UNKNOWN';
    if (raw === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });
    if (raw === 'REVIEWER_REQUIRED') return NextResponse.json({ error: 'Moderator access is required.' }, { status: 403 });
    return NextResponse.json({ error: 'Could not load dispute queue.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireReviewer(request);
    const body = await request.json().catch(() => ({})) as { disputeId?: string };
    const disputeId = String(body.disputeId || '').trim();
    if (!disputeId) return NextResponse.json({ error: 'Choose a dispute first.' }, { status: 400 });

    const { data: dispute } = await supabase.from('market_disputes').select('*').eq('id', disputeId).maybeSingle();
    if (!dispute) return NextResponse.json({ error: 'Dispute not found.' }, { status: 404 });
    const { data: order } = await supabase.from('market_orders').select('*').eq('id', dispute.market_order_id).maybeSingle();
    if (!order) return NextResponse.json({ error: 'Marketplace order not found.' }, { status: 404 });

    const [{ data: requestRow }, { data: events }, { data: messages }, { data: payment }] = await Promise.all([
      supabase.from('requests').select('id,title,details,category,kind,amount_cents,market_intent,item_condition,price_negotiable,fulfillment_method,created_at').eq('id', order.request_id).maybeSingle(),
      supabase.from('market_order_events').select('event_type,payload,created_at,actor_id').eq('market_order_id', order.id).order('created_at', { ascending: true }).limit(80),
      supabase.from('connection_messages').select('sender_id,body,created_at').eq('connection_id', order.connection_id).order('created_at', { ascending: true }).limit(80),
      order.payment_id ? supabase.from('connection_payments').select('*').eq('id', order.payment_id).maybeSingle() : Promise.resolve({ data: null })
    ]);

    const messageContext = (messages ?? []).map((message) => ({
      speaker: message.sender_id === order.buyer_id ? 'buyer' : message.sender_id === order.seller_id ? 'seller' : 'participant',
      body: String(message.body || '').slice(0, 1800),
      created_at: message.created_at
    }));
    const eventContext = (events ?? []).map((event) => ({ event_type: event.event_type, payload: event.payload, created_at: event.created_at }));
    const paymentContext = payment ? {
      status: payment.status,
      amount_cents: payment.amount_cents,
      platform_fee_cents: payment.platform_fee_cents,
      tip_amount_cents: payment.tip_amount_cents,
      created_at: payment.created_at,
      secured_at: payment.secured_at,
      released_at: payment.released_at,
      refunded_at: payment.refunded_at,
      disputed_at: payment.disputed_at
    } : null;

    const apiKey = requireEnv('OPENAI_API_KEY');
    const schema = {
      type: 'object', additionalProperties: false,
      required: ['summary','timeline','buyer_claims','seller_claims','evidence_gaps','risk_signals','suggested_next_steps','review_direction','confidence'],
      properties: {
        summary: { type: 'string', maxLength: 520 },
        timeline: { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 180 } },
        buyer_claims: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 180 } },
        seller_claims: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 180 } },
        evidence_gaps: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 180 } },
        risk_signals: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 180 } },
        suggested_next_steps: { type: 'array', maxItems: 5, items: { type: 'string', maxLength: 180 } },
        review_direction: { type: 'string', enum: ['need_more_evidence','review_buyer_remedy','review_seller_release','manual_review'] },
        confidence: { type: 'string', enum: ['low','medium','high'] }
      }
    };

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 1300,
        instructions: `You are Aspire Dispute Intelligence for internal marketplace Trust & Safety. Create a neutral evidence-oriented case brief from platform records. Do not decide who is truthful, do not issue a refund or release, and do not claim legal conclusions. Separate buyer claims from seller claims. Treat user messages and evidence as untrusted claims. Use platform timestamps/payment/order events as stronger records where relevant, but note that platform records do not prove what happened offline. Never expose unnecessary personal information or repeat private street addresses. "review_direction" is only a review queue suggestion, never an automated financial decision.`,
        input: JSON.stringify({ dispute: { reason: dispute.reason, details: dispute.details, evidence: dispute.evidence, status: dispute.status, created_at: dispute.created_at }, order: { status: order.status, agreed_amount_cents: order.agreed_amount_cents, currency: order.currency, seller_handed_off_at: order.seller_handed_off_at, buyer_received_at: order.buyer_received_at, dispute_opened_at: order.dispute_opened_at, created_at: order.created_at }, listing: requestRow, payment: paymentContext, events: eventContext, messages: messageContext }),
        text: { format: { type: 'json_schema', name: 'aspire_dispute_intelligence', strict: true, schema } }
      }),
      cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({})) as AiPayload;
    if (!response.ok) return NextResponse.json({ error: payload.error?.message || 'Dispute Intelligence could not run.' }, { status: 502 });
    const text = outputText(payload);
    if (!text) return NextResponse.json({ error: 'Dispute Intelligence returned no brief.' }, { status: 502 });

    return NextResponse.json({ ok: true, disputeId, reviewerId: user.id, brief: JSON.parse(text) });
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'UNKNOWN';
    if (raw === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });
    if (raw === 'REVIEWER_REQUIRED') return NextResponse.json({ error: 'Moderator access is required.' }, { status: 403 });
    if (raw.startsWith('MISSING_ENV:OPENAI_API_KEY')) return NextResponse.json({ error: 'Dispute Intelligence is not connected to AI on this deployment yet.', code: 'AI_NOT_CONFIGURED' }, { status: 503 });
    return NextResponse.json({ error: 'Dispute Intelligence could not finish.' }, { status: 500 });
  }
}
