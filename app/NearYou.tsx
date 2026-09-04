'use client';

import { useMemo, useState } from 'react';

type CampusKey = 'Berkeley' | 'Purdue' | 'Rutgers' | 'UC Davis' | 'UCLA';
type Exchange = 'COMMUNITY' | 'PAID HELP' | 'SPLIT COST' | 'BUY & SELL' | 'COLLAB';

type Poster = { name: string; school: string; initial: string; completed: number; reconnect?: string };
type RequestItem = {
  tag: string;
  title: string;
  meta: string;
  value: string;
  distance: number;
  exchange: Exchange;
  action: string;
  poster: Poster;
};

const campuses: Record<CampusKey, { lat: number; lng: number; label: string }> = {
  Berkeley: { lat: 37.8715, lng: -122.2730, label: 'UC Berkeley' },
  Purdue: { lat: 40.4237, lng: -86.9212, label: 'Purdue University' },
  Rutgers: { lat: 40.5008, lng: -74.4474, label: 'Rutgers University' },
  'UC Davis': { lat: 38.5382, lng: -121.7617, label: 'UC Davis' },
  UCLA: { lat: 34.0689, lng: -118.4452, label: 'UCLA' }
};

const joyi: Poster = { name: 'Joyi', school: 'Berkeley', initial: 'J', completed: 8, reconnect: '100% connect again' };
const ryan: Poster = { name: 'Ryan', school: 'Purdue', initial: 'R', completed: 9, reconnect: '96% connect again' };
const tony: Poster = { name: 'Tony', school: 'Rutgers', initial: 'T', completed: 14, reconnect: '93% connect again' };
const lihui: Poster = { name: 'Lihui', school: 'UC Davis', initial: 'L', completed: 6, reconnect: '100% connect again' };
const nathan: Poster = { name: 'Nathan', school: 'Purdue', initial: 'N', completed: 5, reconnect: '100% connect again' };
const newMember: Poster = { name: 'New member', school: 'Campus', initial: 'N', completed: 0 };

const requests: Record<CampusKey, RequestItem[]> = {
  Berkeley: [
    { tag: 'MOVE-IN', title: 'Need help carrying a desk up two flights', meta: 'Today · 3 responses', value: '$30 offered', distance: 0.4, exchange: 'PAID HELP', action: 'I can help', poster: joyi },
    { tag: 'STUDY', title: 'Math 55 study partner before Thursday', meta: 'Tonight · 2 responses', value: 'Study together', distance: 0.7, exchange: 'COMMUNITY', action: 'Join study', poster: joyi },
    { tag: 'MARKET', title: 'Looking for a mini fridge near campus', meta: 'Pickup today · 4 offers', value: 'Under $80', distance: 1.1, exchange: 'BUY & SELL', action: 'Make offer', poster: newMember },
    { tag: 'CAMPUS', title: 'Where do people actually study late?', meta: '8 answers · 3 spots saved', value: 'Local advice', distance: 0.3, exchange: 'COMMUNITY', action: 'Answer', poster: joyi }
  ],
  Purdue: [
    { tag: 'RIDE', title: 'Anyone heading to IND Friday morning?', meta: 'Fri 7:30 AM · 3 interested', value: 'Split ride cost', distance: 0.8, exchange: 'SPLIT COST', action: 'Join ride', poster: ryan },
    { tag: 'PROJECT', title: 'Need a designer for a weekend AI build', meta: 'This weekend · 5 responses', value: 'Build together', distance: 0.5, exchange: 'COLLAB', action: 'I’m interested', poster: nathan },
    { tag: 'CLASSMATES', title: 'Looking for people from my calc section', meta: 'Tonight · 4 classmates', value: 'Study together', distance: 0.6, exchange: 'COMMUNITY', action: 'Join', poster: ryan },
    { tag: 'CAMPUS', title: 'Need someone to help move a chair', meta: 'Today · 2 nearby', value: '$20 offered', distance: 1.2, exchange: 'PAID HELP', action: 'I can help', poster: ryan }
  ],
  Rutgers: [
    { tag: 'CAMPUS', title: 'Best quiet study spot after 10 PM?', meta: '6 answers · just now', value: 'Local advice', distance: 0.4, exchange: 'COMMUNITY', action: 'Answer', poster: tony },
    { tag: 'RIDE', title: 'Ride to Newark airport this weekend?', meta: 'Sat · 2 interested', value: 'Split ride cost', distance: 0.9, exchange: 'SPLIT COST', action: 'Join ride', poster: tony },
    { tag: 'STUDY', title: 'Looking for an econ study group', meta: 'Tonight · 3 responses', value: 'Join in', distance: 1.0, exchange: 'COMMUNITY', action: 'Join group', poster: tony },
    { tag: 'MARKET', title: 'Need a cheap desk lamp', meta: '4 nearby offers', value: 'Under $20', distance: 0.7, exchange: 'BUY & SELL', action: 'Make offer', poster: newMember }
  ],
  'UC Davis': [
    { tag: 'RIDE', title: 'Anyone going toward Sacramento tonight?', meta: 'Today · 2 interested', value: 'Split ride cost', distance: 0.6, exchange: 'SPLIT COST', action: 'Join ride', poster: lihui },
    { tag: 'BIKE', title: 'Need help fixing a bike chain', meta: 'Today · 3 responses', value: '$15 offered', distance: 0.5, exchange: 'PAID HELP', action: 'I can help', poster: lihui },
    { tag: 'STUDY', title: 'Stats review group before Friday?', meta: 'Tonight · 5 responses', value: 'Study together', distance: 0.9, exchange: 'COMMUNITY', action: 'Join study', poster: lihui },
    { tag: 'CAMPUS', title: 'Where can I print late at night?', meta: '7 answers', value: 'Local advice', distance: 0.4, exchange: 'COMMUNITY', action: 'Answer', poster: lihui }
  ],
  UCLA: [
    { tag: 'RIDE', title: 'LAX ride share Friday afternoon?', meta: 'Fri · 4 interested', value: 'Split ride cost', distance: 0.7, exchange: 'SPLIT COST', action: 'Join ride', poster: newMember },
    { tag: 'PROJECT', title: 'Photographer needed for club event', meta: 'This week · 3 responses', value: '$50 offered', distance: 0.9, exchange: 'PAID HELP', action: 'Respond', poster: newMember },
    { tag: 'STUDY', title: 'Need help reviewing linear algebra', meta: 'Tonight · 2 responses', value: '$25 offered', distance: 0.5, exchange: 'PAID HELP', action: 'I can help', poster: newMember },
    { tag: 'MARKET', title: 'Selling a desk and chair set', meta: 'Pickup today · 5 saves', value: '$45', distance: 1.1, exchange: 'BUY & SELL', action: 'Make offer', poster: newMember }
  ]
};

