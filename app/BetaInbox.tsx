'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  acceptRequestResponse,
  AspireConnection,
  confirmConnection,
  ConnectionMessage,
  fetchConnectionMessages,
  fetchMyConnections,
  fetchMyRequestInbox,
  markConnectionRead,
  PublicProfile,
  RequestResponse,
  sendConnectionMessage
} from '../lib/supabase/connections';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import type { AspireRequest } from '../lib/supabase/requests';

type Tab = 'posts' | 'interested' | 'messages';

type OutboundActivity = {
  responses: RequestResponse[];
  requests: AspireRequest[];
  profiles: PublicProfile[];
};

function profileName(profile?: PublicProfile) {
  return profile?.display_name || profile?.full_name || profile?.name || 'Aspire student';
}

function money(request?: AspireRequest) {
  if (!request) return '';
  if (request.kind === 'community') return 'Community';
  if (request.kind === 'collaboration') return 'Collaboration';
  if (request.amount_cents == null) return '';
  return `$${(request.amount_cents / 100).toFixed(request.amount_cents % 100 ? 2 : 0)}`;
}

function roleLabel(request: AspireRequest | undefined, userId: string) {
  if (!request) return 'Connection';
  const isPoster = request.poster_id === userId;
  if (request.kind === 'buy_sell') {
    const sellerPosted = request.market_intent !== 'wanted';
    if (sellerPosted) return isPoster ? 'You are selling' : 'You are buying';
    return isPoster ? 'You are buying' : 'You are selling';
  }
  return isPoster ? 'You posted this' : 'You responded';
}

function outboundStatus(response: RequestResponse, request?: AspireRequest) {
  if (request?.status === 'cancelled') return { label: 'Listing closed', tone: 'muted' };
  if (response.status === 'pending') return { label: 'Waiting for poster', tone: 'waiting' };
  if (response.status === 'accepted') return { label: 'Selected', tone: 'good' };
  if (response.status === 'declined') return { label: 'Not selected', tone: 'muted' };
  return { label: 'Withdrawn', tone: 'muted' };
}

async function fetchOutboundActivity(userId: string): Promise<OutboundActivity> {
  const supabase = getSupabaseBrowserClient();
  const { data: responseRows, error: responseError } = await supabase
    .from('request_responses')
    .select('*')
    .eq('responder_id', userId)
    .order('created_at', { ascending: false });
  if (responseError) throw responseError;

  const responses = (responseRows ?? []) as RequestResponse[];
  const requestIds = [...new Set(responses.map((row) => row.request_id))];
  if (!requestIds.length) return { responses, requests: [], profiles: [] };

  const { data: requestRows, error: requestError } = await supabase
    .from('requests')
    .select('*')
    .in('id', requestIds);
  if (requestError) throw requestError;
  const requests = (requestRows ?? []) as AspireRequest[];

  const posterIds = [...new Set(requests.map((request) => request.poster_id).filter(Boolean))];
  let profiles: PublicProfile[] = [];
  if (posterIds.length) {
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id,display_name,full_name,name,school,avatar_url')
      .in('id', posterIds);
    profiles = (profileRows ?? []) as PublicProfile[];
  }

  return { responses, requests, profiles };
}

