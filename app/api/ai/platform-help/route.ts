import { NextResponse } from 'next/server';
import { getAuthenticatedUser, getSupabaseServiceClient } from '../../../../lib/server/aspireServer';

export const runtime = 'nodejs';

const model = process.env.ASPIRE_AI_MODEL || 'gpt-5.6-terra';

type PaymentRow = {
  status: string;
  payer_id: string;
  payee_id: string;
  customer_total_cents: number | null;
  provider_net_cents: number | null;
  currency: string | null;
  updated_at: string;
};

type HelpLink = { label: string; href: string };

const platformKnowledge = [
  {
    topic: 'Aspire Protected',
    keywords: ['protected', 'protection', 'protect', 'escrow'],
    answer: 'Aspire Protected applies to eligible payments completed through Pay with Aspire. Stripe processes the payment, Aspire records the transaction state, and eligible seller/provider payout is delayed until the required completion or receipt confirmation. A dispute can pause release. Aspire Protected is not insurance, a product warranty, a physical-safety guarantee, or a legal escrow service.',
    links: [{ label: 'Protection details', href: '/protection' }, { label: 'Aspire Money', href: '/money' }]
  },
  {
    topic: 'Off-platform payments',
    keywords: ['venmo', 'zelle', 'cash app', 'cashapp', 'paypal', 'cash', 'off platform', 'off-platform', 'direct payment', 'in person'],
    answer: 'If people choose to pay directly or in person, Aspire does not process that money and the payment is not Aspire Protected. Aspire transaction service fees apply only when the eligible payment runs through Pay with Aspire.',
    links: [{ label: 'Protection details', href: '/protection' }]
  },
  {
    topic: 'Refunds',
    keywords: ['refund', 'money back', 'return', 'broken', 'not as described'],
    answer: 'A refund is not automatic just because someone requests one. Before handoff, an eligible marketplace order may be cancellable and refundable. After handoff or service activity begins, a refund request can enter payment review. A moderator can review transaction history, messages, photos, handoff/receipt state, and other evidence. If seller/provider funds were already transferred, Aspire must account for that transfer before a customer refund is processed. Card-network disputes are handled separately through Stripe.',
    links: [{ label: 'Aspire Money', href: '/money' }, { label: 'Protection details', href: '/protection' }]
  },
  {
    topic: 'Seller and provider payouts',
    keywords: ['payout', 'seller paid', 'provider paid', 'receive money', 'earnings', 'bank deposit', 'stripe payout'],
    answer: 'Sellers and providers first complete Stripe payout onboarding. For an eligible protected transaction, Aspire releases a Stripe transfer only after the required completion conditions are met and no blocking dispute is open. “Released to Stripe” means Aspire created the transfer to the connected Stripe account; a later bank deposit depends on Stripe and the recipient’s payout settings.',
    links: [{ label: 'Aspire Money', href: '/money' }, { label: 'Payments setup', href: '/profile' }]
  },
  {
    topic: 'Service fees',
    keywords: ['fee', 'fees', 'service fee', 'charge', 'how much does aspire take'],
    answer: 'Aspire shows the applicable platform fee before checkout and snapshots the final fee server-side when the protected payment is created. Direct or in-person payments are not processed by Aspire and are not Aspire Protected.',
    links: [{ label: 'Aspire Money', href: '/money' }]
  },
  {
    topic: 'Marketplace delivery',
    keywords: ['delivery', 'deliver', 'pickup', 'pick up', 'door', 'shipping'],
    answer: 'A seller can offer pickup only. The buyer can pick the item up personally or create a separate campus delivery request. Delivery help can be free, have a fixed amount, or have compensation decided after matching. If money is involved, Pay with Aspire is the protected path; direct payment is explicitly unprotected. The item order and delivery service are separate transactions.',
    links: [{ label: 'Browse campus', href: '/discover' }, { label: 'Post a request', href: '/post' }]
  },
  {
    topic: 'Post moderation',
    keywords: ['pending', 'review', 'moderation', 'approve', 'approved', 'why is my post', 'post not showing'],
    answer: 'New posts are not supposed to become public immediately. They pass content safety checks and remain Pending Review until approved by a human reviewer. High-risk or prohibited content can be blocked or rejected. This applies to normal requests and marketplace listings.',
    links: [{ label: 'Your connections', href: '/connections' }, { label: 'Safety Center', href: '/safety' }]
  },
  {
    topic: 'Marketplace rules',
    keywords: ['sell account', 'game account', 'credential', 'gift card', 'weapon', 'gun', 'prohibited', 'what can i sell', 'allowed item'],
    answer: 'Aspire Market beta is for permitted physical goods. Account credentials, passwords, verification codes, gift-card codes, stolen or counterfeit goods, prohibited or regulated goods, and other disallowed items cannot be facilitated through Aspire.',
    links: [{ label: 'Marketplace rules', href: '/marketplace-rules' }, { label: 'Safety Center', href: '/safety' }]
  },
  {
    topic: 'Connections and My Circle',
    keywords: ['connection', 'connections', 'circle', 'my circle', 'chat', 'message', 'friend'],
    answer: 'Aspire uses mutual connection instead of open random DMs. Someone responds, the request owner chooses them, and the responder confirms before private chat opens. After a completed connection, both people can independently choose Keep in my Circle; the Circle relationship opens only if both choose it.',
    links: [{ label: 'Connections', href: '/connections' }]
  },
  {
    topic: 'Profile photos',
    keywords: ['avatar', 'profile photo', 'profile picture', 'photo', 'picture'],
    answer: 'Profile photos are stored in Aspire’s Supabase storage, while the profile record stores the avatar URL. They are not just local to one browser. Connections can use that saved profile photo in response lists, connection cards, My Circle, and private chat; users without a photo fall back to an initial.',
    links: [{ label: 'Profile', href: '/profile' }, { label: 'Connections', href: '/connections' }]
  },
  {
    topic: 'Aspire Agent',
    keywords: ['agent', 'ai', 'aspire intelligence', 'smart match', 'campus pulse'],
    answer: 'Aspire Agent is the action layer for the platform: it can understand a campus need, look for approved existing matches, prepare an editable request draft, and answer platform questions. Smart Match, Campus Pulse, Connection Copilot, Safety Intelligence, and dispute-assistance features are parts of Aspire Intelligence. Users remain in control of posting, messaging, payments, and dispute decisions.',
    links: [{ label: 'Aspire Intelligence', href: '/intelligence' }]
  },
  {
    topic: 'School and identity verification',
    keywords: ['verify', 'verified', 'school email', 'student', 'identity', 'government id', 'phone'],
    answer: 'Aspire separates school identity, optional higher-trust identity verification, phone verification, account security, and payout readiness. A verified school identity establishes the campus context; higher-trust actions may require additional verification depending on the feature.',
    links: [{ label: 'Profile & verification', href: '/profile' }, { label: 'Safety Center', href: '/safety' }]
  }
] as const;

