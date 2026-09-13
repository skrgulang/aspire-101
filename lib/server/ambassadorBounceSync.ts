import tls, { type TLSSocket } from 'node:tls';
import type { SupabaseClient } from '@supabase/supabase-js';

const defaultTeamEmail = 'team@aspires101.com';
const defaultPopHost = 'mail.privateemail.com';
const defaultPopPort = 995;
const providerName = 'namecheap_private_email';
const lookbackMs = 14 * 24 * 60 * 60 * 1000;
const maxMessagesToInspect = 40;

type EmailEventRow = {
  id: string;
  application_id: string;
  recipient: string;
  provider_message_id: string | null;
  created_at: string;
};

type Waiter = {
  resolve: () => void;
  reject: (error: Error) => void;
};

class Pop3Reader {
  private buffer = '';
  private error: Error | null = null;
  private waiters: Waiter[] = [];

  constructor(private socket: TLSSocket) {
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      this.buffer += chunk;
      this.flushWaiters();
    });
    socket.on('error', (error) => this.fail(error));
    socket.on('close', () => {
      if (!this.error) this.fail(new Error('Mailbox connection closed unexpectedly.'));
    });
  }

  private flushWaiters() {
    const waiters = this.waiters.splice(0);
    waiters.forEach(({ resolve }) => resolve());
  }

  private fail(error: Error) {
    if (!this.error) this.error = error;
    const waiters = this.waiters.splice(0);
    waiters.forEach(({ reject }) => reject(this.error as Error));
  }

  private async waitForData() {
    if (this.error) throw this.error;
    await new Promise<void>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
    if (this.error) throw this.error;
  }

  async readLine() {
    while (true) {
      const index = this.buffer.indexOf('\r\n');
      if (index >= 0) {
        const line = this.buffer.slice(0, index);
        this.buffer = this.buffer.slice(index + 2);
        return line;
      }
      await this.waitForData();
    }
  }

  async readMultiline() {
    const terminator = '\r\n.\r\n';
    while (true) {
      const index = this.buffer.indexOf(terminator);
      if (index >= 0) {
        const value = this.buffer.slice(0, index);
        this.buffer = this.buffer.slice(index + terminator.length);
        return value.replace(/\r\n\.\./g, '\r\n.');
      }
      await this.waitForData();
    }
  }
}

function mailboxUser() {
  return (process.env.AMBASSADOR_SMTP_USER || defaultTeamEmail).trim();
}

function popPort() {
  const configured = Number(process.env.AMBASSADOR_POP3_PORT || defaultPopPort);
  return Number.isFinite(configured) && configured > 0 ? configured : defaultPopPort;
}

function looksLikeBounce(source: string) {
  const haystack = source.toLowerCase();
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

async function connectPop3() {
  const host = (process.env.AMBASSADOR_POP3_HOST || defaultPopHost).trim();
  const socket = tls.connect({ host, port: popPort(), servername: host, rejectUnauthorized: true });
  socket.setTimeout(12000, () => socket.destroy(new Error('Mailbox connection timed out.')));

  await new Promise<void>((resolve, reject) => {
    const onSecure = () => {
      socket.off('error', onError);
      resolve();
    };
    const onError = (error: Error) => {
      socket.off('secureConnect', onSecure);
      reject(error);
    };
    socket.once('secureConnect', onSecure);
    socket.once('error', onError);
  });

  const reader = new Pop3Reader(socket);
  const greeting = await reader.readLine();
  if (!greeting.startsWith('+OK')) {
    socket.destroy();
    throw new Error('Namecheap mailbox rejected the POP3 connection.');
  }

  async function command(commandText: string, multiline = false) {
    socket.write(`${commandText}\r\n`);
    const firstLine = await reader.readLine();
    if (!firstLine.startsWith('+OK')) throw new Error(`Namecheap mailbox rejected ${commandText.split(' ')[0]}.`);
    return multiline ? await reader.readMultiline() : firstLine;
  }

  await command(`USER ${mailboxUser()}`);
  await command(`PASS ${process.env.AMBASSADOR_SMTP_PASSWORD || ''}`);

  return { socket, command };
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

  const ownMailbox = mailboxUser().toLowerCase();
  const recipientMap = new Map<string, EmailEventRow[]>();
  for (const event of events) {
    const recipient = event.recipient.trim().toLowerCase();
    if (!recipient || recipient === ownMailbox) continue;
    if (!recipientMap.has(recipient)) recipientMap.set(recipient, []);
    recipientMap.get(recipient)!.push(event);
  }
  if (!recipientMap.size) return { ok: true, skipped: false, checked: 0, bounced: 0 } as const;

  const { socket, command } = await connectPop3();
  let checked = 0;
  let bounced = 0;

  try {
    const stat = await command('STAT');
    const messageCount = Number(stat.split(/\s+/)[1] || 0);
    const firstMessage = Math.max(1, messageCount - maxMessagesToInspect + 1);

    for (let index = messageCount; index >= firstMessage && recipientMap.size; index -= 1) {
      const source = await command(`RETR ${index}`, true);
      if (!looksLikeBounce(source)) continue;
      checked += 1;

      const sourceLower = source.toLowerCase();
      for (const [recipient, recipientEvents] of [...recipientMap.entries()]) {
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
      await command('QUIT');
    } catch {
      // Ignore logout failures; no mailbox state was changed.
    }
    socket.destroy();
  }
}
