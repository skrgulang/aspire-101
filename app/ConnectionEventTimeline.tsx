'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ConnectionEvent,
  fetchConnectionEvents,
  subscribeToConnectionEvents
} from '../lib/supabase/liveConnections';
import styles from './ConnectionEventTimeline.module.css';

type Props = {
  connectionId: string;
  userId: string;
  otherName: string;
};

function eventIcon(type: ConnectionEvent['event_type']) {
  if (type === 'schedule_set') return '◷';
  if (type === 'on_the_way') return '↗';
  if (type === 'arrived') return '●';
  if (type === 'in_progress') return '▶';
  if (type === 'location_shared') return '⌖';
  if (type === 'location_stopped') return '×';
  return '◉';
}

function eventCopy(event: ConnectionEvent) {
  if (event.event_type !== 'schedule_set') return event.body;
  const start = typeof event.metadata?.scheduled_start_at === 'string' ? event.metadata.scheduled_start_at : '';
  const meeting = typeof event.metadata?.meeting_label === 'string' ? event.metadata.meeting_label : '';
  if (!start) return event.body;
  const date = new Date(start);
  const when = Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return [when ? `Time set for ${when}.` : event.body, meeting ? `Meet at ${meeting}.` : ''].filter(Boolean).join(' ');
}

export default function ConnectionEventTimeline({ connectionId, userId, otherName }: Props) {
  const [events, setEvents] = useState<ConnectionEvent[]>([]);

  useEffect(() => {
    let alive = true;
    void fetchConnectionEvents(connectionId)
      .then((next) => { if (alive) setEvents(next); })
      .catch(() => undefined);

    const unsubscribe = subscribeToConnectionEvents((event) => {
      if (event.connection_id !== connectionId) return;
      setEvents((current) => current.some((item) => item.id === event.id) ? current : [...current, event]);
    });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [connectionId]);

  const latest = useMemo(() => events.slice(-5).reverse(), [events]);
  if (!latest.length) return null;

  return (
    <div className={styles.timeline} aria-label="Recent connection activity">
      <div className={styles.heading}><span>LIVE UPDATES</span><small>Visible to both of you</small></div>
      <div className={styles.items}>
        {latest.map((event) => {
          const actor = !event.actor_id ? 'Aspire' : event.actor_id === userId ? 'You' : otherName;
          return (
            <div className={styles.item} key={event.id}>
              <i>{eventIcon(event.event_type)}</i>
              <div>
                <strong>{actor}</strong>
                <span>{eventCopy(event)}</span>
              </div>
              <time>{new Date(event.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
            </div>
          );
        })}
      </div>
    </div>
  );
}
