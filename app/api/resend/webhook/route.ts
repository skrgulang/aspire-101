import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '../../../../lib/server/aspireServer';

export const runtime = 'nodejs';

type ResendWebhookEvent = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[] | string;
    bounce?: {
      type?: string;
      subType?: string;
    };
  };
};

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
const TRACKED_EMAIL_EVENTS = new Set([
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.bounced',
  'email.complained',
  'email.failed',
  'email.suppressed'
]);

function secretKey(secret: string) {
  const encoded = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64');
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function verifyResendSignature(payload: string, request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SIGNING_SECRET?.trim();
  if (!webhookSecret) throw new Error('MISSING_RESEND_WEBHOOK_SECRET');

  const id = request.headers.get('svix-id')?.trim();
  const timestamp = request.headers.get('svix-timestamp')?.trim();
  const signatureHeader = request.headers.get('svix-signature')?.trim();

  if (!id || !timestamp || !signatureHeader) throw new Error('INVALID_RESEND_WEBHOOK_SIGNATURE');

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) throw new Error('INVALID_RESEND_WEBHOOK_SIGNATURE');

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > SIGNATURE_TOLERANCE_SECONDS) {
    throw new Error('STALE_RESEND_WEBHOOK_SIGNATURE');
  }

  const expected = createHmac('sha256', secretKey(webhookSecret))
    .update(`${id}.${timestamp}.${payload}`)
    .digest('base64');

  const signatures = signatureHeader
    .split(/\s+/)
    .map((entry) => entry.split(',', 2))
    .filter(([version, value]) => version === 'v1' && Boolean(value))
    .map(([, value]) => value);

  if (!signatures.some((signature) => safeEqual(signature, expected))) {
    throw new Error('INVALID_RESEND_WEBHOOK_SIGNATURE');
  }

  return id;
}

function extractDomain(value: unknown) {
  if (typeof value !== 'string') return null;
  const match = value.toLowerCase().match(/@([a-z0-9.-]+)(?:>|\s|$)/i);
  return match?.[1]?.replace(/\.$/, '') || null;
}

function recipientDomains(value: unknown) {
  const recipients = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  return Array.from(new Set(recipients.map(extractDomain).filter((domain): domain is string => Boolean(domain))));
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  let webhookMessageId: string;
  try {
    webhookMessageId = verifyResendSignature(rawBody, request);
  } catch (error) {
    if (error instanceof Error && error.message === 'MISSING_RESEND_WEBHOOK_SECRET') {
      return NextResponse.json({ error: 'Email webhook is not configured.' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Invalid email webhook signature.' }, { status: 400 });
  }

  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(rawBody) as ResendWebhookEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid email webhook payload.' }, { status: 400 });
  }

  const eventType = typeof event.type === 'string' ? event.type : '';
  if (!TRACKED_EMAIL_EVENTS.has(eventType)) {
    return NextResponse.json({ received: true, ignored: true });
  }

  const emailId = typeof event.data?.email_id === 'string' ? event.data.email_id : null;
  const domains = recipientDomains(event.data?.to);
  const senderDomain = extractDomain(event.data?.from);
  const bounceType = typeof event.data?.bounce?.type === 'string' ? event.data.bounce.type.slice(0, 100) : null;
  const bounceSubtype = typeof event.data?.bounce?.subType === 'string' ? event.data.bounce.subType.slice(0, 100) : null;

  const supabase = getSupabaseServiceClient();
  const { error } = await supabase.from('resend_webhook_events').insert({
    webhook_message_id: webhookMessageId,
    event_type: eventType,
    email_id: emailId,
    sender_domain: senderDomain,
    recipient_domains: domains,
    event_created_at: event.created_at || null,
    bounce_type: bounceType,
    bounce_subtype: bounceSubtype
  });

  if (error && error.code !== '23505') {
    console.error('[resend-webhook] persistence failed', {
      eventType,
      emailId,
      code: error.code
    });
    return NextResponse.json({ error: 'Could not record email event.' }, { status: 500 });
  }

  if (['email.bounced', 'email.complained', 'email.failed', 'email.suppressed'].includes(eventType)) {
    console.warn('[resend-webhook] delivery attention required', {
      eventType,
      emailId,
      recipientDomains: domains,
      bounceType,
      bounceSubtype
    });
  }

  return NextResponse.json({ received: true, duplicate: error?.code === '23505' });
}
