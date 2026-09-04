'use client';

import { useMemo, useState } from 'react';

type CampusKey = 'Berkeley' | 'Purdue' | 'Rutgers' | 'UC Davis' | 'UCLA';

type RequestItem = {
  tag: string;
  title: string;
  meta: string;
  price: string;
  distance: number;
};

const campuses: Record<CampusKey, { lat: number; lng: number; label: string }> = {
  Berkeley: { lat: 37.8715, lng: -122.2730, label: 'UC Berkeley' },
  Purdue: { lat: 40.4237, lng: -86.9212, label: 'Purdue University' },
  Rutgers: { lat: 40.5008, lng: -74.4474, label: 'Rutgers University' },
  'UC Davis': { lat: 38.5382, lng: -121.7617, label: 'UC Davis' },
  UCLA: { lat: 34.0689, lng: -118.4452, label: 'UCLA' }
};

const requests: Record<CampusKey, RequestItem[]> = {
  Berkeley: [
    { tag: 'MOVE-IN', title: 'Need help carrying a desk up two flights', meta: 'Today · 3 replies', price: '$30', distance: 0.4 },
    { tag: 'STUDY', title: 'Math 55 study partner before Thursday', meta: 'Tonight · 2 replies', price: 'Study together', distance: 0.7 },
    { tag: 'MARKET', title: 'Looking for a mini fridge near campus', meta: 'Pickup today · 4 offers', price: 'Under $80', distance: 1.1 },
    { tag: 'CAMPUS', title: 'Where do people actually study late?', meta: '8 replies · 3 spots saved', price: 'Local advice', distance: 0.3 }
  ],
  Purdue: [
    { tag: 'RIDE', title: 'Anyone heading to IND Friday morning?', meta: 'Fri 7:30 AM · 3 interested', price: 'Split gas', distance: 0.8 },
    { tag: 'PROJECT', title: 'Need a designer for a weekend AI build', meta: 'This weekend · 5 replies', price: 'Team up', distance: 0.5 },
    { tag: 'CLASSMATES', title: 'Looking for people from my calc section', meta: 'Tonight · 4 replies', price: 'Study together', distance: 0.6 },
    { tag: 'CAMPUS', title: 'Need someone to help move a chair', meta: 'Today · 2 nearby', price: '$20', distance: 1.2 }
  ],
  Rutgers: [
    { tag: 'CAMPUS', title: 'Best quiet study spot after 10 PM?', meta: '6 replies · just now', price: 'Local advice', distance: 0.4 },
    { tag: 'RIDE', title: 'Ride to Newark airport this weekend?', meta: 'Sat · 2 interested', price: 'Split gas', distance: 0.9 },
    { tag: 'STUDY', title: 'Looking for an econ study group', meta: 'Tonight · 3 replies', price: 'Join in', distance: 1.0 },
    { tag: 'MARKET', title: 'Need a cheap desk lamp', meta: '4 nearby offers', price: 'Under $20', distance: 0.7 }
  ],
  'UC Davis': [
    { tag: 'RIDE', title: 'Anyone going toward Sacramento tonight?', meta: 'Today · 2 interested', price: 'Split gas', distance: 0.6 },
    { tag: 'BIKE', title: 'Need help fixing a bike chain', meta: 'Today · 3 replies', price: '$15', distance: 0.5 },
    { tag: 'STUDY', title: 'Stats review group before Friday?', meta: 'Tonight · 5 replies', price: 'Study together', distance: 0.9 },
    { tag: 'CAMPUS', title: 'Where can I print late at night?', meta: '7 replies', price: 'Local advice', distance: 0.4 }
  ],
  UCLA: [
    { tag: 'RIDE', title: 'LAX ride share Friday afternoon?', meta: 'Fri · 4 interested', price: 'Split gas', distance: 0.7 },
    { tag: 'PROJECT', title: 'Photographer needed for club event', meta: 'This week · 3 replies', price: '$50', distance: 0.9 },
    { tag: 'STUDY', title: 'Need help reviewing linear algebra', meta: 'Tonight · 2 replies', price: '$25', distance: 0.5 },
    { tag: 'MARKET', title: 'Selling a desk and chair set', meta: 'Pickup today · 5 saves', price: '$45', distance: 1.1 }
  ]
};

const filters = ['All', 'Study', 'Rides', 'Market', 'Projects', 'Campus help'];

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (v: number) => v * Math.PI / 180;
  const r = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
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
    if (!('geolocation' in navigator)) {
      setLocationStatus('error');
      return;
    }
    setLocationStatus('loading');
    navigator.geolocation.getCurrentPosition((position) => {
      const { latitude, longitude } = position.coords;
      let nearest: CampusKey = 'Berkeley';
      let best = Number.POSITIVE_INFINITY;
      (Object.keys(campuses) as CampusKey[]).forEach((key) => {
        const place = campuses[key];
        const miles = haversineMiles(latitude, longitude, place.lat, place.lng);
        if (miles < best) {
          best = miles;
          nearest = key;
        }
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
          <p>Browse first. Use location or pick a campus manually. Posting, replying, claiming, and chat start after you log in.</p>
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

      <div className="nearToolbar">
        <select aria-label="Choose campus" value={campus} onChange={(event) => setCampus(event.target.value as CampusKey)}>
          {(Object.keys(campuses) as CampusKey[]).map((key) => <option key={key} value={key}>{campuses[key].label}</option>)}
        </select>
        <select aria-label="Distance" value={distance} onChange={(event) => setDistance(Number(event.target.value))}>
          <option value={2}>Within 2 miles</option>
          <option value={5}>Within 5 miles</option>
          <option value={10}>Within 10 miles</option>
        </select>
        <div className="nearFilters">
          {filters.map((item) => <button type="button" key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}
        </div>
      </div>

      <div className="nearGrid">
        {visible.map((item) => (
          <article className="nearRequestCard" key={item.title} onClick={() => setSelected(item)}>
            <div className="nearCardTop"><span>{item.tag}</span><span>{item.distance.toFixed(1)} mi</span></div>
            <h3>{item.title}</h3>
            <p>{item.meta}</p>
            <div className="nearCardBottom"><strong>{item.price}</strong><button type="button">Preview ↗</button></div>
          </article>
        ))}
      </div>

      <div className="nearFeatureStrip" aria-label="Aspire product flow">
        <span><b>01</b> Search nearby</span>
        <span><b>02</b> Claim or reply</span>
        <span><b>03</b> Chat directly</span>
        <span><b>04</b> Track your posts</span>
      </div>

      <div className="nearLoginGate">
        <div><span>READY TO ASK?</span><strong>Posting needs an Aspire account.</strong><p>Browse without logging in. When you want to post, reply, claim a request, or message someone, we’ll ask you to sign in.</p></div>
        <div><a className="button buttonGold" href="/login">Log in to post <span>↗</span></a><a className="quietLink" href="/signup">Create an account</a></div>
      </div>

      {selected && (
        <div className="nearPreview" role="dialog" aria-label="Request preview">
          <button type="button" aria-label="Close preview" onClick={() => setSelected(null)}>×</button>
          <span>{selected.tag} · {selected.distance.toFixed(1)} MI AWAY</span>
          <h3>{selected.title}</h3>
          <p>{selected.meta}</p>
          <strong>{selected.price}</strong>
          <a className="button buttonGold" href="/login">Log in to respond <span>↗</span></a>
        </div>
      )}
    </section>
  );
}
