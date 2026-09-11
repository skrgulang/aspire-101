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
  subscribeToConnectionMessages
} from '../lib/supabase/connections';
import { useConnectionRealtimeRoom } from '../lib/supabase/connection-realtime';
import { confirmConnectionCompletion } from '../lib/supabase/payments';
import type { AspireRequest } from '../lib/supabase/requests';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
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
    if (!chatId) return;
    const node = chatMessagesRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
  }, [chatId, messages]);

  const inboxProfiles = useMemo(() => new Map(inbox.profiles.map((profile) => [profile.id, profile])), [inbox.profiles]);
  const connectionProfiles = useMemo(() => new Map(connectionData.profiles.map((profile) => [profile.id, profile])), [connectionData.profiles]);
  const requestMap = useMemo(() => new Map(connectionData.requests.map((request) => [request.id, request])), [connectionData.requests]);
  const circleMap = useMemo(() => new Map(circle.map((entry) => [entry.connection_id, entry])), [circle]);
  const lifecycleMap = useMemo(() => new Map(lifecycle.map((state) => [state.connection_id, state])), [lifecycle]);
  const activeConnections = useMemo(
    () => connectionData.connections.filter((connection) => ['pending', 'confirmed', 'active'].includes(connection.status)),
    [connectionData.connections]
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
      await confirmConnection(connectionId);
      setNotice('Connected. Private chat is now open.');
      await reload(true);
      await openChat(connectionId, 'connections');
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

  async function openChat(connectionId: string, preferredTab?: Tab) {
    setTab(preferredTab || homeTabForConnection(connectionId));
    setChatId(connectionId);
    setMessages([]);
    setChatText('');
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
    setChatId(null);
  }

  function changeChatText(value: string) {
    if (!canWriteChat(activeChatConnection)) return;
    setChatText(value);
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
      sendTyping(false);
      await markConnectionRead(chatId, sent.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not send message.');
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
          <p className="eyebrow">YOUR ASPIRE</p>
          <h1>Requests.<br /><span>Connections.</span></h1>
          <p>Connect for the task, close the task cleanly, then choose whether the relationship continues.</p>
        </div>
        <div className="connectionsStats">
          <article><strong>{activeConnections.length}</strong><span>active connections</span></article>
          <article><strong>{unreadTotal}</strong><span>unread messages</span></article>
          <article><strong>{circle.length}</strong><span>people in My Circle</span></article>
        </div>
      </div>

      <div className="connectionsTabs">
        <button type="button" className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}>My requests</button>
        <button type="button" className={tab === 'connections' ? 'active' : ''} onClick={() => setTab('connections')}>
          Connections {activeUnreadTotal > 0 && <b className="unreadPill">{activeUnreadTotal}</b>}
        </button>
        <button type="button" className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          History {historyUnreadTotal > 0 && <b className="unreadPill">{historyUnreadTotal}</b>}
        </button>
        <button type="button" className={tab === 'circle' ? 'active' : ''} onClick={() => setTab('circle')}>
          My Circle {circleUnreadTotal > 0 && <b className="unreadPill">{circleUnreadTotal}</b>}
        </button>
        <NotificationCenter
          userId={connectionData.userId}
          onShowRequests={() => setTab('requests')}
          onShowConnections={() => setTab('connections')}
          onOpenChat={(connectionId) => { void openChat(connectionId); }}
        />
        <a href="/discover">Discover requests ↗</a>
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
                          ? <button type="button" onClick={() => accept(response.id)} disabled={busyId === response.id}>Choose →</button>
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
          {activeConnections.map((connection) => {
            const request = requestMap.get(connection.request_id);
            const otherId = connectionData.userId === connection.requester_id ? connection.responder_id : connection.requester_id;
            const other = connectionProfiles.get(otherId);
            const isResponder = connectionData.userId === connection.responder_id;
            const state = lifecycleMap.get(connection.id);
            const unreadCount = unread[connection.id] || 0;

            return (
              <article className={`connectionCard ${unreadCount ? 'hasUnread' : ''}`} key={connection.id}>
                <div className="connectionCardTop">
                  <span>{connection.status === 'pending' ? 'WAITING FOR MUTUAL CONFIRMATION' : 'ACTIVE CONNECTION'}</span>
                  <small>{request?.category || 'Request'}</small>
                </div>
                <h2>{request?.title || 'Aspire connection'}</h2>
                <div className="connectionPerson">
                  <i>{profileName(other).slice(0, 1).toUpperCase()}</i>
                  <div><strong>{profileName(other)}</strong><span>{other?.school || request?.campus || 'Campus'}</span></div>
                </div>
                <div className="connectionChecks">
                  <span className={connection.requester_confirmed ? 'done' : ''}>Requester chose ✓</span>
                  <span className={connection.responder_confirmed ? 'done' : ''}>Responder confirmed {connection.responder_confirmed ? '✓' : '…'}</span>
                  {state?.viewer_completed && <span className="done">You marked complete ✓</span>}
                  {state?.other_completed && <span className="done">They marked complete ✓</span>}
                </div>

                <div className="connectionActions">
                  {isResponder && connection.status === 'pending' && (
                    <button type="button" className="button buttonGold" onClick={() => confirm(connection.id)} disabled={busyId === connection.id}>Confirm connection</button>
                  )}
                  {['confirmed', 'active'].includes(connection.status) && (
                    <button type="button" className="button buttonGold chatButton" onClick={() => openChat(connection.id, 'connections')}>
                      Open chat {unreadCount > 0 && <b>{unreadCount}</b>}
                    </button>
                  )}
                  {['confirmed', 'active'].includes(connection.status) && connection.payment_method !== 'aspire' && !state?.viewer_completed && (
                    <button type="button" className="connectionCancel" onClick={() => markNonAspireComplete(connection.id)} disabled={busyId === `complete-${connection.id}`}>
                      {busyId === `complete-${connection.id}` ? 'Saving…' : state?.other_completed ? 'They finished · confirm ✓' : 'Mark complete ✓'}
                    </button>
                  )}
                  {state?.viewer_completed && !state?.other_completed && <span className="responseState">Waiting for them to finish…</span>}
                  {!['completed', 'cancelled'].includes(connection.status) && (
                    <button type="button" className="connectionCancel" onClick={() => cancel(connection.id)} disabled={busyId === connection.id}>Cancel</button>
                  )}
                  <a href="/safety">Safety ↗</a>
                </div>
              </article>
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
                  <button type="button" className={inCircle ? 'button buttonGold chatButton' : 'connectionCancel'} onClick={() => openChat(connection.id, inCircle ? 'circle' : 'history')}>
                    {inCircle ? 'Message in My Circle' : `View transcript${unreadCount > 0 ? ` · ${unreadCount} unread` : ''}`}
                  </button>
                  <a href="/safety">Safety ↗</a>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {tab === 'circle' && (
        <div className="circleList">
          {!circle.length && (
            <div className="connectionsEmpty">
              <strong>Your Circle starts after a real connection.</strong>
              <p>Complete a request together, then both choose “Keep in my Circle.” That is the only way a completed chat becomes writable again.</p>
              <button type="button" className="button buttonGold" onClick={() => setTab('history')}>Review completed connections</button>
            </div>
          )}
          {circle.map((entry) => {
            const connection = connectionData.connections.find((item) => item.id === entry.connection_id);
            const request = connection ? requestMap.get(connection.request_id) : undefined;
            const other = connectionProfiles.get(entry.other_user_id);
            const unreadCount = unread[entry.connection_id] || 0;
            return (
              <article className="circleCard" key={entry.connection_id}>
                <div className="circleAvatar">{profileName(other).slice(0, 1).toUpperCase()}</div>
                <div className="circleCopy">
                  <span>MY CIRCLE · {other?.school || request?.campus || 'Campus'}</span>
                  <h2>{profileName(other)}</h2>
                  <p>Connected through “{request?.title || 'an Aspire request'}”. You both chose to keep in touch.</p>
                </div>
                <div className="circleActions">
                  <button type="button" className="button buttonGold" onClick={() => openChat(entry.connection_id, 'circle')}>Message {unreadCount > 0 && <b>{unreadCount}</b>}</button>
                  <a href="/post">Post another request →</a>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {chatId && (() => {
        const connection = connectionData.connections.find((item) => item.id === chatId);
        const request = connection ? requestMap.get(connection.request_id) : undefined;
        const otherId = connection ? (connectionData.userId === connection.requester_id ? connection.responder_id : connection.requester_id) : '';
        const other = connectionProfiles.get(otherId);
        const fromCircle = Boolean(connection && connection.status === 'completed' && circleMap.has(connection.id));
        const writable = canWriteChat(connection);
        const archived = Boolean(connection && ['completed', 'cancelled'].includes(connection.status) && !fromCircle);
        return (
          <div className="connectionChatOverlay" role="dialog" aria-modal="true" aria-label={archived ? 'Archived connection transcript' : 'Private connection chat'}>
            <section className="connectionChat">
              <header>
                <div>
                  <span>{fromCircle ? 'MY CIRCLE · REAL-TIME CHAT' : archived ? 'ARCHIVED CONNECTION · READ-ONLY' : 'PRIVATE CONNECTION · LIVE'}</span>
                  <strong>{profileName(other)} · {request?.title || 'Aspire chat'}</strong>
                  {writable && <small className={`chatPresence ${otherOnline ? 'online' : ''}`}><i />{otherOnline ? 'Online now' : 'Offline'}</small>}
                </div>
                <button type="button" onClick={closeChat} aria-label="Close chat">×</button>
              </header>
              <div className="chatSafetyBar">
                {fromCircle
                  ? 'You both chose to keep in touch after completing a connection.'
                  : archived
                    ? 'This connection is closed. The transcript stays available for your records, but new messages are disabled.'
                    : 'Both sides confirmed. Keep timing, location, scope, and money clear.'}{' '}
                <a href="/safety">Safety center ↗</a>
              </div>
              <div className="chatMessages" ref={chatMessagesRef}>
                {connection && (
                  <ConnectionEventTimeline connectionId={connection.id} userId={connectionData.userId} otherName={profileName(other)} />
                )}
                {!messages.length && (
                  <div className="chatEmpty">
                    <strong>{archived ? 'No messages in this archived connection.' : 'You\'re connected.'}</strong>
                    <p>{archived ? 'The connection is closed, so there is nothing else to send here.' : 'Start with the details that matter: where, when, what, and how much if money is involved.'}</p>
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
                <form className="chatComposer" onSubmit={send}>
                  <input
                    value={chatText}
                    onChange={(event) => changeChatText(event.target.value)}
                    maxLength={2000}
                    placeholder={fromCircle ? `Message ${profileName(other)}…` : 'Message about the request…'}
                  />
                  <button type="submit" disabled={busyId === `chat-${chatId}` || !chatText.trim()}>Send ↑</button>
                </form>
              ) : (
                <div className="chatSafetyBar">
                  Read-only archive. {connection?.status === 'completed' ? 'If both of you choose “Keep in my Circle,” messaging reopens there.' : 'Cancelled connections cannot be reopened for messaging.'}
                </div>
              )}
            </section>
          </div>
        );
      })()}
    </section>
  );
}