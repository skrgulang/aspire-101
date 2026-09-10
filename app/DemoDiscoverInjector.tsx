'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildDemoDiscoverRequests, filterDemoDiscoverRequests, isPreviewDemoEnabled } from './demoPreviewPosts';

type FilterState = { query: string; category: any };

export default function DemoDiscoverInjector() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [filter, setFilter] = useState<FilterState>({ query: '', category: 'Anything' });
  const [campus, setCampus] = useState({ id: 'preview-purdue', name: 'Purdue University', cover: '' });

  useEffect(() => {
    if (typeof window === 'undefined' || window.location.pathname !== '/discover' || !isPreviewDemoEnabled()) return;

    let host: HTMLElement | null = null;
    let empty: HTMLElement | null = null;
    let rootObserver: MutationObserver | null = null;
    let bootstrapObserver: MutationObserver | null = null;

    const sync = () => {
      const root = document.querySelector<HTMLElement>('.discoverV2Experience');
      if (!root) return false;

      const input = root.querySelector<HTMLInputElement>('.discoverV2SearchBox input');
      const activeCategory = root.querySelector<HTMLButtonElement>('.discoverV2Categories button.active');
      const nextQuery = input?.value || '';
      const nextCategory = activeCategory?.textContent?.trim() || 'Anything';
      setFilter((current) => current.query === nextQuery && current.category === nextCategory
        ? current
        : { query: nextQuery, category: nextCategory });

      const campusSelect = root.querySelector<HTMLSelectElement>('.discoverCampusPickerControl select');
      const selected = campusSelect?.selectedOptions?.[0];
      if (campusSelect?.value) {
        const nextName = selected?.textContent?.trim() || 'Purdue University';
        setCampus((current) => current.id === campusSelect.value && current.name === nextName
          ? current
          : { ...current, id: campusSelect.value, name: nextName });
      }

      empty = root.querySelector<HTMLElement>('.discoverV2State.empty');

      const realList = root.querySelector<HTMLElement>('.discoverV2List:not([data-preview-demo-host])');
      if (realList) {
        host = realList;
      } else {
        host = root.querySelector<HTMLElement>('[data-preview-demo-host]');
        if (!host && empty) {
          host = document.createElement('div');
          host.className = 'discoverV2List';
          host.dataset.previewDemoHost = 'true';
          empty.before(host);
        }
      }

      if (host) setTarget((current) => current === host ? current : host);

      if (!rootObserver) {
        rootObserver = new MutationObserver(() => sync());
        rootObserver.observe(root, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['class', 'value']
        });
      }

      return true;
    };

    // AppDock can mount before DiscoverRequestsV2 finishes its auth/campus boot.
    // Watch the document until the Browse UI exists so preview cards appear on
    // the first normal page load instead of waiting for the first user click.
    if (!sync()) {
      bootstrapObserver = new MutationObserver(() => {
        if (sync()) {
          bootstrapObserver?.disconnect();
          bootstrapObserver = null;
        }
      });
      bootstrapObserver.observe(document.body, { childList: true, subtree: true });
    }

    const onInteraction = () => window.setTimeout(() => sync(), 0);
    document.addEventListener('input', onInteraction, true);
    document.addEventListener('click', onInteraction, true);

    return () => {
      rootObserver?.disconnect();
      bootstrapObserver?.disconnect();
      document.removeEventListener('input', onInteraction, true);
      document.removeEventListener('click', onInteraction, true);
      const created = document.querySelector<HTMLElement>('[data-preview-demo-host]');
      if (created) created.remove();
      if (empty) empty.style.display = '';
      setTarget(null);
    };
  }, []);

  const items = useMemo(() => {
    const all = buildDemoDiscoverRequests('preview-current-user', campus.id, campus.name, campus.cover);
    return filterDemoDiscoverRequests(all, filter.query, filter.category);
  }, [campus, filter]);

  useEffect(() => {
    if (typeof document === 'undefined' || window.location.pathname !== '/discover') return;
    const root = document.querySelector<HTMLElement>('.discoverV2Experience');
    if (!root) return;
    const emptyState = root.querySelector<HTMLElement>('.discoverV2State.empty');
    if (emptyState) emptyState.style.display = items.length ? 'none' : '';
    const resultCount = root.querySelector<HTMLElement>('.discoverV2ResultMeta strong');
    if (resultCount) {
      const realCount = root.querySelectorAll('.discoverV2Card:not([data-preview-demo="true"])').length;
      const total = realCount + items.length;
      resultCount.textContent = `${total} open ${total === 1 ? 'request' : 'requests'}`;
    }
  }, [items, target]);

  if (!target || !items.length) return null;

  return createPortal(<>{items.map((item) => (
    <article className="discoverV2Card hasMedia" key={item.id} data-preview-demo="true">
      {item.media[0]?.public_url && <div className="discoverV2Media"><img src={item.media[0].public_url} alt="Preview post" /><b>YOUR PREVIEW POST</b></div>}
      <div className="discoverV2CardTop"><div><span>{item.category.toUpperCase()}</span><b>YOUR POST</b></div></div>
      <h2>{item.title}</h2>
      {item.details && <p>{item.details}</p>}
      <div className="discoverV2Meta"><span>Purdue</span><span>Posted by you</span><span>{item.kind === 'split_cost' && item.amount_cents ? `$${item.amount_cents / 100}` : 'Free / community'}</span></div>
      <div className="discoverV2CardActions"><span className="discoverV2QuietAction">Preview activity</span><a className="button buttonGold" href="/activity">Manage post →</a></div>
    </article>
  ))}</>, target);
}
