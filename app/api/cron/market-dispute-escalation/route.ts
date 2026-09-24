import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '../../../../lib/server/aspireServer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type DueDispute = {
  id: string;
  market_order_id: string;
  assigned_to: string | null;
  escalation_level: number;
  next_action_due_at: string;
  source: string | null;
  evidence_due_by: string | null;
};

type MarketOrder = {
  id: string;
  connection_id: string;
  request_id: string;
};

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const received = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured.' }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const supabase = getSupabaseServiceClient();
  const now = new Date().toISOString();
  const errors: string[] = [];
  let escalated = 0;

  const { data, error } = await supabase
    .from('market_disputes')
    .select('id,market_order_id,assigned_to,escalation_level,next_action_due_at,source,evidence_due_by')
    .in('status', ['open', 'under_review'])
    .not('next_action_due_at', 'is', null)
    .lte('next_action_due_at', now)
    .order('next_action_due_at', { ascending: true })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const due = (data ?? []) as DueDispute[];
  const orderIds = [...new Set(due.map((item) => item.market_order_id))];
  const { data: orders, error: orderError } = orderIds.length
    ? await supabase.from('market_orders').select('id,connection_id,request_id').in('id', orderIds)
    : { data: [], error: null };
  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }
  const orderMap = new Map(((orders ?? []) as MarketOrder[]).map((item) => [item.id, item]));

  const { data: staff, error: staffError } = await supabase
    .from('user_roles')
    .select('user_id,role')
    .in('role', ['admin', 'moderator']);
  if (staffError) {
    return NextResponse.json({ error: staffError.message }, { status: 500 });
  }
  const staffIds = (staff ?? []).map((item) => String(item.user_id));

  for (const dispute of due) {
    try {
      const level = Number(dispute.escalation_level || 0) + 1;
      const nextDue = new Date(dispute.source === 'stripe_dispute'
        ? Math.min(Date.now() + 60 * 60 * 1000,
          dispute.evidence_due_by
            ? Math.max(Date.now() + 60 * 60 * 1000, new Date(dispute.evidence_due_by).getTime() - 60 * 60 * 1000)
            : Number.POSITIVE_INFINITY)
        : Date.now() + 12 * 60 * 60 * 1000).toISOString();
      const { data: updated, error: updateError } = await supabase
        .from('market_disputes')
        .update({ escalation_level: level, next_action_due_at: nextDue, updated_at: now })
        .eq('id', dispute.id)
        .in('status', ['open', 'under_review'])
        .eq('next_action_due_at', dispute.next_action_due_at)
        .select('id')
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updated) continue;

      const order = orderMap.get(dispute.market_order_id);
      const recipients = dispute.assigned_to ? [dispute.assigned_to] : staffIds;
      for (const userId of [...new Set(recipients)]) {
        const { error: noticeError } = await supabase.rpc('push_notification', {
          p_user_id: userId,
          p_kind: 'market_order',
          p_event_key: `market-dispute-escalation:${dispute.id}:${level}:${userId}`,
          p_title: dispute.source === 'stripe_dispute' ? 'Stripe dispute deadline: action needed' : level > 1 ? 'Marketplace dispute is overdue' : 'Marketplace dispute needs review',
          p_body: dispute.source === 'stripe_dispute'
            ? `Case #${dispute.id.slice(0, 8).toUpperCase()}: check Stripe evidence and submit before ${dispute.evidence_due_by || 'the Stripe deadline'}.`
            : `Case #${dispute.id.slice(0, 8).toUpperCase()} has reached review escalation level ${level}.`,
          p_actor_id: null,
          p_request_id: order?.request_id || null,
          p_response_id: null,
          p_connection_id: order?.connection_id || null,
          p_message_id: null
        });
        if (noticeError) throw noticeError;
      }
      escalated += 1;
    } catch (disputeError) {
      errors.push(`${dispute.id}: ${disputeError instanceof Error ? disputeError.message : String(disputeError)}`);
    }
  }

  return NextResponse.json(
    { ok: errors.length === 0, checked: due.length, escalated, errors: errors.slice(0, 10) },
    { status: errors.length ? 500 : 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
