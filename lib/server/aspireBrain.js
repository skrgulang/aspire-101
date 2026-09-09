const STOPWORDS = new Set(['the','a','an','and','or','to','for','of','in','on','at','with','i','me','my','we','our','you','your','is','are','be','need','want','looking','someone','help','please','can','could']);

export function normalizeBrainText(value = '') {
  return String(value).toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}$]+/gu, ' ').trim();
}

export function brainTokens(value = '') {
  return normalizeBrainText(value).split(/\s+/).filter((token) => token.length >= 2 && !STOPWORDS.has(token));
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
  else if (/\b(buy|sell|selling|wanted|purchase|marketplace|textbook|bike|laptop|monitor|desk|chair)\b/.test(text)) { category = 'Buy & sell'; kind = 'buy_sell'; }

  if (kind === 'buy_sell') {
    if (/\b(sell|selling|for sale)\b/.test(text)) market_intent = 'sell';
    else if (/\b(buy|buying|wanted|looking for|purchase)\b/.test(text)) market_intent = 'wanted';
  }

  const amountMatch = String(message).match(/(?:\$\s*|usd\s*)(\d{1,6}(?:\.\d{1,2})?)/i);
  const amount_cents = amountMatch ? Math.round(Number(amountMatch[1]) * 100) : null;
  return { category, kind, market_intent, amount_cents };
}

export function rankCandidatesForIntent(message, candidates, limit = 12) {
  const queryTokens = new Set(brainTokens(message));
  const hints = inferIntentHints(message);
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
    if (hints.market_intent && item.market_intent === hints.market_intent) score += 3;
    return { item, score, index };
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  const meaningful = scored.filter((entry) => entry.score > 0);
  const selected = meaningful.length ? meaningful : scored;
  return selected.slice(0, limit).map((entry) => entry.item);
}
