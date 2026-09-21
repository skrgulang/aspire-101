'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  acceptRequestResponse,
  AspireConnection,
  cancelConnection,
  CircleEntry,
  confirmConnection,
  ConnectionLifecycleState,
  ConnectionMessage,
  ConnectionReview,
  fetchConnectionLifecycleStates,
  fetchConnectionMessages,
  fetchConnectionReviews,
  fetchConnectionUnreadCounts,
  fetchMyCircle,
  fetchMyConnections,
  fetchMyRequestInbox,
  markConnectionRead,
  PublicProfile,
  RequestResponse,
  sendConnectionMessage,
  setCircleChoice,
  submitConnectionReview,
  subscribeToConnectionMessages,
  subscribeToMyConnectionActivity
} from '../lib/supabase/connections';
import { useConnectionRealtimeRoom } from '../lib/supabase/connection-realtime';
import { confirmConnectionCompletion } from '../lib/supabase/payments';
import { setConnectionCoordinationStatus } from '../lib/supabase/liveConnections';
import type { AspireRequest } from '../lib/supabase/requests';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { trackGa4Event } from '../lib/analytics/ga4';
import { blockUser, reportSafety, type SafetyReason } from '../lib/supabase/safety';
import NotificationCenter from './NotificationCenter';
import ConnectionEventTimeline from './ConnectionEventTimeline';

type Tab = 'requests' | 'connections' | 'history' | 'circle';
type ReviewDraft = { choice: boolean | null; tags: string[] };

const reviewTags = [
  ['reliable', 'Reliable'],
  ['friendly', 'Friendly'],
  ['on_time', 'On time'],
  ['good_communication', 'Good communication'],
  ['helpful', 'Helpful']
] as const;

function profileName(profile?: PublicProfile) {
  return profile?.display_name || profile?.full_name || profile?.name || 'Aspire student';
}

function money(request?: AspireRequest) {
  if (!request) return '';
  if (request.kind === 'community') return 'Community help';
  if (request.kind === 'collaboration') return 'Collaboration';
  if (request.amount_cents == null) return request.kind === 'split_cost' ? 'Split cost' : 'Amount not set';
  return `$${(request.amount_cents / 100).toFixed(request.amount_cents % 100 ? 2 : 0)}`;
}

function addMessage(current: ConnectionMessage[], next: ConnectionMessage) {
  if (current.some((message) => message.id === next.id)) return current;
  return [...current, next].sort((a, b) => a.id - b.id);
}