export default function BetaInbox() {
  const [tab, setTab] = useState<Tab>('posts');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [inbox, setInbox] = useState<{ requests: AspireRequest[]; responses: RequestResponse[]; profiles: PublicProfile[] }>({ requests: [], responses: [], profiles: [] });
  const [outbound, setOutbound] = useState<OutboundActivity>({ responses: [], requests: [], profiles: [] });
  const [connectionsData, setConnectionsData] = useState<Awaited<ReturnType<typeof fetchMyConnections>> | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConnectionMessage[]>([]);
  const [chatText, setChatText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setNotice('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (!data.user) {
        window.location.assign('/login?next=/connections');
        return;
      }

      setUserId(data.user.id);
      setEmail(data.user.email || '');
      const [nextInbox, nextConnections, nextOutbound] = await Promise.all([
        fetchMyRequestInbox(),
        fetchMyConnections(),
        fetchOutboundActivity(data.user.id)
      ]);
      setInbox(nextInbox);
      setConnectionsData(nextConnections);
      setOutbound(nextOutbound);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load your Aspire activity.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void load();
    const { data } = supabase.auth.onAuthStateChange(() => {
      setInbox({ requests: [], responses: [], profiles: [] });
      setOutbound({ responses: [], requests: [], profiles: [] });
      setConnectionsData(null);
      setChatId(null);
      setMessages([]);
      void load();
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  const inboxProfileMap = useMemo(() => new Map(inbox.profiles.map((profile) => [profile.id, profile])), [inbox.profiles]);
  const outboundRequestMap = useMemo(() => new Map(outbound.requests.map((request) => [request.id, request])), [outbound.requests]);
  const outboundProfileMap = useMemo(() => new Map(outbound.profiles.map((profile) => [profile.id, profile])), [outbound.profiles]);
  const requestMap = useMemo(() => new Map((connectionsData?.requests ?? []).map((request) => [request.id, request])), [connectionsData]);
  const connectionProfileMap = useMemo(() => new Map((connectionsData?.profiles ?? []).map((profile) => [profile.id, profile])), [connectionsData]);

  const activePosts = useMemo(() => inbox.requests.filter((request) => request.status !== 'cancelled' && request.status !== 'completed'), [inbox.requests]);
  const pastPostCount = inbox.requests.length - activePosts.length;
  const activeConnections = useMemo(() => (connectionsData?.connections ?? []).filter((connection) => connection.status !== 'cancelled' && connection.status !== 'completed'), [connectionsData]);

  async function chooseResponse(responseId: string) {
    setBusy(responseId);
    setNotice('');
    try {
      await acceptRequestResponse(responseId);
      setNotice('Selected. The other student can now confirm the connection.');
      await load();
      setTab('messages');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not choose this response.');
    } finally {
      setBusy('');
    }
  }

  async function confirm(connectionId: string) {
    setBusy(connectionId);
    setNotice('');
    try {
      await confirmConnection(connectionId);
      setNotice('Connected. Private chat is open.');
      await load();
      await openChat(connectionId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not confirm this connection.');
    } finally {
      setBusy('');
    }
  }

  async function openChat(connectionId: string) {
    setTab('messages');
    setChatId(connectionId);
    setMessages([]);
    setChatText('');
    try {
      const next = await fetchConnectionMessages(connectionId);
      setMessages(next);
      await markConnectionRead(connectionId, next[next.length - 1]?.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not open chat.');
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chatId || !chatText.trim()) return;
    setBusy(`chat-${chatId}`);
    try {
      const next = await sendConnectionMessage(chatId, chatText.trim());
      setMessages((current) => current.some((item) => item.id === next.id) ? current : [...current, next]);
      setChatText('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not send message.');
    } finally {
      setBusy('');
    }
  }

  if (loading) {
    return <section className="betaInbox betaInboxLoading"><div className="betaSpinner" /><p>Loading your account…</p><style jsx>{styles}</style></section>;
  }

  const activeChat = activeConnections.find((connection) => connection.id === chatId);
  const activeChatRequest = activeChat ? requestMap.get(activeChat.request_id) : undefined;
  const activeChatOtherId = activeChat ? (activeChat.requester_id === userId ? activeChat.responder_id : activeChat.requester_id) : '';
  const activeChatOther = connectionProfileMap.get(activeChatOtherId);

  return (
    <section className="betaInbox">
      <header className="betaInboxHead">
        <div>
          <p>YOUR ASPIRE</p>
          <h1>Inbox</h1>
          <span>Posts, things you responded to, and messages — separated so you always know which side you are on.</span>
        </div>
        <div className="accountBadge"><small>SIGNED IN AS</small><strong>{email || 'Aspire account'}</strong></div>
      </header>

      <div className="betaNotice"><b>PRIVATE BETA</b><span>Test discovery, interest, connection, and messaging. Real-money Aspire payments are still disabled.</span></div>

      <nav className="betaInboxTabs" aria-label="Inbox views">
        <button className={tab === 'posts' ? 'active' : ''} onClick={() => setTab('posts')}><span>My posts</span><b>{activePosts.length}</b></button>
        <button className={tab === 'interested' ? 'active' : ''} onClick={() => setTab('interested')}><span>Interested</span><b>{outbound.responses.length}</b></button>
        <button className={tab === 'messages' ? 'active' : ''} onClick={() => setTab('messages')}><span>Messages</span><b>{activeConnections.length}</b></button>
      </nav>

      {notice && <div className="betaInboxNotice" role="status">{notice}</div>}

      {tab === 'posts' && (
        <div className="betaList">
          {!activePosts.length && <div className="betaEmpty"><strong>No active posts.</strong><span>Post something and other students' responses will show up here.</span><a href="/post">Post something →</a></div>}
          {activePosts.map((request) => {
            const responses = inbox.responses.filter((response) => response.request_id === request.id);
            return (
              <article className="betaCard" key={request.id}>
                <div className="betaCardTop"><div><small>{request.kind === 'buy_sell' ? (request.market_intent === 'wanted' ? 'YOU ARE LOOKING TO BUY' : 'YOU ARE SELLING') : 'YOU POSTED THIS'}</small><h2>{request.title}</h2><p>{request.campus || 'Campus'}{money(request) ? ` · ${money(request)}` : ''}</p></div><b className="statusPill">{request.status.replace('_', ' ')}</b></div>
                {!responses.length ? <div className="betaSubtle">No one has responded yet.</div> : <div className="betaResponseList">{responses.map((response) => { const profile = inboxProfileMap.get(response.responder_id); return <div className="betaResponse" key={response.id}><div><strong>{profileName(profile)}</strong><span>{profile?.school || 'Student'} · {response.status}</span><p>{response.message || (request.kind === 'buy_sell' ? 'Interested in this item.' : 'Interested in helping.')}</p></div>{request.status === 'open' && response.status === 'pending' ? <button onClick={() => chooseResponse(response.id)} disabled={busy === response.id}>Choose</button> : <b>{response.status}</b>}</div>; })}</div>}
              </article>
            );
          })}
          {pastPostCount > 0 && <div className="pastHint">{pastPostCount} cancelled/completed post{pastPostCount === 1 ? '' : 's'} hidden to keep this screen clean.</div>}
        </div>
      )}

      {tab === 'interested' && (
        <div className="betaList">
          {!outbound.responses.length && <div className="betaEmpty"><strong>Nothing here yet.</strong><span>When you tap “I'm interested” on someone else's post, it will appear here — not under My posts.</span><a href="/discover">Browse campus →</a></div>}
          {outbound.responses.map((response) => {
            const request = outboundRequestMap.get(response.request_id);
            const poster = request ? outboundProfileMap.get(request.poster_id) : undefined;
            const state = outboundStatus(response, request);
            const connection = activeConnections.find((item) => item.request_id === response.request_id && item.responder_id === userId);
            return (
              <article className="betaCard buyerCard" key={response.id}>
                <div className="betaCardTop"><div><small>{request?.kind === 'buy_sell' ? 'YOU ARE THE BUYER / INTERESTED PARTY' : 'YOU RESPONDED'}</small><h2>{request?.title || 'Request no longer available'}</h2><p>{request?.campus || poster?.school || 'Campus'}{request && money(request) ? ` · ${money(request)}` : ''}{poster ? ` · posted by ${profileName(poster)}` : ''}</p></div><b className={`statusPill ${state.tone}`}>{state.label}</b></div>
                <div className="buyerExplanation">This is someone else's post. You did <strong>not</strong> become the owner of it.</div>
                {connection && <button className="primaryAction" onClick={() => setTab('messages')}>{connection.status === 'pending' ? 'Continue connection →' : 'Open messages →'}</button>}
              </article>
            );
          })}
        </div>
      )}

      {tab === 'messages' && (
        <div className="betaList">
          {!activeConnections.length && <div className="betaEmpty"><strong>No active connections.</strong><span>After a poster chooses a response, the connection appears here. Both sides can always see their role.</span><button onClick={() => setTab('interested')}>View Interested</button></div>}
          {activeConnections.map((connection: AspireConnection) => {
            const request = requestMap.get(connection.request_id);
            const otherId = connection.requester_id === userId ? connection.responder_id : connection.requester_id;
            const other = connectionProfileMap.get(otherId);
            const isResponder = connection.responder_id === userId;
            const canChat = connection.status === 'confirmed' || connection.status === 'active';
            return (
              <article className="betaCard connectionSimple" key={connection.id}>
                <div className="betaRole">{roleLabel(request, userId)}</div>
                <h2>{request?.title || 'Aspire connection'}</h2>
                <p>With <strong>{profileName(other)}</strong> · {other?.school || request?.campus || 'Campus'}{request && money(request) ? ` · ${money(request)}` : ''}</p>
                <div className="connectionState"><span>{connection.requester_confirmed ? 'Poster selected ✓' : 'Waiting for poster'}</span><span>{connection.responder_confirmed ? 'You confirmed ✓' : isResponder ? 'Your confirmation needed' : 'Waiting for confirmation'}</span></div>
                <div className="connectionButtons">{isResponder && connection.status === 'pending' && <button className="primaryAction" onClick={() => confirm(connection.id)} disabled={busy === connection.id}>Confirm connection</button>}{canChat && <button className="primaryAction" onClick={() => openChat(connection.id)}>Open chat</button>}<a href="/safety">Safety</a></div>
              </article>
            );
          })}
        </div>
      )}

      {chatId && activeChat && (
        <div className="betaChatOverlay" role="dialog" aria-modal="true">
          <section className="betaChat">
            <header><div><small>{roleLabel(activeChatRequest, userId)}</small><strong>{profileName(activeChatOther)} · {activeChatRequest?.title || 'Aspire chat'}</strong></div><button onClick={() => setChatId(null)} aria-label="Close">×</button></header>
            <div className="betaChatMessages">{!messages.length && <div className="betaChatEmpty">You're connected. Start with where, when, what, and any agreed amount.</div>}{messages.map((message) => <div key={message.id} className={message.sender_id === userId ? 'msg mine' : 'msg'}><p>{message.body}</p><small>{new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small></div>)}</div>
            <form onSubmit={send}><input value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder="Message about this connection…" maxLength={2000} /><button disabled={!chatText.trim() || busy === `chat-${chatId}`}>Send</button></form>
          </section>
        </div>
      )}

      <style jsx>{styles}</style>
    </section>
  );
}

const styles = `
.betaInbox{max-width:980px;margin:0 auto;padding:44px 0 120px}.betaInboxHead{display:flex;justify-content:space-between;gap:28px;align-items:flex-end}.betaInboxHead p{margin:0;color:#ffc21c;font-size:10px;font-weight:900;letter-spacing:.16em}.betaInboxHead h1{margin:7px 0 7px;font-size:48px;letter-spacing:-.055em}.betaInboxHead span{display:block;max-width:620px;color:#8f8779;font-size:14px;line-height:1.55}.accountBadge{min-width:230px;padding:13px 15px;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(255,255,255,.02)}.accountBadge small{display:block;color:#6e675d;font-size:8px;letter-spacing:.12em}.accountBadge strong{display:block;margin-top:5px;font-size:11px;overflow-wrap:anywhere}.betaNotice{margin-top:22px;padding:11px 14px;display:flex;gap:10px;align-items:center;border:1px solid rgba(255,194,28,.18);border-radius:13px;background:rgba(255,194,28,.05);color:#958c7c;font-size:10px}.betaNotice b{color:#ffc21c;font-size:8px;letter-spacing:.12em}.betaInboxTabs{position:sticky;top:12px;z-index:20;margin-top:18px;padding:5px;display:grid;grid-template-columns:repeat(3,1fr);gap:5px;border:1px solid rgba(255,255,255,.08);border-radius:15px;background:rgba(10,9,7,.93);backdrop-filter:blur(16px)}.betaInboxTabs button{min-height:46px;padding:0 14px;display:flex;justify-content:center;align-items:center;gap:8px;border:0;border-radius:11px;background:transparent;color:#81796d;font-weight:800;cursor:pointer}.betaInboxTabs button.active{background:#f5ecd2;color:#0b0905}.betaInboxTabs b{min-width:20px;height:20px;padding:0 6px;display:grid;place-items:center;border-radius:999px;background:rgba(255,255,255,.07);font-size:9px}.betaInboxTabs button.active b{background:rgba(0,0,0,.09)}.betaInboxNotice{margin-top:13px;padding:11px 13px;border:1px solid rgba(255,194,28,.16);border-radius:12px;color:#b6ad9f;background:rgba(255,194,28,.04);font-size:10px}.betaList{display:grid;gap:11px;margin-top:14px}.betaCard{padding:20px;border:1px solid rgba(255,255,255,.075);border-radius:18px;background:#0d0c09}.betaCardTop{display:grid;grid-template-columns:1fr auto;gap:18px;align-items:start}.betaCardTop small,.betaRole{color:#ffc21c;font-size:8px;font-weight:900;letter-spacing:.12em}.betaCard h2{margin:7px 0 5px;font-size:24px;letter-spacing:-.04em}.betaCard p{margin:0;color:#81796d;font-size:10px;line-height:1.45}.statusPill{padding:7px 9px;border-radius:999px;background:rgba(255,194,28,.08);color:#ffc21c;font-size:8px;text-transform:uppercase;white-space:nowrap}.statusPill.muted{background:rgba(255,255,255,.04);color:#777064}.statusPill.good{background:rgba(93,211,145,.08);color:#85dca9}.statusPill.waiting{background:rgba(255,194,28,.08);color:#e8bd55}.betaResponseList{display:grid;gap:7px;margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.06)}.betaResponse{padding:11px 12px;display:flex;justify-content:space-between;gap:14px;align-items:center;border:1px solid rgba(255,255,255,.055);border-radius:13px;background:rgba(255,255,255,.012)}.betaResponse strong{display:block;font-size:11px}.betaResponse span{display:block;margin-top:2px;color:#6f685d;font-size:8px}.betaResponse p{margin-top:5px}.betaResponse button,.primaryAction,.betaEmpty button{min-height:38px;padding:0 13px;border:0;border-radius:10px;background:#ffc21c;color:#111;font-weight:850;cursor:pointer}.betaResponse>b{color:#777064;font-size:8px;text-transform:uppercase}.betaSubtle,.pastHint,.buyerExplanation{margin-top:14px;padding-top:13px;border-top:1px solid rgba(255,255,255,.06);color:#70695e;font-size:9px}.buyerExplanation strong{color:#b9b0a2}.buyerCard .primaryAction{margin-top:14px}.connectionSimple>p strong{color:#d9d0c1}.connectionState{display:flex;flex-wrap:wrap;gap:7px;margin-top:14px}.connectionState span{padding:7px 9px;border:1px solid rgba(255,255,255,.065);border-radius:999px;color:#887f71;font-size:8px}.connectionButtons{display:flex;gap:9px;align-items:center;margin-top:16px;padding-top:13px;border-top:1px solid rgba(255,255,255,.06)}.connectionButtons a{margin-left:auto;color:#837b6f;font-size:9px}.betaEmpty{padding:46px 20px;text-align:center;border:1px dashed rgba(255,255,255,.09);border-radius:17px}.betaEmpty strong{display:block;font-size:20px}.betaEmpty span{display:block;max-width:520px;margin:8px auto 16px;color:#777064;font-size:10px;line-height:1.55}.betaEmpty a{color:#ffc21c;font-size:11px;font-weight:800}.betaInboxLoading{min-height:65vh;display:grid;place-content:center;text-align:center}.betaSpinner{width:30px;height:30px;margin:auto;border:2px solid rgba(255,255,255,.1);border-top-color:#ffc21c;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.betaInboxLoading p{color:#777064;font-size:10px}.betaChatOverlay{position:fixed;inset:0;z-index:140;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.78);backdrop-filter:blur(12px)}.betaChat{width:min(620px,100%);height:min(700px,88vh);display:grid;grid-template-rows:auto 1fr auto;overflow:hidden;border:1px solid rgba(255,255,255,.1);border-radius:22px;background:#0c0b08}.betaChat header{padding:16px 18px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,.07)}.betaChat header small{display:block;color:#ffc21c;font-size:8px;font-weight:900}.betaChat header strong{display:block;margin-top:4px;font-size:13px}.betaChat header button{width:34px;height:34px;border:1px solid rgba(255,255,255,.08);border-radius:50%;background:transparent;color:#9d9587;font-size:20px}.betaChatMessages{padding:16px;overflow-y:auto;display:flex;flex-direction:column;gap:8px}.betaChatEmpty{margin:auto;color:#756e63;font-size:10px;text-align:center}.msg{max-width:78%;align-self:flex-start;padding:10px 12px;border-radius:13px 13px 13px 4px;background:rgba(255,255,255,.05)}.msg.mine{align-self:flex-end;border-radius:13px 13px 4px 13px;background:#ffc21c;color:#111}.msg p{margin:0;font-size:11px;line-height:1.45}.msg small{display:block;margin-top:4px;color:#746d61;font-size:7px}.msg.mine small{color:rgba(0,0,0,.5)}.betaChat form{padding:12px;display:grid;grid-template-columns:1fr auto;gap:8px;border-top:1px solid rgba(255,255,255,.07)}.betaChat input{min-height:46px;padding:0 13px;border:1px solid rgba(255,255,255,.09);border-radius:11px;outline:none;background:#080705;color:#fff}.betaChat form button{min-width:78px;border:0;border-radius:11px;background:#ffc21c;color:#111;font-weight:850}.betaChat form button:disabled{opacity:.4}.primaryAction:disabled,.betaResponse button:disabled{opacity:.5}
@media(max-width:700px){.betaInbox{padding:20px 12px 110px}.betaInboxHead{align-items:flex-start;flex-direction:column;gap:14px}.betaInboxHead h1{font-size:38px}.betaInboxHead span{font-size:12px}.accountBadge{width:100%;min-width:0}.betaNotice{align-items:flex-start;flex-direction:column;gap:4px}.betaInboxTabs{top:8px}.betaInboxTabs button{padding:0 8px;font-size:11px}.betaCard{padding:15px}.betaCardTop{grid-template-columns:1fr;gap:9px}.statusPill{justify-self:start}.betaCard h2{font-size:20px}.betaResponse{align-items:flex-start;flex-direction:column}.connectionButtons{align-items:stretch;flex-direction:column}.connectionButtons a{margin:0}.primaryAction{width:100%}.betaChatOverlay{padding:0}.betaChat{width:100%;height:100%;border-radius:0}}
`;
