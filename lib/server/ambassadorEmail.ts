import type { SupabaseClient } from '@supabase/supabase-js';

export type AmbassadorEmailType =
  | 'application_received'
  | 'admin_new_application'
  | 'interview_invite'
  | 'accepted'
  | 'declined'
  | 'follow_up';

export type AmbassadorEmailApplication = {
  id: string;
  full_name: string;
  school: string;
  school_email: string;
  major_year?: string | null;
  why_aspire?: string | null;
  campus_involvement?: string | null;
  availability?: string | null;
  interested_in?: string[] | null;
  status?: string | null;
};

type SendOptions = {
  supabase: SupabaseClient;
  application: AmbassadorEmailApplication;
  type: AmbassadorEmailType;
  createdBy?: string | null;
};

type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

const onceOnlyTypes = new Set<AmbassadorEmailType>(['application_received', 'admin_new_application']);

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || 'there';
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://aspires101.com').replace(/\/$/, '');
}

function emailShell(title: string, body: string, cta?: { label: string; href: string }) {
  const action = cta
    ? `<p style="margin:28px 0 8px"><a href="${escapeHtml(cta.href)}" style="display:inline-block;background:#ffc72c;color:#18130a;text-decoration:none;font-weight:800;padding:13px 18px;border-radius:10px">${escapeHtml(cta.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#0b0b09;color:#f4efe7;font-family:Arial,Helvetica,sans-serif"><div style="max-width:620px;margin:0 auto;padding:40px 24px"><div style="color:#ffc72c;font-size:12px;font-weight:900;letter-spacing:.12em;margin-bottom:26px">ASPIRE 101</div><div style="background:#141411;border:1px solid #2a2924;border-radius:18px;padding:30px"><h1 style="margin:0 0 18px;font-size:30px;line-height:1.08">${escapeHtml(title)}</h1>${body}${action}</div><p style="color:#777166;font-size:11px;line-height:1.6;margin:20px 4px 0">Aspire 101 · Campus community, built around real student needs.</p></div></body></html>`;
}

function templateFor(type: AmbassadorEmailType, application: AmbassadorEmailApplication): EmailTemplate {
  const name = firstName(application.full_name);
  const safeName = escapeHtml(name);
  const safeSchool = escapeHtml(application.school);
  const adminUrl = `${siteUrl()}/admin/ambassadors`;

  if (type === 'application_received') {
    return {
      subject: 'We received your Aspire 101 Campus Ambassador application',
      html: emailShell(
        'Application received.',
        `<p style="color:#b7b0a5;line-height:1.7;margin:0">Hi ${safeName},</p><p style="color:#b7b0a5;line-height:1.7">Thanks for applying to help build Aspire 101 at ${safeSchool}. Your application is in our review queue. If there is a fit, our team will follow up using this school email.</p><p style="color:#b7b0a5;line-height:1.7;margin-bottom:0">You do not need to submit again.</p>`,
        { label: 'Visit Aspire 101', href: `${siteUrl()}/ambassadors` }
      ),
      text: `Hi ${name},\n\nThanks for applying to help build Aspire 101 at ${application.school}. Your application is in our review queue. If there is a fit, our team will follow up using this school email.\n\nYou do not need to submit again.\n\nAspire 101`
    };
  }

  if (type === 'admin_new_application') {
    const interests = (application.interested_in || []).join(', ') || 'Not specified';
    return {
      subject: `New Campus Ambassador application · ${application.full_name}`,
      html: emailShell(
        'New ambassador application.',
        `<p style="color:#b7b0a5;line-height:1.7;margin:0"><strong style="color:#fff">${escapeHtml(application.full_name)}</strong> applied from ${safeSchool}.</p><p style="color:#8f887e;line-height:1.7">School email: ${escapeHtml(application.school_email)}<br>Major / year: ${escapeHtml(application.major_year || 'Not provided')}<br>Availability: ${escapeHtml(application.availability || 'Not provided')}<br>Interested in: ${escapeHtml(interests)}</p>`,
        { label: 'Review application', href: adminUrl }
      ),
      text: `New Campus Ambassador application\n\n${application.full_name}\n${application.school}\n${application.school_email}\nMajor / year: ${application.major_year || 'Not provided'}\nAvailability: ${application.availability || 'Not provided'}\n\nReview: ${adminUrl}`
    };
  }

  if (type === 'interview_invite') {
    return {
      subject: 'Aspire 101 Campus Ambassador · next step',
      html: emailShell(
        'We’d like to talk.',
        `<p style="color:#b7b0a5;line-height:1.7;margin:0">Hi ${safeName},</p><p style="color:#b7b0a5;line-height:1.7">Thanks again for your Campus Ambassador application. We’d like to learn more about you, ${safeSchool}, and how you would approach building a student community there.</p><p style="color:#b7b0a5;line-height:1.7;margin-bottom:0">Reply to this email with a few times that work for you and we’ll coordinate the next step.</p>`
      ),
      text: `Hi ${name},\n\nThanks again for your Campus Ambassador application. We’d like to learn more about you, ${application.school}, and how you would approach building a student community there.\n\nReply to this email with a few times that work for you and we’ll coordinate the next step.\n\nAspire 101`
    };
  }

  if (type === 'accepted') {
    return {
      subject: 'Welcome to the Aspire 101 Campus Ambassador program',
      html: emailShell(
        'Welcome to Aspire 101.',
        `<p style="color:#b7b0a5;line-height:1.7;margin:0">Hi ${safeName},</p><p style="color:#b7b0a5;line-height:1.7">We’d like to welcome you to the Aspire 101 Campus Ambassador program for ${safeSchool}. We’re excited to have you help us learn what students need and build a strong local campus presence.</p><p style="color:#b7b0a5;line-height:1.7;margin-bottom:0">We’ll follow up with onboarding details and your first steps.</p>`
      ),
      text: `Hi ${name},\n\nWe’d like to welcome you to the Aspire 101 Campus Ambassador program for ${application.school}. We’re excited to have you help us learn what students need and build a strong local campus presence.\n\nWe’ll follow up with onboarding details and your first steps.\n\nAspire 101`
    };
  }

  if (type === 'declined') {
    return {
      subject: 'Aspire 101 Campus Ambassador application update',
      html: emailShell(
        'Thank you for applying.',
        `<p style="color:#b7b0a5;line-height:1.7;margin:0">Hi ${safeName},</p><p style="color:#b7b0a5;line-height:1.7">Thank you for taking the time to apply to the Aspire 101 Campus Ambassador program. We’re not moving forward with your application at this time.</p><p style="color:#b7b0a5;line-height:1.7;margin-bottom:0">We appreciate your interest in Aspire 101 and hope you’ll continue to be part of the campus community.</p>`
      ),
      text: `Hi ${name},\n\nThank you for taking the time to apply to the Aspire 101 Campus Ambassador program. We’re not moving forward with your application at this time.\n\nWe appreciate your interest in Aspire 101 and hope you’ll continue to be part of the campus community.\n\nAspire 101`
    };
  }

  return {
    subject: 'Aspire 101 Campus Ambassador · follow-up',
    html: emailShell(
      'A quick follow-up.',
      `<p style="color:#b7b0a5;line-height:1.7;margin:0">Hi ${safeName},</p><p style="color:#b7b0a5;line-height:1.7;margin-bottom:0">We’re following up on your Aspire 101 Campus Ambassador application. Reply to this email if you have any questions or updates you’d like us to know.</p>`
    ),
    text: `Hi ${name},\n\nWe’re following up on your Aspire 101 Campus Ambassador application. Reply to this email if you have any questions or updates you’d like us to know.\n\nAspire 101`
  };
}

