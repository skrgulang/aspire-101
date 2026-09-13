import { ImapFlow } from 'imapflow';
import type { SupabaseClient } from '@supabase/supabase-js';

const defaultTeamEmail = 'team@aspires101.com';
const defaultImapHost = 'mail.privateemail.com';
const defaultImapPort = 993;
const providerName = 'namecheap_private_email';
const lookbackMs = 14 * 24 * 60 * 60 * 1000;

type EmailEventRow = {
  id: string;
  application_id: string;
  recipient: string;
  provider_message_id: string | null;
  created_at: string;
};

function mailboxUser() {
  return (process.env.AMBASSADOR_SMTP_USER || defaultTeamEmail).trim();
}

function imapPort() {
  const configured = Number(process.env.AMBASSADOR_IMAP_PORT || defaultImapPort);
  return Number.isFinite(configured) && configured > 0 ? configured : defaultImapPort;
}

function looksLikeBounce(subject: string, from: string, source: string) {
  const haystack = `${subject}\n${from}\n${source}`.toLowerCase();
  return [
    'delivery status notification',
    'delivery failure',
    'undeliverable',
    'returned mail',
    'mail delivery subsystem',
    'mailer-daemon',
    'recipient address rejected',
    'address not found',
    'user unknown',
    'mailbox unavailable'
  ].some((needle) => haystack.includes(needle));
}

function normalizeMessageId(value: string | null) {
  return (value || '').trim().toLowerCase();
}

export function ambassadorBounceSyncConfigured() {
  return Boolean(mailboxUser() && process.env.AMBASSADOR_SMTP_PASSWORD);
}

export async function syncAmbassadorBounces(supabase: SupabaseClient) {
  if (!ambassadorBounceSyncConfigured()) {
    return { ok: false, skipped: true, checked: 0, bounced: 0, reason: 'Mailbox credentials are not configured.' } as const;
  }

  const since = new Date(Date.now() - lookbackMs);
  const { data: sentEvents, error: sentEventsError } = await supabase
    .from('ambassador_email_events')
    .select('id,application_id,recipient,provider_message_id,created_at')
    .eq('provider', providerName)
    .eq('status', 'sent')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(500);
  if (sentEventsError) throw sentEventsError;

  const events = (sentEvents || []) as EmailEventRow[];
  if (!events.length) return { ok: true, skipped: false, checked: 0, bounced: 0 } as const;

  const recipientMap = new Map<string, EmailEventRow[]>();
  for (const event of events) {
    const recipient = event.recipient.trim().toLowerCase();
    if (!recipientMap.has(recipient)) recipientMap.set(recipient, []);
    recipientMap.get(recipient)!.push(event);
  }

  const port = imapPort();
  const client = new ImapFlow({
    host: (process.env.AMBASSADOR_IMAP_HOST || defaultImapHost).trim(),
    port,
    secure: process.env.AMBASSADOR_IMAP_SECURE?.trim().toLowerCase() === 'false' ? false : true,
    auth: {
      user: mailboxUser(),
      pass: process.env.AMBASSADOR_SMTP_PASSWORD || ''
    },
    logger: false,
    socketTimeout: 12000
  });

  let checked = 0;
  let bounced = 0;

  try {
    await client.connect();
    await client.mailboxOpen('INBOX', { readOnly: true });
    const uids = await client.search({ since });
    const recentUids = uids.slice(-100);
    if (!recentUids.length) return { ok: true, skipped: false, checked: 0, bounced: 0 } as const;

    for await (const message of client.fetch(recentUids, { uid: true, envelope: true, source: true })) {
      const subject = message.envelope?.subject || '';
      const from = (message.envelope?.from || []).map((entry) => `${entry.name || ''} ${entry.address || ''}`).join(' ');
      const source = message.source?.toString('utf8') || '';
      if (!looksLikeBounce(subject, from, source)) continue;
      checked += 1;

      const sourceLower = source.toLowerCase();
      for (const [recipient, recipientEvents] of recipientMap) {
        if (!sourceLower.includes(recipient)) continue;

        const exact = recipientEvents.find((event) => {
          const messageId = normalizeMessageId(event.provider_message_id);
          return messageId && sourceLower.includes(messageId);
        });
        const event = exact || recipientEvents[0];
        if (!event) continue;

        const { error: updateError } = await supabase
          .from('ambassador_email_events')
          .update({
            status: 'bounced',
            bounced_at: new Date().toISOString(),
            error_message: `Mailbox delivery failure detected in ${defaultTeamEmail}.`
          })
          .eq('id', event.id)
          .eq('status', 'sent');
        if (updateError) throw updateError;
        bounced += 1;
        recipientMap.delete(recipient);
      }
    }

    return { ok: true, skipped: false, checked, bounced } as const;
  } finally {
    try {
      if (client.usable) await client.logout();
    } catch {
      client.close();
    }
  }
}
