'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from './client';

type PresencePayload = { user_id?: string };
type TypingPayload = { user_id?: string; typing?: boolean };

export function useConnectionRealtimeRoom(connectionId: string | null, userId: string, otherUserId: string) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [otherOnline, setOtherOnline] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);

  useEffect(() => {
    if (!connectionId || !userId || !otherUserId) {
      setOtherOnline(false);
      setOtherTyping(false);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    let disposed = false;
    let channel: RealtimeChannel | null = null;

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        await supabase.realtime.setAuth(data.session.access_token);
      }
      if (disposed) return;

      channel = supabase.channel(`connection:${connectionId}`, {
        config: {
          private: true,
          presence: { key: userId },
          broadcast: { self: false, ack: false }
        }
      });
      channelRef.current = channel;

      channel
        .on('presence', { event: 'sync' }, () => {
          if (!channel) return;
          const state = Object.values(channel.presenceState()).flat() as PresencePayload[];
          setOtherOnline(state.some((presence) => presence.user_id === otherUserId));
        })
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          const next = payload as TypingPayload;
          if (next.user_id !== otherUserId) return;

          setOtherTyping(Boolean(next.typing));
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
          if (next.typing) {
            typingTimerRef.current = setTimeout(() => setOtherTyping(false), 1400);
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED' && channel) {
            void channel.track({ user_id: userId, online_at: new Date().toISOString() });
          }
        });
    })();

    return () => {
      disposed = true;
      setOtherOnline(false);
      setOtherTyping(false);
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      const current = channelRef.current;
      channelRef.current = null;
      if (current) void supabase.removeChannel(current);
    };
  }, [connectionId, otherUserId, userId]);

  const sendTyping = useCallback((typing: boolean) => {
    const channel = channelRef.current;
    if (!channel || !userId) return;
    void channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: userId, typing }
    });
  }, [userId]);

  return { otherOnline, otherTyping, sendTyping };
}
