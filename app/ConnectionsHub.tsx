'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  acceptRequestResponse,
  AspireConnection,
  cancelConnection,
  confirmConnection,
  ConnectionMessage,
  fetchConnectionMessages,
  fetchMyConnections,
  fetchMyRequestInbox,
  PublicProfile,
  RequestResponse,
  sendConnectionMessage
} from '../lib/supabase/connections';
import type { AspireRequest } from '../lib/supabase/requests';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

type Tab = 'requests' | 'connections';

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

export default function ConnectionsHub() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('requests');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState('');
  const [inbox, setInbox] = useState<{ requests: AspireRequest[]; responses: RequestResponse[]; profiles: PublicProfile[] }>({ requests: [], responses: [], profiles: [] });
  const [connectionData, setConnectionData] = useState<{ userId: string; connections: AspireConnection[]; requests: AspireRequest[]; profiles: PublicProfile[] }>({ userId: '', connections: [], requests: [], profiles: [] });
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConnectionMessage[]>([]);
  const [chatText, setChatText] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace('/login?next=/connections');
        return;
      }
      const [nextInbox, nextConnections] = await Promise.all([fetchMyRequestInbox(), fetchMyConnections()]);
      setInbox(nextInbox);
      setConnectionData(nextConnections);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load your Aspire activity.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { reload(); }, [reload]);

  const inboxProfiles = useMemo(() => new Map(inbox.profiles.map((profile) => [profile.id, profile])), [inbox.profiles]);
  const connectionProfiles = useMemo(() => new Map(connectionData.profiles.map((profile) => [profile.id, profile])), [connectionData.profiles]);
  const requestMap = useMemo(() => new Map(connectionData.requests.map((request) => [request.id, request])), [connectionData.requests]);

  async function accept(responseId: string) {
    setBusyId(responseId); setNotice('');
    try {
      await acceptRequestResponse(responseId);
      setNotice('You chose a responder. They still need to confirm before private chat opens.');
      await reload();
      setTab('connections');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not accept this response.');
    } finally { setBusyId(''); }
  }

  async function confirm(connectionId: string) {
    setBusyId(connectionId); setNotice('');
    try {
      await confirmConnection(connectionId);
      setNotice('Connected. Private chat is now open.');
      await reload();
      await openChat(connectionId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not confirm this connection.');
    } finally { setBusyId(''); }
  }

  async function cancel(connectionId: string) {
    setBusyId(connectionId); setNotice('');
    try {
      await cancelConnection(connectionId);
      setNotice('Connection cancelled.');
      if (chatId === connectionId) setChatId(null);
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not cancel this connection.');
    } finally { setBusyId(''); }
  }

  async function openChat(connectionId: string) {
    setChatId(connectionId);
    setMessages([]);
    try {
      setMessages(await fetchConnectionMessages(connectionId));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not open chat.');
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chatId || !chatText.trim()) return;
    setBusyId(`chat-${chatId}`);
    try {
      const sent = await sendConnectionMessage(chatId, chatText);
      setMessages((current) => [...current, sent]);
      setChatText('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not send message.');
    } finally { setBusyId(''); }
  }

  if (loading) return <div className="connectionsLoading"><span /><p>Loading your campus activity…</p></div>;

  return (
    <section className="connectionsHub">
      <div className="connectionsHero">
        <div><p className="eyebrow">YOUR ASPIRE</p><h1>Requests.<br /><span>Connections.</span></h1><p>Interest first. Mutual choice second. Private chat only after both sides say yes.</p></div>
        <div className="connectionsStats"><article><strong>{inbox.requests.length}</strong><span>your requests</span></article><article><strong>{inbox.responses.filter((r) => r.status === 'pending').length}</strong><span>waiting responses</span></article><article><strong>{connectionData.connections.filter((c) => c.status === 'confirmed' || c.status === 'active').length}</strong><span>open connections</span></article></div>
      </div>

      <div className="connectionsTabs"><button type="button" className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}>My requests</button><button type="button" className={tab === 'connections' ? 'active' : ''} onClick={() => setTab('connections')}>Connections</button><a href="/discover">Discover requests ↗</a></div>
      {notice && <div className="connectionsNotice">{notice}</div>}

      {tab === 'requests' ? (
        <div className="requestInbox">
          {!inbox.requests.length && <div className="connectionsEmpty"><strong>No requests yet.</strong><p>Post what you need and responses will show up here.</p><a className="button buttonGold" href="/post">Post a request</a></div>}
          {inbox.requests.map((request) => {
            const responses = inbox.responses.filter((response) => response.request_id === request.id);
            return <article className="inboxRequest" key={request.id}>
              <div className="inboxRequestHeader"><div><span>{request.category.toUpperCase()} · {request.kind.replace('_',' ').toUpperCase()}</span><h2>{request.title}</h2><p>{request.campus || 'Campus'} · {money(request)}</p></div><strong className={`requestStatus status-${request.status}`}>{request.status.replace('_',' ')}</strong></div>
              <div className="responseList">
                {!responses.length && <p className="noResponses">No responses yet. Your request is still visible while it is open.</p>}
                {responses.map((response) => {
                  const profile = inboxProfiles.get(response.responder_id);
                  return <div className="responseRow" key={response.id}>
                    <div className="responseAvatar">{profileName(profile).slice(0,1).toUpperCase()}</div>
                    <div className="responseCopy"><strong>{profileName(profile)}</strong><span>{profile?.school || 'Student'} · {response.status}</span><p>{response.message || 'I can help with this.'}</p></div>
                    {request.status === 'open' && response.status === 'pending' ? <button type="button" onClick={() => accept(response.id)} disabled={busyId === response.id}>Choose →</button> : <span className="responseState">{response.status}</span>}
                  </div>;
                })}
              </div>
            </article>;
          })}
        </div>
      ) : (
        <div className="connectionList">
          {!connectionData.connections.length && <div className="connectionsEmpty"><strong>No connections yet.</strong><p>Respond to a request or choose a responder from one of your own requests.</p><a className="button buttonGold" href="/discover">Discover requests</a></div>}
          {connectionData.connections.map((connection) => {
            const request = requestMap.get(connection.request_id);
            const otherId = connectionData.userId === connection.requester_id ? connection.responder_id : connection.requester_id;
            const other = connectionProfiles.get(otherId);
            const isResponder = connectionData.userId === connection.responder_id;
            const canChat = connection.status === 'confirmed' || connection.status === 'active';
            return <article className="connectionCard" key={connection.id}>
              <div className="connectionCardTop"><span>{connection.status === 'pending' ? 'WAITING FOR MUTUAL CONFIRMATION' : 'CONNECTED'}</span><small>{request?.category || 'Request'}</small></div>
              <h2>{request?.title || 'Aspire connection'}</h2>
              <div className="connectionPerson"><i>{profileName(other).slice(0,1).toUpperCase()}</i><div><strong>{profileName(other)}</strong><span>{other?.school || request?.campus || 'Campus'}</span></div></div>
              <div className="connectionChecks"><span className={connection.requester_confirmed ? 'done' : ''}>Requester chose ✓</span><span className={connection.responder_confirmed ? 'done' : ''}>Responder confirmed {connection.responder_confirmed ? '✓' : '…'}</span></div>
              <div className="connectionActions">
                {isResponder && connection.status === 'pending' && <button type="button" className="button buttonGold" onClick={() => confirm(connection.id)} disabled={busyId === connection.id}>Confirm connection</button>}
                {canChat && <button type="button" className="button buttonGold" onClick={() => openChat(connection.id)}>Open chat</button>}
                {connection.status !== 'cancelled' && <button type="button" className="connectionCancel" onClick={() => cancel(connection.id)} disabled={busyId === connection.id}>Cancel</button>}
                <a href="/safety">Safety ↗</a>
              </div>
            </article>;
          })}
        </div>
      )}

      {chatId && (() => {
        const connection = connectionData.connections.find((item) => item.id === chatId);
        const request = connection ? requestMap.get(connection.request_id) : undefined;
        return <div className="connectionChatOverlay" role="dialog" aria-modal="true" aria-label="Private connection chat">
          <section className="connectionChat">
            <header><div><span>PRIVATE CONNECTION</span><strong>{request?.title || 'Aspire chat'}</strong></div><button type="button" onClick={() => setChatId(null)} aria-label="Close chat">×</button></header>
            <div className="chatSafetyBar">Both sides confirmed. Keep timing, location, scope, and money clear. <a href="/safety">Safety center ↗</a></div>
            <div className="chatMessages">
              {!messages.length && <div className="chatEmpty"><strong>You&apos;re connected.</strong><p>Start with the details that matter: where, when, what, and how much if money is involved.</p></div>}
              {messages.map((message) => <div key={message.id} className={message.sender_id === connectionData.userId ? 'chatBubble mine' : 'chatBubble'}><p>{message.body}</p><small>{new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small></div>)}
            </div>
            <form className="chatComposer" onSubmit={send}><input value={chatText} onChange={(event) => setChatText(event.target.value)} maxLength={2000} placeholder="Message about the request…" /><button type="submit" disabled={busyId === `chat-${chatId}` || !chatText.trim()}>Send ↑</button></form>
          </section>
        </div>;
      })()}
    </section>
  );
}
