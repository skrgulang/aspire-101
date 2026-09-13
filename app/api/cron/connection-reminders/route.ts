import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '../../../../lib/server/aspireServer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ScheduledConnection = {
  id: string;
  request_id: string;
  requester_id: string;
  responder_id: string;
  scheduled_start_at: string;
  timezone: string | null;
  meeting_label: string | null;
};

type ReminderMilestone = '24h' | '1h' | '15m';

type UserBlock = {
  blocker_id: string;
  blocked_id: string;
};

function milestoneFor(remainingMs: number): ReminderMilestone | null {
  if (remainingMs <= 0) return null;
  if (remainingMs <= 15 * 60_000) return '15m';
  if (remainingMs <= 60 * 60_000) return '1h';
  if (remainingMs <= 24 * 60 * 60_000) return '24h';
  return null;
}

function reminderCopy(milestone: ReminderMilestone) {
  if (milestone === '15m') {
    return {
      title: 'Starts in about 15 minutes',
      body: 'Open your Aspire connection to confirm arrival and meetup details.'
    };
  }
  if (milestone === '1h') {
    return {
      title: 'Starts in about 1 hour',
      body: 'Check the agreed time and place, then message the other person if anything changed.'
    };
  }
  return {
    title: 'Aspire connection within 24 hours',
    body: 'Review the agreed plan before you meet.'
  };
}

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

function formatStart(start: Date, timezone: string | null) {
  try {
    return start.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      ...(timezone ? { timeZone: timezone, timeZoneName: 'short' as const } : {})
    });
  } catch {
    return start.toISOString();
  }
}

function blockKey(blockerId: string, blockedId: string) {
  return `${blockerId}:${blockedId}`;
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  if (!authorized(request)) {
    return NextResponse.json(
      { error: 'Unauthorized.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const supabase = getSupabaseServiceClient();
  const now = new Date();
  const horizon = new Date(now.getTime() + 24 * 60 * 60_000 + 5 * 60_000);
  const errors: string[] = [];

  // Expired shares are already hidden by RLS. Delete them as well so exact
  // coordinates are not retained after the sharing window ends.
  const { count: cleanedLocations, error: cleanupError } = await supabase
    .from('connection_live_locations')
    .delete({ count: 'exact' })
    .lte('expires_at', now.toISOString());
  if (cleanupError) errors.push(`location cleanup: ${cleanupError.message}`);

  const { data: rows, error: connectionError } = await supabase
    .from('connections')
    .select('id,request_id,requester_id,responder_id,scheduled_start_at,timezone,meeting_label')
    .in('status', ['confirmed', 'active'])
    .not('scheduled_start_at', 'is', null)
    .gt('scheduled_start_at', now.toISOString())
    .lte('scheduled_start_at', horizon.toISOString());

  if (connectionError) {
    return NextResponse.json(
      { error: connectionError.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const connections = (rows ?? []) as ScheduledConnection[];
  const requestIds = [...new Set(connections.map((connection) => connection.request_id))];
  const participantIds = [...new Set(connections.flatMap((connection) => [connection.requester_id, connection.responder_id]))];
  const requestTitles = new Map<string, string>();
  const blockedPairs = new Set<string>();

  if (requestIds.length) {
    const { data: requests, error: requestError } = await supabase
      .from('requests')
      .select('id,title')
      .in('id', requestIds);
    if (requestError) errors.push(`request titles: ${requestError.message}`);
    (requests ?? []).forEach((item) => {
      requestTitles.set(String(item.id), String(item.title || 'Aspire connection'));
    });
  }

  if (participantIds.length > 1) {
    const { data: blocks, error: blockError } = await supabase
      .from('user_blocks')
      .select('blocker_id,blocked_id')
      .in('blocker_id', participantIds)
      .in('blocked_id', participantIds);

    // Fail closed for reminders if block state cannot be checked. A reminder should
    // never become a side channel after one participant blocks the other.
    if (blockError) {
      return NextResponse.json(
        { error: 'Could not verify block state.', detail: blockError.message },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    ((blocks ?? []) as UserBlock[]).forEach((block) => {
      blockedPairs.add(blockKey(block.blocker_id, block.blocked_id));
    });
  }

  let eligibleConnections = 0;
  let skippedBlocked = 0;
  let createdEvents = 0;
  let createdNotifications = 0;

  for (const connection of connections) {
    const blocked =
      blockedPairs.has(blockKey(connection.requester_id, connection.responder_id)) ||
      blockedPairs.has(blockKey(connection.responder_id, connection.requester_id));
    if (blocked) {
      skippedBlocked += 1;
      continue;
    }

    const start = new Date(connection.scheduled_start_at);
    if (!Number.isFinite(start.getTime())) continue;

    const milestone = milestoneFor(start.getTime() - now.getTime());
    if (!milestone) continue;
    eligibleConnections += 1;

    const copy = reminderCopy(milestone);
    const title = requestTitles.get(connection.request_id) || 'Aspire connection';
    const scheduleVersion = start.getTime();
    const eventKey = `connection-reminder:${connection.id}:${scheduleVersion}:${milestone}`;
    const when = formatStart(start, connection.timezone);
    const place = connection.meeting_label ? ` · ${connection.meeting_label}` : '';
    const eventBody = `${copy.title}. ${title} · ${when}${place}`;

    const { data: eventRows, error: eventError } = await supabase
      .from('connection_events')
      .upsert({
        connection_id: connection.id,
        actor_id: null,
        event_type: 'reminder',
        event_key: eventKey,
        body: eventBody.slice(0, 500),
        metadata: {
          reminder_key: eventKey,
          milestone,
          scheduled_start_at: connection.scheduled_start_at,
          timezone: connection.timezone,
          meeting_label: connection.meeting_label
        }
      }, { onConflict: 'event_key', ignoreDuplicates: true })
      .select('id');

    if (eventError) errors.push(`event ${connection.id}: ${eventError.message}`);
    else if (eventRows?.length) createdEvents += 1;

    for (const userId of [connection.requester_id, connection.responder_id]) {
      const notificationKey = `${eventKey}:${userId}`;
      const { data: notificationRows, error: notificationError } = await supabase
        .from('notifications')
        .upsert({
          user_id: userId,
          kind: 'connection_reminder',
          actor_id: null,
          request_id: connection.request_id,
          connection_id: connection.id,
          event_key: notificationKey,
          title: copy.title,
          body: `${copy.body} ${title} · ${when}${place}`.slice(0, 360)
        }, { onConflict: 'user_id,event_key', ignoreDuplicates: true })
        .select('id');

      if (notificationError) errors.push(`notification ${connection.id}/${userId}: ${notificationError.message}`);
      else if (notificationRows?.length) createdNotifications += 1;
    }
  }

  return NextResponse.json(
    {
      ok: errors.length === 0,
      checked: connections.length,
      eligibleConnections,
      skippedBlocked,
      createdEvents,
      createdNotifications,
      cleanedLocations: cleanedLocations ?? 0,
      errors: errors.slice(0, 10),
      generatedAt: now.toISOString()
    },
    {
      status: errors.length ? 500 : 200,
      headers: { 'Cache-Control': 'no-store' }
    }
  );
}
