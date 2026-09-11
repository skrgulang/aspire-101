const STOPWORDS = new Set(['the','a','an','and','or','to','for','of','in','on','at','with','i','me','my','we','our','you','your','is','are','be','need','want','looking','someone','help','please','can','could']);

export function normalizeBrainText(value = '') {
  return String(value).toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}$]+/gu, ' ').trim();
}

export function brainTokens(value = '') {
  return normalizeBrainText(value).split(/\s+/).filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

const NAVIGATION_TARGETS = [
  { route: '/discover', labels: ['discover', 'search', 'browse', 'campus feed'] },
  { route: '/post', labels: ['post', 'create post', 'new post', 'make post'] },
  { route: '/connections', labels: ['connections', 'connection', 'messages', 'inbox', 'chat'] },
  { route: '/saved', labels: ['saved', 'bookmarks', 'favorites', 'favourites'] },
  { route: '/profile', labels: ['profile', 'account'] },
  { route: '/money', labels: ['money', 'payments', 'payment', 'payouts', 'wallet'] },
  { route: '/activity', labels: ['activity', 'my activity'] },
  { route: '/safety', labels: ['safety', 'trust and safety'] }
];

export function inferNavigationIntent(message = '') {
  const text = normalizeBrainText(message);
  if (!text || text.length > 90) return null;

  const prefixes = ['open', 'go to', 'take me to', 'show', 'show me', 'view', 'navigate to'];
  for (const target of NAVIGATION_TARGETS) {
    for (const label of target.labels) {
      if (text === label || prefixes.some((prefix) => text === `${prefix} ${label}`)) {
        return { route: target.route, target: label };
      }
    }
  }
  return null;
}

export function inferIntentHints(message = '') {
  const text = normalizeBrainText(message);
  let category = null;
  let kind = null;
  let market_intent = null;

  if (/\b(ride|carpool|drive|airport|uber|lyft)\b/.test(text)) { category = 'Ride'; kind = 'split_cost'; }
  else if (/\b(pickup|pick up|errand|grocer|delivery|fetch)\b/.test(text)) { category = 'Pickup / errand'; kind = 'paid_help'; }
  else if (/\b(move|moving|furniture|carry|lift|搬家)\b/.test(text)) { category = 'Moving / help'; kind = 'paid_help'; }
  else if (/\b(study|tutor|homework|exam|midterm|final|class|math|cs|chem|physics|学习|补习)\b/.test(text)) { category = 'Study'; kind = 'community'; }
  else if (/\b(project|collab|collaborat|teammate|cofounder|developer|designer|hackathon)\b/.test(text)) { category = 'Project / collab'; kind = 'collaboration'; }
  else if (/\b(buy|buying|sell|selling|wanted|purchase|marketplace|textbook|bike|laptop|monitor|desk|chair|wtb|wts|iso)\b/.test(text)) { category = 'Buy & sell'; kind = 'buy_sell'; }

  if (kind === 'buy_sell') {
    if (/\b(sell|selling|for sale|wts)\b/.test(text)) market_intent = 'sell';
    else if (/\b(buy|buying|wanted|looking for|purchase|wtb|iso)\b/.test(text)) market_intent = 'wanted';
  }

  const amountMatch = String(message).match(/(?:\$\s*|usd\s*)(\d{1,6}(?:\.\d{1,2})?)/i);
  const amount_cents = amountMatch ? Math.round(Number(amountMatch[1]) * 100) : null;
  return { category, kind, market_intent, amount_cents };
}

export function rankCandidatesForIntent(message, candidates, limit = 12) {
  const queryTokens = new Set(brainTokens(message));
  const hints = inferIntentHints(message);
  const complementaryMarketIntent = hints.market_intent === 'wanted'
    ? 'sell'
    : hints.market_intent === 'sell'
      ? 'wanted'
      : null;

  const scored = candidates.map((item, index) => {
    const titleTokens = new Set(brainTokens(item.title || ''));
    const detailTokens = new Set(brainTokens(item.details || ''));
    let score = 0;
    for (const token of queryTokens) {
      if (titleTokens.has(token)) score += 4;
      if (detailTokens.has(token)) score += 1;
    }
    if (hints.category && item.category === hints.category) score += 6;
    if (hints.kind && item.kind === hints.kind) score += 4;
    if (complementaryMarketIntent && item.market_intent === complementaryMarketIntent) score += 5;
    else if (hints.market_intent && item.market_intent === hints.market_intent) score -= 2;
    return { item, score, index };
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  const meaningful = scored.filter((entry) => entry.score > 0);
  const selected = meaningful.length ? meaningful : scored;
  return selected.slice(0, limit).map((entry) => entry.item);
}