export function ambassadorEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.AMBASSADOR_FROM_EMAIL);
}

export async function sendAmbassadorEmail({ supabase, application, type, createdBy = null }: SendOptions) {
  const adminEmail = (process.env.AMBASSADOR_ADMIN_EMAIL || '').trim();
  const recipient = type === 'admin_new_application' ? adminEmail : application.school_email.trim().toLowerCase();

  if (!recipient) {
    return { ok: false, skipped: true, reason: 'No recipient is configured.' } as const;
  }

  if (onceOnlyTypes.has(type)) {
    const { data: existing } = await supabase
      .from('ambassador_email_events')
      .select('id,provider_message_id,sent_at')
      .eq('application_id', application.id)
      .eq('email_type', type)
      .eq('status', 'sent')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) return { ok: true, alreadySent: true, event: existing } as const;
  }

  if (!ambassadorEmailConfigured()) {
    const { data: skippedEvent } = await supabase
      .from('ambassador_email_events')
      .insert({
        application_id: application.id,
        email_type: type,
        recipient,
        status: 'skipped',
        provider: 'resend',
        error_message: 'Email provider is not configured.',
        created_by: createdBy
      })
      .select('id,email_type,recipient,status,provider,provider_message_id,error_message,created_at,sent_at')
      .single();
    return { ok: false, skipped: true, reason: 'Email provider is not configured.', event: skippedEvent } as const;
  }

  const template = templateFor(type, application);
  const replyTo = (process.env.AMBASSADOR_REPLY_TO_EMAIL || process.env.AMBASSADOR_ADMIN_EMAIL || '').trim();
  const eventInsert = {
    application_id: application.id,
    email_type: type,
    recipient,
    status: 'queued',
    provider: 'resend',
    created_by: createdBy
  };
  const { data: event, error: eventError } = await supabase
    .from('ambassador_email_events')
    .insert(eventInsert)
    .select('id,email_type,recipient,status,provider,provider_message_id,error_message,created_at,sent_at')
    .single();
  if (eventError) throw eventError;
  if (!event) throw new Error('Could not create an email delivery event.');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `ambassador-${application.id}-${type}-${event.id}`
      },
      body: JSON.stringify({
        from: process.env.AMBASSADOR_FROM_EMAIL,
        to: [recipient],
        subject: template.subject,
        html: template.html,
        text: template.text,
        ...(replyTo ? { reply_to: replyTo } : {})
      })
    });
    const payload = await response.json().catch(() => ({})) as { id?: string; message?: string; error?: { message?: string } };
    if (!response.ok || !payload.id) {
      throw new Error(payload.error?.message || payload.message || `Email provider returned ${response.status}.`);
    }

    const now = new Date().toISOString();
    const { data: sentEvent, error: updateError } = await supabase
      .from('ambassador_email_events')
      .update({ status: 'sent', provider_message_id: payload.id, sent_at: now, error_message: null })
      .eq('id', event.id)
      .select('id,email_type,recipient,status,provider,provider_message_id,error_message,created_at,sent_at')
      .single();
    if (updateError) throw updateError;
    return { ok: true, event: sentEvent } as const;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : 'Email delivery failed.';
    const { data: failedEvent } = await supabase
      .from('ambassador_email_events')
      .update({ status: 'failed', error_message: message })
      .eq('id', event.id)
      .select('id,email_type,recipient,status,provider,provider_message_id,error_message,created_at,sent_at')
      .single();
    return { ok: false, reason: message, event: failedEvent } as const;
  }
}