export default function ConnectionsHub() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('requests');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState('');
  const [inbox, setInbox] = useState<{ requests: AspireRequest[]; responses: RequestResponse[]; profiles: PublicProfile[] }>({ requests: [], responses: [], profiles: [] });
  const [connectionData, setConnectionData] = useState<{ userId: string; connections: AspireConnection[]; requests: AspireRequest[]; profiles: PublicProfile[] }>({ userId: '', connections: [], requests: [], profiles: [] });
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [circle, setCircle] = useState<CircleEntry[]>([]);
  const [lifecycle, setLifecycle] = useState<ConnectionLifecycleState[]>([]);
  const [reviews, setReviews] = useState<ConnectionReview[]>([]);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, ReviewDraft>>({});
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConnectionMessage[]>([]);
  const [chatText, setChatText] = useState('');
  const [chatSendError, setChatSendError] = useState('');
  const [connectedConnectionId, setConnectedConnectionId] = useState<string | null>(null);
  const chatIdRef = useRef<string | null>(null);
  const chatMessagesRef = useRef<HTMLDivElement | null>(null);

  const reload = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace('/login?next=/connections');
        return;
      }

      const [nextInbox, nextConnections] = await Promise.all([fetchMyRequestInbox(), fetchMyConnections()]);
      const connectionIds = nextConnections.connections.map((connection) => connection.id);
      const [unreadRows, nextCircle, nextLifecycle, nextReviews] = await Promise.all([
        fetchConnectionUnreadCounts(),
        fetchMyCircle(),
        fetchConnectionLifecycleStates(),
        fetchConnectionReviews(connectionIds)
      ]);

      setInbox(nextInbox);
      setConnectionData(nextConnections);
      setCircle(nextCircle);
      setLifecycle(nextLifecycle);
      setReviews(nextReviews);
      setUnread(Object.fromEntries(unreadRows.map((row) => [row.connection_id, row.unread_count])));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load your Aspire activity.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [router]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { chatIdRef.current = chatId; }, [chatId]);

  useEffect(() => {
    if (!connectionData.userId) return;
    return subscribeToConnectionMessages((message) => {
      const isOpen = chatIdRef.current === message.connection_id;
      if (isOpen) {
        setMessages((current) => addMessage(current, message));
        setUnread((current) => ({ ...current, [message.connection_id]: 0 }));
        if (message.sender_id !== connectionData.userId) {
          void markConnectionRead(message.connection_id, message.id).catch(() => undefined);
        }
      } else if (message.sender_id !== connectionData.userId) {
        setUnread((current) => ({ ...current, [message.connection_id]: (current[message.connection_id] || 0) + 1 }));
      }
    });
  }, [connectionData.userId]);

  useEffect(() => {
    if (!connectionData.userId) return;
    return subscribeToMyConnectionActivity(connectionData.userId, () => {
      void reload(true);
    });
  }, [connectionData.userId, reload]);

  useEffect(() => {
    if (!chatId) return;
    const node = chatMessagesRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
  }, [chatId, messages]);

  const inboxProfiles = useMemo(() => new Map(inbox.profiles.map((profile) => [profile.id, profile])), [inbox.profiles]);
  const connectionProfiles = useMemo(() => new Map(connectionData.profiles.map((profile) => [profile.id, profile])), [connectionData.profiles]);
  const requestMap = useMemo(() => new Map(connectionData.requests.map((request) => [request.id, request])), [connectionData.requests]);
  const circleMap = useMemo(() => new Map(circle.map((entry) => [entry.connection_id, entry])), [circle]);
  const circleGroups = useMemo(() => {
    const grouped = new Map<string, CircleEntry[]>();
    circle.forEach((entry) => {
      const current = grouped.get(entry.other_user_id) || [];
      current.push(entry);
      grouped.set(entry.other_user_id, current);
    });
    return Array.from(grouped.entries()).map(([otherUserId, entries]) => ({
      otherUserId,
      entries: entries.slice().sort((a, b) => new Date(b.connected_at).getTime() - new Date(a.connected_at).getTime()),
      chatConnectionId: entries.slice().sort((a, b) => new Date(b.connected_at).getTime() - new Date(a.connected_at).getTime())[0]?.connection_id || ''
    }));
  }, [circle]);
  const circleChatByUser = useMemo(
    () => new Map(circleGroups.map((group) => [group.otherUserId, group.chatConnectionId])),
    [circleGroups]
  );
  const lifecycleMap = useMemo(() => new Map(lifecycle.map((state) => [state.connection_id, state])), [lifecycle]);
  const activeConnections = useMemo(
    () => connectionData.connections.filter((connection) => ['pending', 'confirmed', 'active'].includes(connection.status)),
    [connectionData.connections]
  );
  const activeConnectionGroups = useMemo(() => {
    const grouped = new Map<string, AspireConnection[]>();
    activeConnections.forEach((connection) => {
      const otherId = connectionData.userId === connection.requester_id ? connection.responder_id : connection.requester_id;
      const current = grouped.get(otherId) || [];
      current.push(connection);
      grouped.set(otherId, current);
    });
    return Array.from(grouped.entries()).map(([otherId, connections]) => ({
      otherId,
      connections
    }));
  }, [activeConnections, connectionData.userId]);
  const pendingInvites = useMemo(
    () => activeConnections.filter((connection) =>
      connection.status === 'pending'
      && connection.responder_id === connectionData.userId
      && Boolean(connection.requester_confirmed)
      && !connection.responder_confirmed
    ),
    [activeConnections, connectionData.userId]
  );
  const historyConnections = useMemo(
    () => connectionData.connections.filter((connection) => ['completed', 'cancelled'].includes(connection.status)),
    [connectionData.connections]
  );
  const unreadTotal = useMemo(() => Object.values(unread).reduce((sum, count) => sum + count, 0), [unread]);
  const activeUnreadTotal = useMemo(
    () => activeConnections.reduce((sum, connection) => sum + (unread[connection.id] || 0), 0),
    [activeConnections, unread]
  );
  const circleUnreadTotal = useMemo(
    () => circle.reduce((sum, entry) => sum + (unread[entry.connection_id] || 0), 0),
    [circle, unread]
  );
  const historyUnreadTotal = useMemo(
    () => historyConnections
      .filter((connection) => !circleMap.has(connection.id))
      .reduce((sum, connection) => sum + (unread[connection.id] || 0), 0),
    [circleMap, historyConnections, unread]
  );
  const activeChatConnection = useMemo(
    () => connectionData.connections.find((connection) => connection.id === chatId),
    [chatId, connectionData.connections]
  );
  const activeChatOtherId = useMemo(() => {
    if (!activeChatConnection || !connectionData.userId) return '';
    return connectionData.userId === activeChatConnection.requester_id
      ? activeChatConnection.responder_id
      : activeChatConnection.requester_id;
  }, [activeChatConnection, connectionData.userId]);
  const { otherOnline, otherTyping, sendTyping } = useConnectionRealtimeRoom(chatId, connectionData.userId, activeChatOtherId);

  function homeTabForConnection(connectionId: string): Tab {
    const connection = connectionData.connections.find((item) => item.id === connectionId);
    if (!connection) return 'connections';
    if (connection.status === 'completed' && circleMap.has(connectionId)) return 'circle';
    if (connection.status === 'completed' || connection.status === 'cancelled') return 'history';
    return 'connections';
  }

  function canWriteChat(connection?: AspireConnection) {
    if (!connection) return false;
    if (['confirmed', 'active'].includes(connection.status)) return true;
    return connection.status === 'completed' && circleMap.has(connection.id);
  }

  async function accept(responseId: string) {
    setBusyId(responseId);
    setNotice('');
    try {
      await acceptRequestResponse(responseId);
      setNotice('You chose a responder. They still need to confirm before private chat opens.');
      await reload(true);
      setTab('connections');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not accept this response.');
    } finally {
      setBusyId('');
    }
  }

  async function confirm(connectionId: string) {
    setBusyId(connectionId);
    setNotice('');
    try {
      const connection = connectionData.connections.find((item) => item.id === connectionId);
      await confirmConnection(connectionId);
      trackGa4Event('connection_created', {
        source: 'request_response',
        payment_method: connection?.payment_method || 'none'
      });
      setNotice('Connected. You can message each other and coordinate the next step.');
      await reload(true);
      setTab('connections');
      setConnectedConnectionId(connectionId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not confirm this connection.');
    } finally {
      setBusyId('');
    }
  }

  async function cancel(connectionId: string) {
    setBusyId(connectionId);
    setNotice('');
    try {
      await cancelConnection(connectionId);
      setNotice('Connection cancelled. It has moved to History and the chat is now read-only.');
      await reload(true);
      setTab('history');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not cancel this connection.');
    } finally {
      setBusyId('');
    }
  }

  async function startActivity(connectionId: string) {
    setBusyId(`start-${connectionId}`);
    setNotice('');
    try {
      await setConnectionCoordinationStatus(connectionId, 'in_progress');
      setNotice('Activity started. When you are done, use Mark complete.');
      await reload(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not start this activity.');
    } finally {
      setBusyId('');
    }
  }

  function completionReady(connection: AspireConnection, state?: ConnectionLifecycleState) {
    if (state?.other_completed) return true;
    if (connection.coordination_status === 'in_progress') return true;
    const now = Date.now();
    if (connection.scheduled_end_at) return now >= new Date(connection.scheduled_end_at).getTime();
    if (connection.scheduled_start_at) return now >= new Date(connection.scheduled_start_at).getTime();
    return false;
  }

  function startIsFuture(connection: AspireConnection) {
    return Boolean(connection.scheduled_start_at && Date.now() < new Date(connection.scheduled_start_at).getTime());
  }

  function taskStateLabel(connection: AspireConnection, state?: ConnectionLifecycleState) {
    if (connection.status === 'pending') return 'Waiting for confirmation';
    if (state?.viewer_completed && !state.other_completed) return 'You finished · waiting on them';
    if (state?.other_completed && !state.viewer_completed) return 'They finished · confirm yours';
    if (connection.coordination_status === 'in_progress') return 'In progress';
    if (connection.coordination_status === 'arrived') return 'Arrived';
    if (connection.coordination_status === 'on_the_way') return 'On the way';
    if (connection.coordination_status === 'scheduled') return 'Scheduled';
    return 'Connected · ready to coordinate';
  }

  async function openChat(connectionId: string, preferredTab?: Tab) {
    setTab(preferredTab || homeTabForConnection(connectionId));
    setChatId(connectionId);
    setMessages([]);
    setChatText('');
    setChatSendError('');
    try {
      const next = await fetchConnectionMessages(connectionId);
      setMessages(next);
      const last = next[next.length - 1];
      await markConnectionRead(connectionId, last?.id);
      setUnread((current) => ({ ...current, [connectionId]: 0 }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not open chat.');
    }
  }

  function closeChat() {
    sendTyping(false);
    setChatText('');
    setChatSendError('');
    setChatId(null);
  }

  function changeChatText(value: string) {
    if (!canWriteChat(activeChatConnection)) return;
    setChatText(value);
    if (chatSendError) setChatSendError('');
    sendTyping(Boolean(value.trim()));
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chatId || !chatText.trim() || !canWriteChat(activeChatConnection)) return;
    setBusyId(`chat-${chatId}`);
    try {
      const sent = await sendConnectionMessage(chatId, chatText);
      setMessages((current) => addMessage(current, sent));
      setChatText('');
      setChatSendError('');
      sendTyping(false);
      await markConnectionRead(chatId, sent.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not send message.';
      setChatSendError(message);
    } finally {
      setBusyId('');
    }
  }

  async function reportChat(connectionId: string, targetUserId: string) {
    const details = window.prompt('What happened? Start with spam, scam, harassment, hate, sexual, illegal, unsafe, or other, then add any useful details.');
    if (details === null) return;
    const clean = details.trim();
    const firstWord = clean.toLowerCase().split(/\s|:|-/)[0];
    const allowedReasons: SafetyReason[] = ['spam', 'scam', 'harassment', 'hate', 'sexual', 'illegal', 'unsafe', 'other'];
    const reason: SafetyReason = allowedReasons.includes(firstWord as SafetyReason) ? firstWord as SafetyReason : 'other';
    setBusyId(`report-${connectionId}`);
    setNotice('');
    try {
      await reportSafety({ connectionId, targetUserId, reason, details: clean || 'Reported from a private connection chat.' });
      setNotice('Report submitted to Aspire Safety. The other person was not notified.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not submit the report.');
    } finally {
      setBusyId('');
    }
  }

  async function blockChatUser(connectionId: string, targetUserId: string) {
    if (!window.confirm('Block this person? They will no longer be able to message or connect with you.')) return;
    setBusyId(`block-${connectionId}`);
    setNotice('');
    try {
      await blockUser(targetUserId);
      closeChat();
      setNotice('User blocked. New messages and connections between you are disabled.');
      await reload(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not block this user.');
    } finally {
      setBusyId('');
    }
  }

  async function markNonAspireComplete(connectionId: string) {
    const state = lifecycleMap.get(connectionId);
    if (state?.viewer_completed) return;
    setBusyId(`complete-${connectionId}`);
    setNotice('');
    try {
      const count = await confirmConnectionCompletion(connectionId);
      if (count >= 2) {
        setNotice('Both people marked this complete. The connection is now in History; review it or choose My Circle if you want to stay in touch.');
        await reload(true);
        setTab('history');
      } else {
        setNotice('You marked this complete. Chat stays open while you wait for the other person.');
        await reload(true);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not mark this connection complete.');
    } finally {
      setBusyId('');
    }
  }

  async function chooseCircle(connectionId: string, keep: boolean) {
    const state = lifecycleMap.get(connectionId);
    if (state?.blocked_between) {
      setNotice('My Circle is unavailable because this connection is blocked for safety.');
      return;
    }
    setBusyId(`circle-${connectionId}`);
    setNotice('');
    try {
      await setCircleChoice(connectionId, keep);
      setNotice(keep
        ? 'Saved. My Circle opens only when both people choose to keep in touch.'
        : 'Circle choice updated.');
      await reload(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update your Circle choice.');
    } finally {
      setBusyId('');
    }
  }

  async function removeCirclePerson(otherUserId: string, otherName: string) {
    const confirmed = window.confirm(
      `Remove ${otherName} from My Circle? Your ongoing Circle chat will close and become read-only. Your previous request history will stay available.`
    );
    if (!confirmed) return;

    const relatedConnectionIds = [...new Set([
      ...connectionData.connections
        .filter((connection) => {
          if (connection.status !== 'completed') return false;
          const otherId = connectionData.userId === connection.requester_id
            ? connection.responder_id
            : connection.requester_id;
          return otherId === otherUserId;
        })
        .map((connection) => connection.id),
      ...circle
        .filter((entry) => entry.other_user_id === otherUserId)
        .map((entry) => entry.connection_id)
    ])];

    if (!relatedConnectionIds.length) {
      setNotice('This Circle connection is no longer available.');
      await reload(true);
      return;
    }

    setBusyId(`circle-remove-${otherUserId}`);
    setNotice('');
    try {
      await Promise.all(relatedConnectionIds.map((connectionId) => setCircleChoice(connectionId, false)));
      if (activeChatOtherId === otherUserId && activeChatConnection?.status === 'completed') {
        closeChat();
      }
      setNotice(`${otherName} was removed from My Circle. The Circle chat is now read-only; your request history is still available.`);
      await reload(true);
      setTab('circle');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not remove this person from My Circle.');
    } finally {
      setBusyId('');
    }
  }

  function setReviewChoice(connectionId: string, choice: boolean) {
    setReviewDrafts((current) => ({
      ...current,
      [connectionId]: { choice, tags: current[connectionId]?.tags || [] }
    }));
  }

  function toggleReviewTag(connectionId: string, tag: string) {
    setReviewDrafts((current) => {
      const draft = current[connectionId] || { choice: true, tags: [] };
      const tags = draft.tags.includes(tag)
        ? draft.tags.filter((item) => item !== tag)
        : [...draft.tags, tag];
      return { ...current, [connectionId]: { ...draft, tags } };
    });
  }

  async function saveReview(connectionId: string) {
    const draft = reviewDrafts[connectionId];
    if (!draft || draft.choice == null) return;
    setBusyId(`review-${connectionId}`);
    setNotice('');
    try {
      await submitConnectionReview(connectionId, draft.choice, draft.tags);
      setNotice('Thanks — your connection review was saved.');
      await reload(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save your review.');
    } finally {
      setBusyId('');
    }
  }

  function renderAftercare(connection: AspireConnection) {
    const state = lifecycleMap.get(connection.id);
    const ownReview = reviews.find((review) => review.connection_id === connection.id && review.reviewer_id === connectionData.userId);
    const draft = reviewDrafts[connection.id] || { choice: null, tags: [] };
    const ownCircleChoice = state?.viewer_circle_choice;

    return (
      <div className="connectionAftercare">
        {state?.blocked_between ? (
          <div className="circleChoiceRow">
            <div><strong>Reconnect disabled</strong><p>My Circle and new messages stay closed when either person has blocked the other.</p></div>
          </div>
        ) : (
          <div className="circleChoiceRow">
            <div><strong>Keep in touch?</strong><p>My Circle opens only if both of you choose it. Until then, this completed chat stays read-only.</p></div>
            <div className="circleChoiceActions">
              <button type="button" className={ownCircleChoice === true ? 'selected' : ''} onClick={() => chooseCircle(connection.id, true)} disabled={busyId === `circle-${connection.id}`}>Keep in my Circle</button>
              <button type="button" className={ownCircleChoice === false ? 'selected muted' : 'muted'} onClick={() => chooseCircle(connection.id, false)} disabled={busyId === `circle-${connection.id}`}>Not now</button>
            </div>
          </div>
        )}

        <div className="reviewRow">
          <div><strong>Would you connect again?</strong><p>This helps Aspire build trust without turning people into a 5-star score.</p></div>
          {ownReview ? (
            <div className="savedReview">
              <b>{ownReview.would_connect_again ? 'Yes ✓' : 'No'}</b>
              {ownReview.tags.length > 0 && <span>{ownReview.tags.map((tag) => reviewTags.find(([key]) => key === tag)?.[1] || tag).join(' · ')}</span>}
            </div>
          ) : (
            <div className="reviewDraft">
              <div className="reviewChoiceButtons">
                <button type="button" className={draft.choice === true ? 'selected' : ''} onClick={() => setReviewChoice(connection.id, true)}>Yes</button>
                <button type="button" className={draft.choice === false ? 'selected' : ''} onClick={() => setReviewChoice(connection.id, false)}>No</button>
              </div>
              {draft.choice === true && (
                <div className="reviewTagList">
                  {reviewTags.map(([key, label]) => (
                    <button type="button" key={key} className={draft.tags.includes(key) ? 'selected' : ''} onClick={() => toggleReviewTag(connection.id, key)}>{label}</button>
                  ))}
                </div>
              )}
              <button type="button" className="saveReviewButton" onClick={() => saveReview(connection.id)} disabled={draft.choice == null || busyId === `review-${connection.id}`}>
                {busyId === `review-${connection.id}` ? 'Saving…' : 'Save review'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="connectionsLoading"><span /><p>Loading your campus activity…</p></div>;
  }

  return (
    <section className="connectionsHub">
      <div className="connectionsHero">
        <div>
          <p className="eyebrow">INBOX</p>
          <h1>Inbox</h1>
          <p>Replies, connections, and private chats.</p>
        </div>
        <div className="connectionsStats">
          <article><strong>{activeConnections.length}</strong><span>active connections</span></article>
          <article><strong>{unreadTotal}</strong><span>unread messages</span></article>
          <article><strong>{circle.length}</strong><span>people in My Circle</span></article>
        </div>
      </div>

      {pendingInvites.length > 0 && (
        <section className="inboxInviteRail" aria-label="New connection invitations">
          <div className="inboxInviteRailHead">
            <div>
              <span>{pendingInvites.length > 1 ? 'NEW INVITES' : 'NEW INVITE'}</span>
              <strong>{pendingInvites.length === 1 ? 'Someone wants to connect with you.' : pendingInvites.length + ' people want to connect with you.'}</strong>
            </div>
            <button type="button" onClick={() => setTab('connections')}>See all</button>
          </div>
          <div className="inboxInviteCards">
            {pendingInvites.slice(0, 3).map((connection) => {
              const request = requestMap.get(connection.request_id);
              const inviter = connectionProfiles.get(connection.requester_id);
              return (
                <article className="inboxInviteCard" key={connection.id}>
                  <div className="inboxInviteAvatar">{profileName(inviter).slice(0, 1).toUpperCase()}</div>
                  <div className="inboxInviteCopy">
                    <span>INVITED YOU TO CONNECT</span>
                    <strong>{profileName(inviter)}</strong>
                    <p>{request?.title || 'Aspire connection'}</p>
                  </div>
                  <div className="inboxInviteActions">
                    <button type="button" className="inboxInviteView" onClick={() => setTab('connections')}>View</button>
                    <button type="button" className="inboxInviteAccept" onClick={() => confirm(connection.id)} disabled={busyId === connection.id}>
                      {busyId === connection.id ? 'Connecting…' : 'Connect'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <div className="connectionsTabs">
        <div className="connectionsTabPrimary">
          <button type="button" className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}>My requests</button>
          <button type="button" className={tab === 'connections' ? 'active' : ''} onClick={() => setTab('connections')}>
            Connections {activeUnreadTotal > 0 && <b className="unreadPill">{activeUnreadTotal}</b>}
          </button>
          <button type="button" className={tab === 'circle' ? 'active' : ''} onClick={() => setTab('circle')}>
            My Circle {circleUnreadTotal > 0 && <b className="unreadPill">{circleUnreadTotal}</b>}
          </button>
          <button type="button" className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
            History {historyUnreadTotal > 0 && <b className="unreadPill">{historyUnreadTotal}</b>}
          </button>
        </div>
        <div className="connectionsTabTools">
          <NotificationCenter
            userId={connectionData.userId}
            onShowRequests={() => setTab('requests')}
            onShowConnections={() => setTab('connections')}
            onOpenChat={(connectionId) => { void openChat(connectionId); }}
          />
          <a href="/discover">Discover requests ↗</a>
        </div>
      </div>

      {notice && <div className="connectionsNotice" role="status">{notice}</div>}

      {tab === 'requests' && (
        <div className="requestInbox">
          {!inbox.requests.length && (
            <div className="connectionsEmpty">
              <strong>No requests yet.</strong>
              <p>Post what you need and responses will show up here.</p>
              <a className="button buttonGold" href="/post">Post a request</a>
            </div>
          )}
          {inbox.requests.map((request) => {
            const responses = inbox.responses.filter((response) => response.request_id === request.id);
            return (
              <article className="inboxRequest" key={request.id}>
                <div className="inboxRequestHeader">
                  <div>
                    <span>{request.category.toUpperCase()} · {request.kind.replace('_', ' ').toUpperCase()}</span>
                    <h2>{request.title}</h2>
                    <p>{request.campus || 'Campus'} · {money(request)}</p>
                  </div>
                  <strong className={`requestStatus status-${request.status}`}>{request.status.replace('_', ' ')}</strong>
                </div>
                <div className="responseList">
                  {!responses.length && <p className="noResponses">No responses yet. Your request is still visible while it is open.</p>}
                  {responses.map((response) => {
                    const profile = inboxProfiles.get(response.responder_id);
                    return (
                      <div className="responseRow" key={response.id}>
                        <div className="responseAvatar">{profileName(profile).slice(0, 1).toUpperCase()}</div>
                        <div className="responseCopy">
                          <strong>{profileName(profile)}</strong>
                          <span>{profile?.school || 'Student'} · {response.status}</span>
                          <p>{response.message || 'I can help with this.'}</p>
                        </div>
                        {request.status === 'open' && response.status === 'pending'
                          ? <button type="button" onClick={() => accept(response.id)} disabled={busyId === response.id}>Choose</button>
                          : <span className="responseState">{response.status}</span>}
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {tab === 'connections' && (
        <div className="connectionList">
          {!activeConnections.length && (
            <div className="connectionsEmpty">
              <strong>No active connections.</strong>
              <p>Completed and cancelled connections move to History instead of staying in your live inbox.</p>
              <a className="button buttonGold" href="/discover">Discover requests</a>
            </div>
          )}
          {activeConnectionGroups.map((group) => {
            const other = connectionProfiles.get(group.otherId);
            const groupUnread = group.connections.reduce((sum, connection) => sum + (unread[connection.id] || 0), 0);
            const firstRequest = requestMap.get(group.connections[0]?.request_id || '');
            return (
              <section className={`connectionPersonGroup ${groupUnread ? 'hasUnread' : ''}`} key={group.otherId}>
                <header className="connectionPersonGroupHead">
                  <div className="connectionGroupIdentity">
                    <i>{profileName(other).slice(0, 1).toUpperCase()}</i>
                    <div>
                      <span>CONNECTED WITH</span>
                      <strong>{profileName(other)}</strong>
                      <small>{other?.school || firstRequest?.campus || 'Campus'}</small>
                    </div>
                  </div>
                  <div className="connectionGroupCount">
                    <strong>{group.connections.length}</strong>
                    <span>{group.connections.length === 1 ? 'active request' : 'active requests'}</span>
                  </div>
                </header>

                <div className="connectionGroupTasks">
                  {group.connections.map((connection) => {
                    const request = requestMap.get(connection.request_id);
                    const isResponder = connectionData.userId === connection.responder_id;
                    const state = lifecycleMap.get(connection.id);
                    const unreadCount = unread[connection.id] || 0;
                    const mutualConfirmed = Boolean(connection.requester_confirmed && connection.responder_confirmed);
                    const readyToComplete = completionReady(connection, state);
                    const futureStart = startIsFuture(connection);

                    return (
                      <article className={`connectionTaskCard ${unreadCount ? 'hasUnread' : ''}`} key={connection.id}>
                        <div className="connectionTaskMain">
                          <div className="connectionTaskTopline">
                            <span>{request?.category || 'Request'}</span>
                            {unreadCount > 0 && <b>{unreadCount} new</b>}
                          </div>
                          <h2>{request?.title || 'Aspire connection'}</h2>
                          <div className={`connectionTaskState ${connection.coordination_status === 'in_progress' ? 'live' : ''}`}>
                            <i />
                            <strong>{taskStateLabel(connection, state)}</strong>
                            {state?.viewer_completed && state?.other_completed && <span>Both confirmed</span>}
                          </div>
                        </div>

                        {connection.status === 'pending' && (
                          <p className="connectionPendingNote">
                            {isResponder
                              ? 'You were chosen for this request. Confirm to unlock private chat.'
                              : 'You chose this person. Chat opens as soon as they confirm.'}
                          </p>
                        )}

                        <div className="connectionTaskActions">
                          {isResponder && connection.status === 'pending' && (
                            <button type="button" className="button buttonGold" onClick={() => confirm(connection.id)} disabled={busyId === connection.id}>Confirm & connect</button>
                          )}

                          {['confirmed', 'active'].includes(connection.status) && (
                            <button type="button" className="button buttonGold chatButton" onClick={() => openChat(connection.id, 'connections')}>
                              Message {unreadCount > 0 && <b>{unreadCount}</b>}
                            </button>
                          )}

                          {['confirmed', 'active'].includes(connection.status) && connection.payment_method !== 'aspire' && !state?.viewer_completed && (
                            readyToComplete ? (
                              <button
                                type="button"
                                className="connectionCompleteAction"
                                onClick={() => markNonAspireComplete(connection.id)}
                                disabled={busyId === `complete-${connection.id}`}
                              >
                                {busyId === `complete-${connection.id}`
                                  ? 'Saving…'
                                  : state?.other_completed
                                    ? 'Confirm complete'
                                    : 'Mark complete'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="connectionStartAction"
                                onClick={() => startActivity(connection.id)}
                                disabled={busyId === `start-${connection.id}` || futureStart}
                                title={futureStart && connection.scheduled_start_at ? `Starts ${new Date(connection.scheduled_start_at).toLocaleString()}` : undefined}
                              >
                                {busyId === `start-${connection.id}`
                                  ? 'Starting…'
                                  : futureStart && connection.scheduled_start_at
                                    ? `Starts ${new Date(connection.scheduled_start_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                                    : 'Start activity'}
                              </button>
                            )
                          )}

                          {state?.viewer_completed && !state?.other_completed && <span className="responseState">Waiting for them…</span>}

                          {!['completed', 'cancelled'].includes(connection.status) && (
                            <button type="button" className="connectionCancel" onClick={() => cancel(connection.id)} disabled={busyId === connection.id}>Cancel</button>
                          )}
                          <a href="/safety">Safety ↗</a>
                        </div>

                        {mutualConfirmed && connection.payment_method !== 'aspire' && !state?.viewer_completed && !readyToComplete && !futureStart && (
                          <p className="connectionCompleteHint">Start the activity when you begin. Then “Mark complete” appears here when you’re done.</p>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {tab === 'history' && (
        <div className="connectionList">
          {!historyConnections.length && (
            <div className="connectionsEmpty">
              <strong>History is empty.</strong>
              <p>When a connection is completed or cancelled, it moves here automatically.</p>
              <button type="button" className="button buttonGold" onClick={() => setTab('connections')}>View active connections</button>
            </div>
          )}
          {historyConnections.map((connection) => {
            const request = requestMap.get(connection.request_id);
            const otherId = connectionData.userId === connection.requester_id ? connection.responder_id : connection.requester_id;
            const other = connectionProfiles.get(otherId);
            const inCircle = circleMap.has(connection.id);
            const circleChatId = circleChatByUser.get(otherId) || '';
            const hasCircleRelationship = Boolean(circleChatId);
            const unreadCount = unread[connection.id] || 0;

            return (
              <article className={`connectionCard ${unreadCount ? 'hasUnread' : ''}`} key={connection.id}>
                <div className="connectionCardTop">
                  <span>{connection.status === 'completed' ? 'COMPLETED · ARCHIVED' : 'CANCELLED · ARCHIVED'}</span>
                  <small>{request?.category || 'Request'}</small>
                </div>
                <h2>{request?.title || 'Aspire connection'}</h2>
                <div className="connectionPerson">
                  <i>{profileName(other).slice(0, 1).toUpperCase()}</i>
                  <div><strong>{profileName(other)}</strong><span>{other?.school || request?.campus || 'Campus'}</span></div>
                </div>
                <div className="connectionChecks">
                  <span className="done">{connection.status === 'completed' ? 'Task closed ✓' : 'Connection closed ✓'}</span>
                  {inCircle && <span className="done">In My Circle ✓</span>}
                  {!inCircle && connection.status === 'completed' && <span>Chat archived · read-only</span>}
                </div>

                {connection.status === 'completed' && renderAftercare(connection)}

                <div className="connectionActions">
                  {hasCircleRelationship && circleChatId !== connection.id ? (
                    <>
                      <button type="button" className="button buttonGold chatButton" onClick={() => openChat(circleChatId, 'circle')}>Continue Circle chat</button>
                      <button type="button" className="connectionCancel" onClick={() => openChat(connection.id, 'history')}>
                        View this transcript{unreadCount > 0 ? ` · ${unreadCount} unread` : ''}
                      </button>
                    </>
                  ) : (
                    <button type="button" className={inCircle ? 'button buttonGold chatButton' : 'connectionCancel'} onClick={() => openChat(connection.id, inCircle ? 'circle' : 'history')}>
                      {inCircle ? 'Message in My Circle' : `View transcript${unreadCount > 0 ? ` · ${unreadCount} unread` : ''}`}
                    </button>
                  )}
                  <a href="/safety">Safety ↗</a>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {tab === 'circle' && (
        <div className="circleList">
          {!circleGroups.length && (
            <div className="connectionsEmpty">
              <strong>Your Circle starts after a real connection.</strong>
              <p>Complete a request together, then both choose “Keep in my Circle.” After that, Aspire keeps one ongoing Circle chat per person.</p>
              <button type="button" className="button buttonGold" onClick={() => setTab('history')}>Review completed connections</button>
            </div>
          )}
          {circleGroups.map((group) => {
            const entry = group.entries[0];
            const connection = connectionData.connections.find((item) => item.id === entry.connection_id);
            const request = connection ? requestMap.get(connection.request_id) : undefined;
            const other = connectionProfiles.get(group.otherUserId);
            const unreadCount = group.entries.reduce((sum, item) => sum + (unread[item.connection_id] || 0), 0);
            return (
              <article className="circleCard" key={group.otherUserId}>
                <div className="circleAvatar">{profileName(other).slice(0, 1).toUpperCase()}</div>
                <div className="circleCopy">
                  <span>MY CIRCLE · {other?.school || request?.campus || 'Campus'}</span>
                  <h2>{profileName(other)}</h2>
                  <p>{group.entries.length > 1
                    ? `${group.entries.length} completed connections together. Aspire keeps them under one ongoing Circle conversation.`
                    : `Connected through “${request?.title || 'an Aspire request'}”. You both chose to keep in touch.`}</p>
                </div>
                <div className="circleActions">
                  <button type="button" className="button buttonGold" onClick={() => openChat(group.chatConnectionId, 'circle')}>Message {unreadCount > 0 && <b>{unreadCount}</b>}</button>
                  <a href="/post">Post another request →</a>
                  <button
                    type="button"
                    className="circleRemove"
                    onClick={() => removeCirclePerson(group.otherUserId, profileName(other))}
                    disabled={busyId === `circle-remove-${group.otherUserId}`}
                  >
                    {busyId === `circle-remove-${group.otherUserId}` ? 'Removing…' : 'Remove from My Circle'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {connectedConnectionId && (() => {
        const connection = connectionData.connections.find((item) => item.id === connectedConnectionId);
        if (!connection) return null;
        const request = requestMap.get(connection.request_id);
        const otherId = connectionData.userId === connection.requester_id ? connection.responder_id : connection.requester_id;
        const other = connectionProfiles.get(otherId);
        return (
          <div className="connectionSuccessOverlay" role="dialog" aria-modal="true" aria-label="Connection confirmed">
            <section className="connectionSuccessModal">
              <button className="connectionSuccessClose" type="button" onClick={() => setConnectedConnectionId(null)} aria-label="Close">×</button>
              <div className="connectionSuccessPeople" aria-hidden="true">
                <i>{profileName(other).slice(0,1).toUpperCase()}</i>
                <b>↔</b>
                <i>{connectionData.userId ? 'YOU' : 'Y'}</i>
              </div>
              <span>CONNECTION CONFIRMED</span>
              <h2>You’re connected!</h2>
              <p>You and <strong>{profileName(other)}</strong> can now coordinate privately{request?.title ? <> for <b>{request.title}</b></> : null}.</p>
              <div className="connectionSuccessSteps" aria-label="Connection progress">
                <div className="active"><i>✓</i><span>Connected</span></div>
                <div><i>2</i><span>Chat</span></div>
                <div><i>3</i><span>Coordinate</span></div>
                <div><i>4</i><span>Complete</span></div>
              </div>
              <button
                className="connectionSuccessPrimary"
                type="button"
                onClick={() => {
                  const id = connectedConnectionId;
                  setConnectedConnectionId(null);
                  if (id) void openChat(id, 'connections');
                }}
              >
                Message now →
              </button>
              <button
                className="connectionSuccessSecondary"
                type="button"
                onClick={() => {
                  setConnectedConnectionId(null);
                  setTab('connections');
                }}
              >
                Open connection
              </button>
            </section>
          </div>
        );
      })()}

      {chatId && (() => {
        const connection = connectionData.connections.find((item) => item.id === chatId);
        const request = connection ? requestMap.get(connection.request_id) : undefined;
        const otherId = connection ? (connectionData.userId === connection.requester_id ? connection.responder_id : connection.requester_id) : '';
        const other = connectionProfiles.get(otherId);
        const fromCircle = Boolean(connection && connection.status === 'completed' && circleMap.has(connection.id));
        const writable = canWriteChat(connection);
        const archived = Boolean(connection && ['completed', 'cancelled'].includes(connection.status) && !fromCircle);
        const circleChatId = otherId ? circleChatByUser.get(otherId) || '' : '';
        const hasCircleAlternative = Boolean(circleChatId && circleChatId !== connection?.id);
        return (
          <div className="connectionChatOverlay" role="dialog" aria-modal="true" aria-label={archived ? 'Archived connection transcript' : 'Private connection chat'}>
            <section className="connectionChat">
              <header className="chatHeader">
                <div className="chatIdentity">
                  <i className="chatAvatar">{profileName(other).slice(0, 1).toUpperCase()}</i>
                  <div className="chatIdentityCopy">
                    <span>{fromCircle ? 'MY CIRCLE' : archived ? 'ARCHIVED' : 'CONNECTED'}</span>
                    <strong>{profileName(other)}</strong>
                    {writable && <small className={`chatPresence ${otherOnline ? 'online' : ''}`}><i />{otherOnline ? 'Online now' : 'Offline'}</small>}
                  </div>
                </div>
                <button type="button" onClick={closeChat} aria-label="Close chat">×</button>
              </header>
              <div className="chatContextBar">
                <div>
                  <span>{fromCircle ? 'MY CIRCLE' : 'REQUEST'}</span>
                  <strong>{fromCircle ? `Ongoing conversation with ${profileName(other)}` : request?.title || 'Aspire connection'}</strong>
                </div>
                <small>{archived ? 'Read-only transcript' : fromCircle ? 'One chat per person' : 'Private connection'}</small>
              </div>
              <div className="chatSafetyBar">
                <span>{fromCircle
                  ? 'You both chose to stay in touch.'
                  : archived
                    ? 'This connection is closed and messages are read-only.'
                    : 'Keep plans and payment details in this chat for clarity.'}{' '}
                <a href="/safety">Safety ↗</a></span>
                {otherId && <div className="chatSafetyActions">
                  <button type="button" onClick={() => reportChat(chatId, otherId)} disabled={busyId === `report-${chatId}`}>Report</button>
                  <button type="button" className="danger" onClick={() => blockChatUser(chatId, otherId)} disabled={busyId === `block-${chatId}`}>Block</button>
                </div>}
              </div>
              <div className="chatMessages" ref={chatMessagesRef}>
                {connection && (
                  <ConnectionEventTimeline connectionId={connection.id} userId={connectionData.userId} otherName={profileName(other)} />
                )}
                {!messages.length && (
                  <div className="chatEmpty">
                    <i aria-hidden="true">{archived ? '✓' : '↔'}</i>
                    <strong>{archived ? 'No messages in this connection.' : 'You’re connected.'}</strong>
                    <p>{archived ? 'This transcript is read-only.' : `Send ${profileName(other)} the details you need to get started.`}</p>
                    {!archived && (
                      <div className="chatPromptChips" aria-hidden="true">
                        <span>Where?</span>
                        <span>When?</span>
                        <span>Details?</span>
                      </div>
                    )}
                  </div>
                )}
                {messages.map((message) => (
                  <div key={message.id} className={message.sender_id === connectionData.userId ? 'chatBubble mine' : 'chatBubble'}>
                    <p>{message.body}</p>
                    <small>{new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small>
                  </div>
                ))}
                {writable && otherTyping && (
                  <div className="typingIndicator" aria-live="polite"><i /><i /><i /><span>{profileName(other)} is typing</span></div>
                )}
              </div>
              {writable ? (
                <div className="chatComposerStack">
                  <form className="chatComposer" onSubmit={send}>
                    <input
                      value={chatText}
                      onChange={(event) => changeChatText(event.target.value)}
                      maxLength={2000}
                      placeholder={`Message ${profileName(other)}…`}
                      aria-invalid={Boolean(chatSendError)}
                    />
                    <button type="submit" disabled={busyId === `chat-${chatId}` || !chatText.trim()}>
                      <span>Send</span><i aria-hidden="true">↑</i>
                    </button>
                  </form>
                  {chatSendError && <div className="chatComposerWarning" role="alert"><b>Message not sent.</b><span>{chatSendError}</span></div>}
                </div>
              ) : (
                <div className="chatArchiveBar">
                  <div>
                    <strong>Read-only archive.</strong>
                    <span>{hasCircleAlternative
                      ? `This request is closed, but your Circle conversation with ${profileName(other)} is still open.`
                      : connection?.status === 'completed'
                        ? 'If both of you choose “Keep in my Circle,” messaging reopens there.'
                        : 'This request was cancelled, so this transcript stays read-only.'}</span>
                  </div>
                  {hasCircleAlternative && <button type="button" onClick={() => openChat(circleChatId, 'circle')}>Continue Circle chat →</button>}
                </div>
              )}
            </section>
          </div>
        );
      })()}
    </section>
  );
}
