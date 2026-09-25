import { NextResponse } from 'next/server';
import { getAuthenticatedUser, getSupabaseServiceClient, requireAal2 } from '../../../../lib/server/aspireServer';
import { DISPUTE_EVIDENCE_BUCKET } from '../../../../lib/server/marketDisputeProtection';

export const runtime = 'nodejs';

const disputeSelect = 'id,market_order_id,opened_by,source,stripe_case_id,stripe_status,stripe_outcome,stripe_status_updated_at,reason,details,evidence,status,resolution_note,resolution_refund_cents,resolution_seller_release_cents,assigned_to,reviewed_by,review_started_at,evidence_due_by,last_participant_response_at,last_staff_response_at,next_action_due_at,escalation_level,created_at,updated_at,resolved_at';
const messageSelect = 'id,dispute_id,author_id,audience,message_type,body,created_at';

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function requireStaff(request: Request) {
  const auth = await getAuthenticatedUser(request);
  await requireAal2(auth.accessToken);
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', auth.user.id).maybeSingle();
  if (error) throw error;
  if (!['moderator', 'admin'].includes(String(data?.role || ''))) throw new Error('STAFF_REQUIRED');
  return { ...auth, role: String(data!.role) as 'moderator' | 'admin', supabase };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  if (message === 'MFA_REQUIRED') return NextResponse.json({ error: 'Complete two-step verification to open the staff queue.', code: 'MFA_REQUIRED' }, { status: 403 });
  if (message === 'STAFF_REQUIRED') return NextResponse.json({ error: 'Trust & Safety access required.' }, { status: 403 });
  console.error('market dispute admin error', error);
  return NextResponse.json({ error: 'Could not update the marketplace dispute queue.' }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const { user, role, supabase } = await requireStaff(request);
    const { data: disputes, error } = await supabase
      .from('market_disputes')
      .select(disputeSelect)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;

    const orderIds = [...new Set((disputes ?? []).map((item) => item.market_order_id))];
    const [{ data: orders, error: orderError }, { data: messages, error: messageError }] = await Promise.all([
      orderIds.length
        ? supabase.from('market_orders').select('id,connection_id,request_id,buyer_id,seller_id,status,released_at,fulfillment_method,currency,agreed_amount_cents,seller_handed_off_at,buyer_received_at,admin_release_authorized_at,shipping_status,created_at').in('id', orderIds)
        : Promise.resolve({ data: [], error: null }),
      (disputes ?? []).length
        ? supabase.from('market_dispute_messages').select(messageSelect).in('dispute_id', (disputes ?? []).map((item) => item.id)).order('created_at', { ascending: true }).limit(1000)
        : Promise.resolve({ data: [], error: null })
    ]);
    if (orderError) throw orderError;
    if (messageError) throw messageError;

    const connectionIds = [...new Set((orders ?? []).map((item) => item.connection_id))];
    const userIds = [...new Set((orders ?? []).flatMap((item) => [item.buyer_id, item.seller_id]).concat((disputes ?? []).flatMap((item) => [item.opened_by, item.assigned_to, item.reviewed_by]).filter(Boolean)))];
    const [{ data: payments, error: paymentError }, { data: profiles, error: profileError }, { data: attachments, error: attachmentError }] = await Promise.all([
      connectionIds.length
        ? supabase.from('connection_payments').select('id,connection_id,status,currency,customer_total_cents,gross_amount_cents,provider_net_cents,platform_fee_cents,refunded_total_cents,stripe_livemode,transfer_recovery_status,transfer_recovery_error,updated_at').in('connection_id', connectionIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? supabase.from('profiles').select('id,display_name,full_name,name,username').in('id', userIds)
        : Promise.resolve({ data: [], error: null }),
      (disputes ?? []).length
        ? supabase.from('market_dispute_attachments').select('id,dispute_id,uploaded_by,storage_path,file_name,mime_type,size_bytes,audience,created_at').in('dispute_id', (disputes ?? []).map((item) => item.id)).order('created_at', { ascending: true }).limit(1000)
        : Promise.resolve({ data: [], error: null })
    ]);
    if (paymentError) throw paymentError;
    if (profileError) throw profileError;
    if (attachmentError) throw attachmentError;
    const paths = (attachments ?? []).map((item) => item.storage_path);
    const signed = paths.length
      ? await supabase.storage.from(DISPUTE_EVIDENCE_BUCKET).createSignedUrls(paths, 600)
      : { data: [], error: null };
    if (signed.error) throw signed.error;
    const urlMap = new Map((signed.data ?? []).map((item) => [item.path, item.signedUrl]));

    return NextResponse.json({
      userId: user.id,
      role,
      disputes: disputes ?? [],
      orders: orders ?? [],
      payments: payments ?? [],
      messages: messages ?? [],
      attachments: (attachments ?? []).map(({ storage_path, ...item }) => ({ ...item, url: urlMap.get(storage_path) || null })),
      profiles: profiles ?? []
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, role, supabase } = await requireStaff(request);
    const body = await request.json().catch(() => ({})) as { disputeId?: string; action?: string; message?: string };
    const disputeId = String(body.disputeId || '').trim();
    const action = String(body.action || '').trim();
    const message = String(body.message || '').trim();
    if (!validUuid(disputeId)) return NextResponse.json({ error: 'Valid dispute id required.' }, { status: 400 });
    if (!['assign_self', 'staff_reply', 'internal_note', 'close_after_sales'].includes(action)) {
      return NextResponse.json({ error: 'Choose a valid queue action.' }, { status: 400 });
    }

    const { data: dispute, error: disputeError } = await supabase
      .from('market_disputes')
      .select('id,status,market_order_id,assigned_to,source,created_at')
      .eq('id', disputeId)
      .maybeSingle();
    if (disputeError) throw disputeError;
    if (!dispute) return NextResponse.json({ error: 'Dispute not found.' }, { status: 404 });
    if (!['open', 'under_review'].includes(dispute.status)) {
      return NextResponse.json({ error: 'This dispute is already closed.' }, { status: 409 });
    }

    if (action === 'close_after_sales') {
      if (role !== 'admin') return NextResponse.json({ error: 'Admin review required.' }, { status: 403 });
      if (message.length < 10 || message.length > 2000) return NextResponse.json({ error: 'Provide a decision note between 10 and 2,000 characters.' }, { status: 400 });
      const { data: order, error: orderError } = await supabase.from('market_orders')
        .select('status,released_at').eq('id', dispute.market_order_id).maybeSingle();
      if (orderError) throw orderError;
      if (dispute.source !== 'user' || order?.status !== 'released' || !order.released_at ||
          new Date(dispute.created_at).getTime() < new Date(order.released_at).getTime()) {
        return NextResponse.json({ error: 'Only post-payout buyer help cases can be closed this way.' }, { status: 409 });
      }
      const { data, error } = await supabase.rpc('market_close_after_sales', {
        p_dispute_id: disputeId, p_actor_id: user.id, p_note: message
      });
      if (error) throw error;
      return NextResponse.json({ disputeId: data });
    }

    const now = new Date().toISOString();
    if (action === 'assign_self') {
      const { data, error } = await supabase
        .from('market_disputes')
        .update({ assigned_to: user.id, status: 'under_review', review_started_at: now, updated_at: now })
        .eq('id', disputeId)
        .in('status', ['open', 'under_review'])
        .select(disputeSelect)
        .single();
      if (error) throw error;
      return NextResponse.json({ dispute: data });
    }

    if (message.length < 2 || message.length > 2000) {
      return NextResponse.json({ error: 'Note must be between 2 and 2,000 characters.' }, { status: 400 });
    }
    const internal = action === 'internal_note';
    const { data: saved, error: insertError } = await supabase
      .from('market_dispute_messages')
      .insert({
        dispute_id: disputeId,
        author_id: user.id,
        audience: internal ? 'staff' : 'participants',
        message_type: internal ? 'internal_note' : 'staff_reply',
        body: message
      })
      .select(messageSelect)
      .single();
    if (insertError) throw insertError;
    const { error: assignError } = await supabase.from('market_disputes').update({
      assigned_to: dispute.assigned_to || user.id,
      status: 'under_review',
      review_started_at: now,
      updated_at: now
    }).eq('id', disputeId);
    if (assignError) throw assignError;

    if (!internal) {
      const { data: order, error: orderError } = await supabase
        .from('market_orders')
        .select('buyer_id,seller_id,request_id,connection_id')
        .eq('id', dispute.market_order_id)
        .single();
      if (orderError) throw orderError;
      for (const participantId of [order.buyer_id, order.seller_id]) {
        const { error: noticeError } = await supabase.rpc('push_notification', {
          p_user_id: participantId,
          p_kind: 'market_order',
          p_event_key: `market-dispute-staff-reply:${saved.id}:${participantId}`,
          p_title: 'Aspire replied to your dispute',
          p_body: 'A Trust & Safety reviewer added an update to the marketplace case.',
          p_actor_id: user.id,
          p_request_id: order.request_id,
          p_response_id: null,
          p_connection_id: order.connection_id,
          p_message_id: null
        });
        if (noticeError) throw noticeError;
      }
    }

    return NextResponse.json({ message: saved });
  } catch (error) {
    return errorResponse(error);
  }
}