const filters = ['All', 'Study', 'Rides', 'Market', 'Projects', 'Campus help'];
const exchangeIcon: Record<Exchange, string> = { COMMUNITY: '✦', 'PAID HELP': '$', 'SPLIT COST': '↔', 'BUY & SELL': '□', COLLAB: '+' };

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (v: number) => v * Math.PI / 180;
  const r = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

function trustLine(poster: Poster) {
  if (poster.completed === 0) return 'New to Aspire';
  return `${poster.completed} completed${poster.reconnect ? ` · ${poster.reconnect}` : ''}`;
}

export default function NearYou() {
  const [campus, setCampus] = useState<CampusKey>('Berkeley');
  const [filter, setFilter] = useState('All');
  const [distance, setDistance] = useState(10);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [selected, setSelected] = useState<RequestItem | null>(null);

  const visible = useMemo(() => requests[campus].filter((item) => {
    if (item.distance > distance) return false;
    if (filter === 'All') return true;
    if (filter === 'Study') return /STUDY|CLASSMATES/.test(item.tag);
    if (filter === 'Rides') return /RIDE/.test(item.tag);
    if (filter === 'Market') return /MARKET/.test(item.tag);
    if (filter === 'Projects') return /PROJECT/.test(item.tag);
    return /CAMPUS|MOVE-IN|BIKE/.test(item.tag);
  }), [campus, filter, distance]);

  function useLocation() {
    if (!('geolocation' in navigator)) { setLocationStatus('error'); return; }
    setLocationStatus('loading');
    navigator.geolocation.getCurrentPosition((position) => {
      const { latitude, longitude } = position.coords;
      let nearest: CampusKey = 'Berkeley';
      let best = Number.POSITIVE_INFINITY;
      (Object.keys(campuses) as CampusKey[]).forEach((key) => {
        const place = campuses[key];
        const miles = haversineMiles(latitude, longitude, place.lat, place.lng);
        if (miles < best) { best = miles; nearest = key; }
      });
      setCampus(nearest);
      setLocationStatus('ok');
    }, () => setLocationStatus('error'), { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  }

  return (
    <section id="nearby" className="nearYou shell">
      <div className="nearYouHeader">
        <div>
          <p className="eyebrow">WHAT'S HAPPENING AROUND YOU</p>
          <h2>See requests near your campus.</h2>
          <p>Browse first. The card tells you what kind of exchange it is before you respond — community help, paid help, split cost, buying and selling, or collaboration.</p>
        </div>
        <div className="nearLocationBox">
          <span className="nearLocationLabel">YOUR AREA</span>
          <strong>{campuses[campus].label}</strong>
          <button type="button" className="button buttonGold" onClick={useLocation} disabled={locationStatus === 'loading'}>
            {locationStatus === 'loading' ? 'Finding campus…' : locationStatus === 'ok' ? 'Location on ✓' : 'Use my location'}
          </button>
          {locationStatus === 'error' && <small>Location was unavailable. Choose a campus below instead.</small>}
        </div>
      </div>

      <div className="exchangeLegend" aria-label="Aspire interaction types">
        {(['COMMUNITY','PAID HELP','SPLIT COST','BUY & SELL','COLLAB'] as Exchange[]).map((type) => <span key={type}><i>{exchangeIcon[type]}</i>{type}</span>)}
      </div>

      <div className="nearToolbar">
        <select aria-label="Choose campus" value={campus} onChange={(event) => setCampus(event.target.value as CampusKey)}>
          {(Object.keys(campuses) as CampusKey[]).map((key) => <option key={key} value={key}>{campuses[key].label}</option>)}
        </select>
        <select aria-label="Distance" value={distance} onChange={(event) => setDistance(Number(event.target.value))}>
          <option value={2}>Within 2 miles</option><option value={5}>Within 5 miles</option><option value={10}>Within 10 miles</option>
        </select>
        <div className="nearFilters">{filters.map((item) => <button type="button" key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>
      </div>

      <div className="nearGrid">
        {visible.map((item) => (
          <article className="nearRequestCard" key={item.title} onClick={() => setSelected(item)}>
            <div className="nearCardTop"><span>{item.tag}</span><span>{item.distance.toFixed(1)} mi</span></div>
            <div className={`exchangeBadge exchange-${item.exchange.replaceAll(' ','-').replace('&','and').toLowerCase()}`}><i>{exchangeIcon[item.exchange]}</i>{item.exchange}</div>
            <h3>{item.title}</h3>
            <p>{item.meta}</p>
            <div className="nearPoster"><span>{item.poster.initial}</span><div><strong>{item.poster.name} @ {item.poster.school}</strong><small>{trustLine(item.poster)}</small></div></div>
            <div className="nearCardBottom"><strong>{item.value}</strong><button type="button">{item.action} ↗</button></div>
          </article>
        ))}
      </div>

      <div className="nearFeatureStrip" aria-label="Aspire product flow">
        <span><b>01</b> Browse context</span><span><b>02</b> Respond</span><span><b>03</b> Mutual connect</span><span><b>04</b> Chat + confirm details</span>
      </div>

      <div className="nearLoginGate">
        <div><span>READY TO ASK?</span><strong>Posting needs an Aspire account.</strong><p>Browse without logging in. Posting, responding, connecting, private chat, and reviews start after sign-in.</p></div>
        <div><a className="button buttonGold" href="/login">Log in to post <span>↗</span></a><a className="quietLink" href="/signup">Create an account</a></div>
      </div>

      {selected && (
        <div className="nearPreview" role="dialog" aria-label="Request preview">
          <button type="button" aria-label="Close preview" onClick={() => setSelected(null)}>×</button>
          <div className="previewExchange"><i>{exchangeIcon[selected.exchange]}</i><span>{selected.exchange}</span><small>{selected.distance.toFixed(1)} MI AWAY</small></div>
          <h3>{selected.title}</h3><p>{selected.meta}</p><strong>{selected.value}</strong>
          <div className="previewProfile"><span>{selected.poster.initial}</span><div><strong>{selected.poster.name} @ {selected.poster.school}</strong><small>{trustLine(selected.poster)}</small></div></div>
          <div className="previewConsent"><b>Mutual connection first.</b><br/>Send a response. The requester chooses whether to connect, and you confirm before the private room opens.</div>
          {selected.exchange !== 'COMMUNITY' && selected.exchange !== 'COLLAB' && <div className="previewTerms"><b>Before “in progress”</b><span>Confirm price / split</span><span>Confirm scope</span><span>Confirm time + meetup</span></div>}
          <a className="button buttonGold" href="/login">Log in to {selected.action.toLowerCase()} <span>↗</span></a>
          <small className="nearPrototype">Prototype requests + trust signals for the product concept.</small>
        </div>
      )}
    </section>
  );
}
