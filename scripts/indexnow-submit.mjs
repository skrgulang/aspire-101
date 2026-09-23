import { execFileSync } from 'node:child_process';

const BASE_URL = 'https://aspires101.com';
const HOST = 'aspires101.com';
const KEY = '66318b7362514e3aa85c8088937ce433';
const KEY_LOCATION = `${BASE_URL}/${KEY}.txt`;
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/IndexNow';

const routePrefixes = new Map([
  ['app/about/', '/about'],
  ['app/ambassadors/', '/ambassadors'],
  ['app/guidelines/', '/guidelines'],
  ['app/how-it-works/', '/how-it-works'],
  ['app/marketplace/', '/marketplace'],
  ['app/marketplace-rules/', '/marketplace-rules'],
  ['app/privacy/', '/privacy'],
  ['app/resolution-policy/', '/resolution-policy'],
  ['app/safety/', '/safety'],
  ['app/terms/', '/terms'],
  ['app/updates/', '/updates']
]);

const routeFiles = new Map([
  ['app/page.tsx', '/'],
  ['app/MarketingHome.tsx', '/'],
  ['app/MarketingExtras.tsx', '/'],
  ['app/MarketingProductLife.tsx', '/'],
  ['app/GlobalJourney.tsx', '/'],
  ['app/FAQ.tsx', '/'],
  ['app/ambassadors.css', '/ambassadors'],
  ['app/Marketplace.tsx', '/marketplace'],
  ['app/marketplace.css', '/marketplace'],
  ['app/marketplace-v4.css', '/marketplace'],
  ['app/safety-ui.css', '/safety'],
  ['app/updates.css', '/updates']
]);

const submitAllWhenChanged = new Set([
  'app/layout.tsx',
  'app/sitemap.ts',
  'app/robots.ts',
  'app/SiteFooter.tsx',
  '.github/workflows/indexnow.yml',
  'scripts/indexnow-submit.mjs'
]);

function urlsFromSitemap(xml) {
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1].trim());
}

async function fetchSitemapUrls() {
  const response = await fetch(`${BASE_URL}/sitemap.xml`, {
    headers: { 'User-Agent': 'Aspire101-IndexNow/1.0' }
  });
  if (!response.ok) throw new Error(`Could not read sitemap: HTTP ${response.status}`);
  const urls = urlsFromSitemap(await response.text());
  if (!urls.length) throw new Error('Sitemap contained no URLs.');
  return urls;
}

function changedFiles(before, after) {
  if (!before || !after || /^0+$/.test(before)) return [];
  const output = execFileSync('git', ['diff', '--name-only', before, after], { encoding: 'utf8' });
  return output.split('\n').map((item) => item.trim()).filter(Boolean);
}

async function urlsForChangedFiles(before, after) {
  const files = changedFiles(before, after);
  if (!files.length) return [];

  if (files.some((file) => submitAllWhenChanged.has(file))) {
    return fetchSitemapUrls();
  }

  const routes = new Set();
  for (const file of files) {
    const exact = routeFiles.get(file);
    if (exact) routes.add(exact);

    for (const [prefix, route] of routePrefixes.entries()) {
      if (file.startsWith(prefix)) routes.add(route);
    }
  }

  return [...routes].map((route) => `${BASE_URL}${route}`);
}

async function submit(urlList) {
  const uniqueUrls = [...new Set(urlList)].filter((url) => url.startsWith(`${BASE_URL}/`) || url === `${BASE_URL}/`);
  if (!uniqueUrls.length) {
    console.log('IndexNow: no public URLs changed; nothing to submit.');
    return;
  }

  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: HOST,
      key: KEY,
      keyLocation: KEY_LOCATION,
      urlList: uniqueUrls
    })
  });

  const body = await response.text();
  console.log(`IndexNow: HTTP ${response.status}; submitted ${uniqueUrls.length} URL(s).`);
  uniqueUrls.forEach((url) => console.log(`  - ${url}`));

  if (![200, 202].includes(response.status)) {
    throw new Error(`IndexNow rejected the submission: HTTP ${response.status}${body ? ` — ${body}` : ''}`);
  }
}

const args = new Set(process.argv.slice(2));
if (args.has('--all')) {
  await submit(await fetchSitemapUrls());
} else if (args.has('--changed')) {
  await submit(await urlsForChangedFiles(process.env.INDEXNOW_BEFORE, process.env.INDEXNOW_AFTER || process.env.GITHUB_SHA));
} else {
  console.error('Usage: node scripts/indexnow-submit.mjs --all | --changed');
  process.exit(2);
}
