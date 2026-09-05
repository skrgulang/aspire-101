'use client';

import { useEffect, useMemo, useState } from 'react';
import { AspireRequest, fetchOpenRequests, respondToRequest } from '../lib/supabase/requests';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { blockUser, fetchBlockedUserIds, reportSafety, SafetyReason } from '../lib/supabase/safety';

type DeckItem = AspireRequest & { demo?: boolean };
type Category = { label: string; match: (request: DeckItem) => boolean; };

const categories: Category[] = [
  { label: 'Anything', match: () => true },
  { label: 'Get me there', match: (r) => /ride|transport|airport|chicago|indy/i.test(`${r.category} ${r.title}`) },
  { label: 'Pick this up', match: (r) => /pickup|errand|target|costco|order|food|package/i.test(`${r.category} ${r.title}`) },
  { label: 'Give me a hand', match: (r) => /moving|help|desk|chair|carry|furniture/i.test(`${r.category} ${r.title}`) },
  { label: 'Study / class', match: (r) => /study|class|tutor|math|calc|econ/i.test(`${r.category} ${r.title}`) },
  { label: 'Build something', match: (r) => /project|collab|designer|hackathon|build/i.test(`${r.category} ${r.title}`) },
  { label: 'Buy & sell', match: (r) => r.kind === 'buy_sell' || /market|sell|buy|fridge|lamp/i.test(`${r.category} ${r.title}`) }
];

const demoRequests: DeckItem[] = [
  { id: 'demo-ride', poster_id: 'demo', kind: 'split_cost', category: 'Ride', title: 'Anyone heading to IND Friday around 4 PM?', details: 'Leaving from campus. One backpack + carry-on.', campus: 'Purdue University', city: 'West Lafayette', latitude: null, longitude: null, amount_cents: 1800, currency: 'USD', payment_method: 'none', status: 'open', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), demo: true },
  { id: 'demo-pickup', poster_id: 'demo', kind: 'paid_help', category: 'Pickup / errand', title: 'Can someone pick up my Target order before 8?', details: 'Small order, already paid for. I am near campus.', campus: 'Purdue University', city: 'West Lafayette', latitude: null, longitude: null, amount_cents: 1200, currency: 'USD', payment_method: 'in_person', status: 'open', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), demo: true },
  { id: 'demo-move', poster_id: 'demo', kind: 'paid_help', category: 'Moving / help', title: 'Need help moving a desk across campus tomorrow', details: 'About 20 minutes. Desk is already disassembled.', campus: 'UC Berkeley', city: 'Berkeley', latitude: null, longitude: null, amount_cents: 2500, currency: 'USD', payment_method: 'in_person', status: 'open', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), demo: true },
  { id: 'demo-study', poster_id: 'demo', kind: 'community', category: 'Study', title: 'Anyone in Math 55 want to study tonight?', details: 'Library around 7. Mostly proof practice.', campus: 'UC Berkeley', city: 'Berkeley', latitude: null, longitude: null, amount_cents: null, currency: 'USD', payment_method: 'none', status: 'open', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), demo: true },
  { id: 'demo-build', poster_id: 'demo', kind: 'collaboration', category: 'Project / collab', title: 'Need a designer for a weekend AI project', details: 'Hackathon-style build. Looking for someone who wants to ship fast.', campus: 'Purdue University', city: 'West Lafayette', latitude: null, longitude: null, amount_cents: null, currency: 'USD', payment_method: 'none', status: 'open', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), demo: true }
];

const kindLabel: Record<DeckItem['kind'], string> = { community: 'COMMUNITY', paid_help: 'PAID HELP', split_cost: 'SPLIT COST', buy_sell: 'BUY & SELL', collaboration: 'COLLAB' };
const reportReasons: { value: SafetyReason; label: string }[] = [
  { value: 'spam', label: 'Spam / fake request' }, { value: 'scam', label: 'Scam or payment issue' },
  { value: 'harassment', label: 'Harassment' }, { value: 'unsafe', label: 'Unsafe behavior' },
  { value: 'illegal', label: 'Illegal request' }, { value: 'hate', label: 'Hate or abuse' },
  { value: 'sexual', label: 'Sexual misconduct' }, { value: 'other', label: 'Something else' }
];

