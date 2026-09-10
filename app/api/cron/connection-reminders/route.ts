import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '../../../../../lib/server/aspireServer';

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

function milestoneFor(remainingMs: number): ReminderMilestone | null {
  if (remainingMs <= 0) return null;
  if (remainingMs <= 15 * 60_000) return '15m';
  if (remainingMs <= 60 * 60_000) return '1h';
  if (remainingMs <= 24 * 60 * 60_000) return '24h';
  return null;
}

function reminderCopy(milestone: ReminderMilestone) {
  if (milestone === '15m') return { title: 'Starts in about 15 minutes', body: 'Open your Aspire connection to confirm arrival and meetup details.' };
  if (milestone === '1h') return { title: 'Starts in about 1 hour', body: 'Check the time and place, then message the other person if anything changed.' };
  return { title: 'Aspire connection tomorrow', body: 'Your scheduled connection starts within 24 hours. Confirm the plan before you meet.' };
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

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured.' }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const supabase = getSupabaseServiceClient();
  const now = new Date();
  const horizon = new Date(now.getTime() + 24 * 60 * 60_000 + 5 * 60_000);

  const { data: rows, error } = await supabase
    .from('connections')
    .select('id,request_id,requester_id,responder_id,scheduled_start_at,timezone,meeting_label')
    .in('status', ['confirmed', 'active'])
    .not('scheduled_start_at', 'is', null)
    .gt('scheduled_start_at', now.toISOString())
    .lte('scheduled_start_at', horizon.toISOString());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const connections = (rows ?? []) as ScheduledConnection[];
  const requestIds = [...new Set(connections.map((connection) => connection.request_id))];
  const requestTitles = new Map<string, string>();

  if (requestIds.length) {
    const { data: requests } = await supabase.from('requests').select('id,title').in('id', requestIds);
    (requests ?? []).forEach((item) => requestTitles.set(String(item.id), String(item.title || 'Aspire connection')));
  }

  let createdEvents = 0;
  let createdNotifications = 0;

  for (const connection of connections) {
    const start = new Date(connection.scheduled_start_at);
    const remainingMs = start.getTime() - now.getTime();
    const milestone = milestoneFor(remainingMs);
    if (!milestone) continue;

    const copy = reminderCopy(milestone);
    const title = requestTitles.get(connection.request_id) || 'Aspire connection';
    const eventKey = `connection-reminder:${connection.id}:${milestone}`;
    const when = formatStart(start, connection.timezone);
    const eventBody = `${copy.title}. ${title} · ${when}${connection.meeting_label ? ` · ${connection.meeting_label}` : ''}`;

    const { data: eventRow, error: eventError } = await supabase
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

    if (!eventError && eventRow?.length) createdEvents += 1;

    for (const userId of [connection.requester_id, connection.responder_id]) {
      const notificationKey = `${eventKey}:${userId}`;
      const { data: notificationRow, error: notificationError } = await supabase
        .from('notifications')
        .upsert({
          user_id: userId,
          kind: 'connection_reminder',
          actor_id: null,
          request_id: connection.request_id,
          connection_id: connection.id,
          event_key: notificationKey,
          title: copy.title,
          body: `${title} · ${when}${connection.meeting_label ? ` · ${connection.meeting_label}` : ''}`.slice(0, 360)
        }, { onConflict: 'user_id,event_key', ignoreDuplicates: true })
        .select('id');
      if (!notificationError && notificationRow?.length) createdNotifications += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    checked: connections.length,
    createdEvents,
    createdNotifications,
    generatedAt: now.toISOString()
  });
}
