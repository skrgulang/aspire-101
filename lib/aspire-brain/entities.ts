import { findKnownLocations } from './campusKnowledge';
import type { AspireIntentName } from './intent';

export type AspireEntities = {
  locations: ReturnType<typeof findKnownLocations>;
  dateText: string;
  timeText: string;
  amountCents: number | null;
  course: string;
  item: string;
  itemCondition: 'new' | 'like_new' | 'good' | 'fair' | 'for_parts' | null;
  priceNegotiable: boolean | null;
};

function normalizeSpaces(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function extractDateText(message: string) {
  const value = message.trim();
  const relative = value.match(/\b(today|tonight|tomorrow|this morning|this afternoon|this evening|this weekend|next week)\b/i);
  if (relative) return relative[1];
  const weekday = value.match(/\b((?:this|next)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (weekday) return normalizeSpaces(weekday[0]);
  const calendar = value.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?\b/i);
  return calendar ? calendar[0] : '';
}

function extractTimeText(message: string) {
  const value = message.trim();
  const clock = value.match(/\b(?:at|around|about|by|before|after)?\s*((?:1[0-2]|0?[1-9])(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?))\b/i);
  if (clock) return normalizeSpaces(clock[1].replace(/\./g, '').toUpperCase());
  const noon = value.match(/\b(noon|midnight)\b/i);
  return noon ? noon[1].toLowerCase() : '';
}

function extractAmountCents(message: string) {
  const prefixed = message.match(/(?:\$\s*|\busd\s*)(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)/i);
  const suffixed = message.match(/\b(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:usd|dollars?|bucks?)\b/i);
  const raw = prefixed?.[1] || suffixed?.[1];
  if (!raw) return null;
  const amount = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

function extractCourse(message: string) {
  const course = message.match(/\b(math|cs|data|stat|stats|econ|physics|chem|bio|ece|ee|me|mgmt)\s*[- ]?([a-z]?\d{1,3}[a-z]?)\b/i);
  if (!course) return '';
  return `${course[1].toUpperCase()} ${course[2].toUpperCase()}`;
}

function trimItemCandidate(value: string) {
  return normalizeSpaces(value)
    .replace(/^(?:my|a|an|the)\s+/i, '')
    .replace(/\s+(?:for|at)\s+(?:\$\s*|usd\s*)?\d[\d,]*(?:\.\d{1,2})?.*$/i, '')
    .replace(/\s+(?:\$\s*|usd\s*)\d[\d,]*(?:\.\d{1,2})?\s*$/i, '')
    .replace(/\b(?:today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.*$/i, '')
    .replace(/[?.!,]+$/g, '')
    .trim();
}

function extractItemCondition(message: string, intent: AspireIntentName): AspireEntities['itemCondition'] {
  if (intent !== 'SELL_ITEM' && intent !== 'FIND_ITEM') return null;
  const value = message.toLowerCase();
  if (/\b(brand new|new in box|nib|sealed|unopened)\b/.test(value)) return 'new';
  if (/\b(like new|lnib|mint)\b/.test(value)) return 'like_new';
  if (/\b(for parts|parts only|not working|broken)\b/.test(value)) return 'for_parts';
  if (/\bfair(?: condition)?\b/.test(value)) return 'fair';
  if (/\bgood(?: condition)?\b/.test(value)) return 'good';
  return null;
}

function extractPriceNegotiable(message: string, intent: AspireIntentName) {
  if (intent !== 'SELL_ITEM' && intent !== 'FIND_ITEM') return null;
  const value = message.toLowerCase();
  if (/\b(obo|or best offer|negotiable|open to offers?)\b/.test(value)) return true;
  if (/\b(firm price|price firm|firm on price|non[- ]negotiable|not negotiable)\b/.test(value)) return false;
  return null;
}

function extractItem(message: string, intent: AspireIntentName) {
  const value = normalizeSpaces(message);
  if (intent === 'SELL_ITEM') {
    const match = value.match(/\b(?:wts|sell|selling|list|listing)\s+(?:my\s+)?(.+?)(?:\s+for\s+(?:\$\s*|usd\s*)?\d|$)/i)
      || value.match(/\b(.+?)\s+for sale\b/i);
    return match ? trimItemCandidate(match[1]) : '';
  }
  if (intent === 'FIND_ITEM') {
    const match = value.match(/\b(?:wtb|looking for|want to buy|need to buy|trying to buy|anyone selling|does anyone have)\s+(?:a\s+|an\s+|the\s+)?(.+)$/i);
    return match ? trimItemCandidate(match[1]) : '';
  }
  return '';
}

export function extractAspireEntities(message: string, intent: AspireIntentName): AspireEntities {
  return {
    locations: findKnownLocations(message),
    dateText: extractDateText(message),
    timeText: extractTimeText(message),
    amountCents: extractAmountCents(message),
    course: extractCourse(message),
    item: extractItem(message, intent),
    itemCondition: extractItemCondition(message, intent),
    priceNegotiable: extractPriceNegotiable(message, intent)
  };
}