function priceLabel(item: DeckItem) {
  if (item.kind === 'community') return 'No money expected';
  if (item.kind === 'collaboration') return 'Build together';
  if (item.amount_cents == null) return item.kind === 'split_cost' ? 'Split cost' : 'Set after connect';
  return `$${(item.amount_cents / 100).toFixed(item.amount_cents % 100 === 0 ? 0 : 2)}`;
}

export default function DiscoverRequests() {
  const [items, setItems] = useState<DeckItem[]>(demoRequests);
  const [usingDemo, setUsingDemo] = useState(true);
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [category, setCategory] = useState('Anything');
  const [index, setIndex] = useState(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [reportReason, setReportReason] = useState<SafetyReason>('spam');
  const [reportDetails, setReportDetails] = useState('');

  useEffect(() => {
    Promise.all([fetchOpenRequests(40), fetchBlockedUserIds().catch(() => [])]).then(([data, blocked]) => {
      setBlockedIds(blocked);
      const visible = data.filter((request) => !blocked.includes(request.poster_id));
      if (visible.length) { setItems(visible); setUsingDemo(false); }
    }).catch(() => setUsingDemo(true));
  }, []);

  const filtered = useMemo(() => {
    const rule = categories.find((item) => item.label === category) ?? categories[0];
    return items.filter((item) => !blockedIds.includes(item.poster_id)).filter(rule.match);
  }, [items, category, blockedIds]);

  useEffect(() => { setIndex(0); setMessage(''); setSafetyOpen(false); }, [category]);
  const current = filtered.length ? filtered[index % filtered.length] : null;

  function next() {
    if (!filtered.length) return;
    setIndex((value) => (value + 1) % filtered.length);
    setMessage('');
    setSafetyOpen(false);
  }

  async function requireUser() {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      window.location.href = '/login?next=/discover';
      return false;
    }
    return true;
  }

  async function help() {
    if (!current) return;
    if (current.demo) { setMessage('This is an example request. Real campus requests will work the same way.'); return; }
    if (!await requireUser()) return;
    setBusy(true); setMessage('');
    try {
      await respondToRequest(current.id, 'I can help with this request.');
      setMessage('Response sent. The requester can choose whether to connect.');
      window.setTimeout(next, 700);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send your response.');
    } finally { setBusy(false); }
  }

  async function submitReport() {
    if (!current || current.demo) return;
    if (!await requireUser()) return;
    setBusy(true);
    try {
      await reportSafety({ reason: reportReason, details: reportDetails, targetUserId: current.poster_id, requestId: current.id });
      setSafetyOpen(false); setMessage('Report received. Aspire can review the platform activity connected to this request.'); setReportDetails('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not submit the report.');
    } finally { setBusy(false); }
  }

  async function blockCurrentPoster() {
    if (!current || current.demo) return;
    if (!await requireUser()) return;
    setBusy(true);
    try {
      await blockUser(current.poster_id);
      setBlockedIds((ids) => [...ids, current.poster_id]);
      setSafetyOpen(false); setMessage('Blocked. Requests from this account will be hidden from your discovery feed.');
      window.setTimeout(next, 450);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not block this account.');
    } finally { setBusy(false); }
  }

  return (
    <section className="discoverExperience">
      <div className="discoverTopline">
        <div>
          <p className="eyebrow">DISCOVER CAMPUS</p>
          <h1>Find something<br /><span>you can help with.</span></h1>
          <p>Browse needs one at a time. Skip what is not for you. Respond when it is.</p>
        </div>
        <div className="discoverModeLinks"><a href="/post">I need something</a><a className="active" href="/discover">I can help</a></div>
      </div>

      <div className="discoverCategories" aria-label="Request categories">
        {categories.map((item) => <button key={item.label} className={category === item.label ? 'active' : ''} type="button" onClick={() => setCategory(item.label)}>{item.label}</button>)}
      </div>

      <div className="discoverStage">
        <aside className="discoverSideRail">
          <span>LIVE CAMPUS NEEDS</span><strong>{filtered.length || 0}</strong>
          <small>{usingDemo ? 'example requests while your campus feed fills up' : 'open requests in this view'}</small>
          <div className="discoverSafetyMini"><b>Mutual connect</b><p>Responding does not automatically open chat or commit either person.</p></div>
        </aside>

        <div className="requestDeck" aria-live="polite">
          {current ? (
            <article className={`discoverCard kind-${current.kind}`}>
              <div className="discoverCardGlow" aria-hidden="true" />
              <div className="discoverCardTop">
                <span>{current.category.toUpperCase()}</span>
                <div className="discoverCardTopActions"><span>{usingDemo || current.demo ? 'EXAMPLE' : 'OPEN NOW'}</span>{!current.demo && <button type="button" aria-label="Safety options" onClick={() => setSafetyOpen(true)}>•••</button>}</div>
              </div>
              <div className="discoverExchange">{kindLabel[current.kind]}</div>
              <h2>{current.title}</h2>
              <p>{current.details || 'Open the request to see the details after you connect.'}</p>
              <div className="discoverMeta"><span>◎ {current.campus || 'Campus nearby'}</span><span>◷ {new Date(current.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></div>
              <div className="discoverOffer"><small>CONTEXT</small><strong>{priceLabel(current)}</strong></div>
              <div className="discoverCardFooter"><button type="button" className="discoverSkip" onClick={next}>Skip</button><button type="button" className="discoverHelp" onClick={help} disabled={busy}>{busy ? 'One second…' : 'I can help →'}</button></div>
              {message && <div className="discoverMessage">{message}</div>}
            </article>
          ) : <div className="discoverEmpty"><strong>No requests in this category yet.</strong><p>Try another category or post something your campus can respond to.</p></div>}
          <div className="deckGhost ghostOne" aria-hidden="true" /><div className="deckGhost ghostTwo" aria-hidden="true" />
        </div>

        <aside className="discoverHow">
          <span>HOW IT WORKS</span>
          <div><b>01</b><p>Browse a request.</p></div><div><b>02</b><p>Respond if you can help.</p></div><div><b>03</b><p>Both sides agree before private chat opens.</p></div>
          <a href="/safety">Safety center ↗</a>
        </aside>
      </div>

      {safetyOpen && current && !current.demo && (
        <div className="discoverSafetyOverlay" role="dialog" aria-modal="true" aria-label="Request safety options">
          <div className="discoverSafetySheet">
            <button className="discoverSafetyClose" type="button" onClick={() => setSafetyOpen(false)} aria-label="Close">×</button>
            <p className="eyebrow">REQUEST SAFETY</p>
            <h2>Something off?</h2>
            <p>Reports go to Aspire’s safety queue. Blocking immediately hides this account from your discovery experience.</p>
            <label><span>Why are you reporting this?</span><select value={reportReason} onChange={(event) => setReportReason(event.target.value as SafetyReason)}>{reportReasons.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select></label>
            <label><span>Anything we should know? <em>optional</em></span><textarea rows={3} value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} placeholder="Keep it factual and specific." /></label>
            <div className="discoverSafetyActions"><button type="button" className="discoverBlock" onClick={blockCurrentPoster} disabled={busy}>Block account</button><button type="button" className="button buttonGold" onClick={submitReport} disabled={busy}>Submit report</button></div>
            <small>For immediate danger or emergencies, contact local emergency services or campus safety.</small>
          </div>
        </div>
      )}
    </section>
  );
}
