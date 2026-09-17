'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchCampusFeedRequests, type DiscoverRequest } from '../lib/supabase/discovery';
import { fetchActiveUniversities, type University } from '../lib/supabase/universities';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import AppDock from './AppDock';
import UiIcon from './UiIcon';

type FulfillmentFilter = 'all' | 'campus_pickup' | 'shipping' | 'aspirer_delivery';
type SortMode = 'newest' | 'price_low' | 'price_high';
type MarketplaceItem = DiscoverRequest & {
  fulfillment_methods?: Array<'campus_pickup' | 'shipping' | 'aspirer_delivery'>;
};

function money(cents: number | null | undefined) {
  if (cents == null) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function fulfillmentMethods(item: MarketplaceItem) {
  const explicit = Array.isArray(item.fulfillment_methods) ? item.fulfillment_methods : [];
  if (explicit.length) return explicit;
  if (item.fulfillment_method === 'shipping') return ['shipping'] as const;
  if (item.fulfillment_method === 'aspirer_delivery') return ['aspirer_delivery'] as const;
  return ['campus_pickup'] as const;
}

function fulfillmentLabel(method: string) {
  if (method === 'shipping') return 'Shipping';
  if (method === 'aspirer_delivery') return 'Aspirer delivery';
  return 'Meet up';
}

export default function MarketplaceBrowseV4() {
  const router = useRouter();
  const [campus, setCampus] = useState<University | null>(null);
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [query, setQuery] = useState('');
  const [fulfillment, setFulfillment] = useState<FulfillmentFilter>('all');
  const [sort, setSort] = useState<SortMode>('newest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const supabase = getSupabaseBrowserClient();

    void supabase.auth.getUser().then(async ({ data }) => {
      if (!alive) return;
      if (!data.user) {
        router.replace('/login?next=%2Fmarketplace');
        return;
      }

      const [{ data: profile }, universities] = await Promise.all([
        supabase.from('profiles').select('current_campus_id,home_campus_id').eq('id', data.user.id).maybeSingle(),
        fetchActiveUniversities()
      ]);
      if (!alive) return;

      const campusId = profile?.current_campus_id || profile?.home_campus_id;
      const nextCampus = universities.find((entry) => entry.id === campusId) || universities[0] || null;
      setCampus(nextCampus);

      if (nextCampus) {
        const rows = await fetchCampusFeedRequests({ campusId: nextCampus.id, category: 'Buy & sell', limit: 100 });
        if (!alive) return;
        setItems((rows as MarketplaceItem[]).filter((item) =>
          item.kind === 'buy_sell' &&
          item.market_intent === 'sell' &&
          item.payment_method === 'aspire' &&
          item.poster_id !== data.user!.id
        ));
      }
      setLoading(false);
    }).catch((reason) => {
      if (!alive) return;
      setError(reason instanceof Error ? reason.message : 'Could not load the market.');
      setLoading(false);
    });

    return () => { alive = false; };
  }, [router]);

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      const matchesQuery = !needle || `${item.title} ${item.details || ''} ${(item as any).item_condition || ''}`.toLowerCase().includes(needle);
      const methods = fulfillmentMethods(item);
      const matchesFulfillment = fulfillment === 'all' || methods.includes(fulfillment as any);
      return matchesQuery && matchesFulfillment;
    });

    return [...filtered].sort((a, b) => {
      if (sort === 'price_low') return (a.amount_cents || 0) - (b.amount_cents || 0);
      if (sort === 'price_high') return (b.amount_cents || 0) - (a.amount_cents || 0);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [items, query, fulfillment, sort]);

  return (
    <main className="marketBrowsePage">
      <AppDock active="market" />
      <div className="marketBrowseShell">
        <header className="marketBrowseHero">
          <div>
            <p>ASPIRE MARKET · {campus?.short_name || 'CAMPUS'}</p>
            <h1>Buy from students around you.</h1>
            <span>Browse verified campus listings, then choose meetup, shipping, seller delivery, or an Aspirer.</span>
          </div>
          <div className="marketBrowseHeroActions">
            <a className="marketBrowseSell" href="/post?mode=sell"><UiIcon name="plus" /> Sell an item</a>
            <a className="marketBrowseOrders" href="/transactions"><UiIcon name="wallet" /> Orders</a>
          </div>
        </header>

        <section className="marketBrowseToolbar" aria-label="Marketplace filters">
          <label className="marketBrowseSearch">
            <UiIcon name="search" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search items, condition, details…" />
          </label>
          <div className="marketBrowseFilters">
            {([
              ['all', 'All'],
              ['campus_pickup', 'Meet up'],
              ['shipping', 'Shipping'],
              ['aspirer_delivery', 'Aspirer delivery']
            ] as Array<[FulfillmentFilter, string]>).map(([value, label]) => (
              <button key={value} type="button" className={fulfillment === value ? 'active' : ''} onClick={() => setFulfillment(value)}>{label}</button>
            ))}
          </div>
          <label className="marketBrowseSort">
            <span>Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
              <option value="newest">Newest</option>
              <option value="price_low">Price: low to high</option>
              <option value="price_high">Price: high to low</option>
            </select>
          </label>
        </section>

        <div className="marketBrowseMeta">
          <strong>{loading ? 'Loading listings…' : `${visibleItems.length} item${visibleItems.length === 1 ? '' : 's'}`}</strong>
          <span>{campus ? `${campus.short_name} campus marketplace` : 'Campus marketplace'}</span>
        </div>

        {error && <div className="marketBrowseNotice" role="alert">{error}</div>}

        {loading ? (
          <div className="marketBrowseSkeletonGrid" aria-hidden="true">{Array.from({ length: 8 }).map((_, index) => <div key={index} />)}</div>
        ) : visibleItems.length ? (
          <section className="marketBrowseGrid" aria-label="Marketplace listings">
            {visibleItems.map((item) => {
              const media = item.media?.[0]?.public_url || item.cover_image_url;
              const methods = fulfillmentMethods(item);
              const condition = ((item as any).item_condition || 'good').replaceAll('_', ' ');
              return (
                <article className="marketBrowseCard" key={item.id}>
                  <button className="marketBrowseCardHit" type="button" onClick={() => router.push(`/marketplace/checkout?item=${encodeURIComponent(item.id)}`)} aria-label={`Buy ${item.title}`} />
                  <div className="marketBrowseMedia">
                    {media ? <img src={media} alt={item.title} /> : <UiIcon name="tag" />}
                    <span className="marketBrowseBadge">For sale</span>
                  </div>
                  <div className="marketBrowseCardBody">
                    <div className="marketBrowseTitleRow"><h2>{item.title}</h2><strong>{money(item.amount_cents)}</strong></div>
                    <p>{item.details || 'Student marketplace listing.'}</p>
                    <div className="marketBrowseChips">
                      <span className="marketBrowseCondition">{condition}</span>
                      {methods.map((method) => <span key={method}>{fulfillmentLabel(method)}</span>)}
                    </div>
                    <button className="marketBrowseBuy" type="button" onClick={() => router.push(`/marketplace/checkout?item=${encodeURIComponent(item.id)}`)}>View & buy <span>→</span></button>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="marketBrowseEmpty">
            <div className="marketBrowseEmptyIcon"><UiIcon name="cart" /></div>
            <h2>{items.length ? 'No listings match these filters.' : 'No campus listings yet.'}</h2>
            <p>{items.length ? 'Try clearing the search or selecting All.' : 'Be the first student to list something for your campus.'}</p>
            <div>
              {items.length ? <button type="button" onClick={() => { setQuery(''); setFulfillment('all'); }}>Clear filters</button> : null}
              <a href="/post?mode=sell">Sell an item →</a>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