function money(cents: number | null | undefined, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(Number(cents || 0) / 100);
}

function topicScore(question: string, keywords: readonly string[]) {
  const clean = question.toLowerCase();
  return keywords.reduce((score, keyword) => score + (clean.includes(keyword) ? Math.max(1, keyword.split(' ').length) : 0), 0);
}

function selectKnowledge(question: string) {
  return platformKnowledge
    .map((entry) => ({ entry, score: topicScore(question, entry.keywords) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((item) => item.entry);
}

function payoutCopy(status: string, requirementsDue: number) {
  if (status === 'READY') return 'Your Stripe payout account is ready to receive Aspire transfers.';
  if (status === 'NOT_STARTED') return 'Your payout setup has not been started yet. Open Profile → Payments & earnings to begin Stripe onboarding.';
  if (status === 'ACTION_REQUIRED') return `Stripe still needs information from you${requirementsDue ? ` (${requirementsDue} requirement${requirementsDue === 1 ? '' : 's'})` : ''}. Open Profile → Payments & earnings to continue.`;
  if (status === 'UNDER_REVIEW') return 'Your payout setup is currently under Stripe review.';
  if (status === 'RESTRICTED') return 'Your payout account needs attention before Aspire can release new payouts. Open Profile → Payments & earnings to fix the Stripe requirement.';
  return 'Open Profile → Payments & earnings to check your latest payout status.';
}

function transactionCopy(payment: PaymentRow | undefined, userId: string) {
  if (!payment) return 'You do not have an Aspire protected payment on record yet.';
  const incoming = payment.payee_id === userId;
  const amount = incoming ? payment.provider_net_cents : payment.customer_total_cents;
  const label = incoming ? 'incoming' : 'outgoing';
  const status = payment.status;
  const statusMeaning = status === 'secured'
    ? (incoming ? 'The buyer paid, but the payout is still waiting for the required completion or receipt confirmation.' : 'Your payment is secured and has not been released to the other person yet.')
    : status === 'released'
      ? (incoming ? 'Aspire released the seller/provider transfer to Stripe.' : 'The protected transaction was completed and the recipient transfer was released.')
      : status === 'refunded'
        ? 'The protected payment is marked refunded.'
        : status === 'disputed'
          ? 'This payment is under review and release should remain paused while the dispute is open.'
          : status === 'processing'
            ? 'Stripe is still processing this payment.'
            : status === 'failed'
              ? 'The payment failed and should not be treated as secured.'
              : `The latest transaction status is ${status.replaceAll('_', ' ')}.`;
  return `Your latest ${label} Aspire transaction is ${money(amount, payment.currency || 'USD')} and is currently “${status.replaceAll('_', ' ')}.” ${statusMeaning}`;
}

async function aiAnswer(question: string, context: string) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 650,
      instructions: 'You are Aspire Platform Expert inside Aspire 101. Answer only from the supplied canonical product knowledge and authenticated account snapshot. Be concise, clear, and useful. Never invent a feature, fee, refund guarantee, payment state, verification state, legal protection, or policy. If the supplied information cannot answer the question, say what is not known and point the user to the most relevant Aspire page. Do not call Aspire Protected escrow, insurance, or a guarantee. Never claim an action was taken unless the context explicitly says it was.',
      input: `QUESTION:\n${question}\n\nCANONICAL ASPIRE CONTEXT:\n${context}`
    }),
    cache: 'no-store'
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => ({})) as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  for (const item of payload.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === 'output_text' && typeof part.text === 'string' && part.text.trim()) return part.text.trim();
    }
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const body = await request.json().catch(() => ({})) as { question?: string };
    const question = String(body.question || '').trim();
    if (question.length < 2) return NextResponse.json({ error: 'Ask Aspire a platform question.' }, { status: 400 });
    if (question.length > 1200) return NextResponse.json({ error: 'Keep the question under 1,200 characters.' }, { status: 400 });

    const supabase = getSupabaseServiceClient();
    const [{ data: payout }, { data: payments }] = await Promise.all([
      supabase
        .from('payment_accounts')
        .select('status,transfers_enabled,requirements_due,last_synced_at')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('connection_payments')
        .select('status,payer_id,payee_id,customer_total_cents,provider_net_cents,currency,updated_at')
        .or(`payer_id.eq.${user.id},payee_id.eq.${user.id}`)
        .order('updated_at', { ascending: false })
        .limit(5)
    ]);

    const payoutStatus = String(payout?.status || 'NOT_STARTED');
    const requirementsDue = Number(payout?.requirements_due || 0);
    const paymentRows = (payments ?? []) as PaymentRow[];
    const selected = selectKnowledge(question);
    const lower = question.toLowerCase();
    const asksPayout = /(my|why|where|status|receive|receiving).{0,40}(payout|earnings|receive money|seller paid)|payout.{0,30}(status|pending|ready)/i.test(lower);
    const asksTransaction = /(where|what|why|status|my).{0,40}(payment|refund|money|transaction)|payment.{0,30}(status|pending|protected|released)/i.test(lower);

    const contextParts = selected.length
      ? selected.map((entry) => `${entry.topic}: ${entry.answer}`)
      : platformKnowledge.slice(0, 6).map((entry) => `${entry.topic}: ${entry.answer}`);
    if (asksPayout) contextParts.push(`Authenticated payout snapshot: ${payoutCopy(payoutStatus, requirementsDue)}`);
    if (asksTransaction) contextParts.push(`Authenticated latest transaction snapshot: ${transactionCopy(paymentRows[0], user.id)}`);

    const generated = await aiAnswer(question, contextParts.join('\n\n'));
    let assistantMessage = generated;
    if (!assistantMessage) {
      const base = selected[0]?.answer || 'I can explain Aspire features, payments, protection, refunds, marketplace rules, delivery, moderation, Connections, verification, and Aspire Intelligence. Ask about one of those areas and I’ll use Aspire’s current product rules rather than guessing.';
      const personal = [asksPayout ? payoutCopy(payoutStatus, requirementsDue) : '', asksTransaction ? transactionCopy(paymentRows[0], user.id) : ''].filter(Boolean).join(' ');
      assistantMessage = personal ? `${personal} ${base}` : base;
    }

    const links = new Map<string, HelpLink>();
    selected.forEach((entry) => entry.links.forEach((link) => links.set(link.href, link)));
    if (asksPayout) links.set('/profile', { label: 'Payments setup', href: '/profile' });
    if (asksTransaction) links.set('/money', { label: 'Aspire Money', href: '/money' });
    if (!links.size) {
      links.set('/intelligence', { label: 'Aspire Intelligence', href: '/intelligence' });
      links.set('/safety', { label: 'Safety Center', href: '/safety' });
    }

    return NextResponse.json({
      ok: true,
      mode: asksPayout || asksTransaction ? 'account_help' : 'platform_help',
      sessionId: null,
      status: 'ready',
      assistantMessage,
      plan: null,
      matches: [],
      links: [...links.values()].slice(0, 3)
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'UNKNOWN';
    if (raw === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Sign in again to ask Aspire about your account.' }, { status: 401 });
    return NextResponse.json({ error: 'Aspire could not answer that platform question right now.' }, { status: 500 });
  }
}
