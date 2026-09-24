import { NextResponse } from 'next/server';
import { getAuthenticatedUser, getSupabaseServiceClient } from '../../../../../lib/server/aspireServer';

export const runtime = 'nodejs';

const messageSelect = 'id,dispute_id,author_id,audience,message_type,body,created_at';

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  console.error('market dispute thread error', error);
  return NextResponse.json({ error: 'Could not load this dispute conversation.' }, { status: 500 });
}

async function participantDisputes(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  userId: string,
  disputeIds: string[]
) {
  const { data: disputes, error } = await supabase
    .from('market_disputes')
    .select('id,status,market_order_id')
    .in('id', disputeIds);
  if (error) throw error;
  const orderIds = [...new Set((disputes ?? []).map((item) => item.market_order_id))];
  if (!orderIds.length) return [];
  const { data: orders, error: orderError } = await supabase
    .from('market_orders')
    .select('id,buyer_id,seller_id,request_id,connection_id')
    .in('id', orderIds)
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);
  if (orderError) throw orderError;
  const allowedOrders = new Map((orders ?? []).map((item) => [item.id, item]));
  return (disputes ?? [])
    .filter((item) => allowedOrders.has(item.market_order_id))
    .map((item) => ({ ...item, order: allowedOrders.get(item.market_order_id)! }));
}

export async function GET(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const raw = new URL(request.url).searchParams.get('disputeIds') || '';
    const disputeIds = [...new Set(raw.split(',').map((value) => value.trim()).filter(validUuid))].slice(0, 50);
    if (!disputeIds.length) return NextResponse.json({ messages: [] });

    const supabase = getSupabaseServiceClient();
    const disputes = await participantDisputes(supabase, user.id, disputeIds);
    const allowedIds = disputes.map((item) => item.id);
    if (!allowedIds.length) return NextResponse.json({ messages: [] });

    const { data, error } = await supabase
      .from('market_dispute_messages')
      .select(messageSelect)
      .in('dispute_id', allowedIds)
      .eq('audience', 'participants')
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) throw error;
    return NextResponse.json({ messages: data ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const body = await request.json().catch(() => ({})) as { disputeId?: string; message?: string };
    const disputeId = String(body.disputeId || '').trim();
    const message = String(body.message || '').trim();
    if (!validUuid(disputeId)) return NextResponse.json({ error: 'Valid dispute id required.' }, { status: 400 });
    if (message.length < 2 || message.length > 2000) {
      return NextResponse.json({ error: 'Reply must be between 2 and 2,000 characters.' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const [dispute] = await participantDisputes(supabase, user.id, [disputeId]);
    if (!dispute) return NextResponse.json({ error: 'Dispute not found.' }, { status: 404 });
    if (!['open', 'under_review'].includes(dispute.status)) {
      return NextResponse.json({ error: 'This dispute is already closed.' }, { status: 409 });
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase
      .from('market_dispute_messages')
      .select('id', { count: 'exact', head: true })
      .eq('dispute_id', disputeId)
      .eq('author_id', user.id)
      .gte('created_at', since);
    if (countError) throw countError;
    if ((count ?? 0) >= 20) {
      return NextResponse.json({ error: 'Reply limit reached for today. Aspire already has your recent updates.' }, { status: 429 });
    }

    const { data, error } = await supabase
      .from('market_dispute_messages')
      .insert({
        dispute_id: disputeId,
        author_id: user.id,
        audience: 'participants',
        message_type: 'participant_reply',
        body: message
      })
      .select(messageSelect)
      .single();
    if (error) throw error;

    const otherUserId = dispute.order.buyer_id === user.id ? dispute.order.seller_id : dispute.order.buyer_id;
    const { error: noticeError } = await supabase.rpc('push_notification', {
      p_user_id: otherUserId,
      p_kind: 'market_order',
      p_event_key: `market-dispute-reply:${data.id}:${otherUserId}`,
      p_title: 'New dispute update',
      p_body: 'The other participant added information to the marketplace review.',
      p_actor_id: user.id,
      p_request_id: dispute.order.request_id,
      p_response_id: null,
      p_connection_id: dispute.order.connection_id,
      p_message_id: null
    });
    if (noticeError) throw noticeError;

    return NextResponse.json({ message: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
