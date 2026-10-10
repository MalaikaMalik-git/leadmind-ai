// backend/src/services/emailService.ts
//
// LeadMind AI — Transactional email (meeting invitations)
// Related UC: UC-13 (Schedule Meeting) — "meeting link is sent to the lead".
//
// WHY THIS EXISTS
// Until now the only email a lead received was Google Calendar's own
// invitation (sendUpdates=all). Google sends that from the admin's personal
// Google account, and Gmail/Outlook frequently put "invitation from someone
// I don't know" into Spam or Promotions. This service sends a normal
// transactional email through an authenticated SMTP account instead, which
// is what actually keeps the message out of spam:
//   • SPF / DKIM / DMARC aligned sender (configured at the SMTP provider —
//     see backend/.env.example and EMAIL_SETUP.md)
//   • a real subject line, plain-text + HTML parts, no images, no tracking
//     pixels, no link shorteners, the meeting URL shown as visible text
//   • a Reply-To that goes to a real person (the admin)
//   • an .ics file so the lead can add the meeting to any calendar
//
// If SMTP is NOT configured, isEmailConfigured() is false and the booking
// flow falls back to Google's native invitation, so nothing breaks.
//
// This module never throws from sendMeetingInviteEmail(): it returns
// { sent: false, reason } so a mail problem can never undo a booked meeting.

import nodemailer, { Transporter } from 'nodemailer';

export interface MeetingInviteEmailParams {
  to: string;
  leadName: string;
  title: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  meetingLink: string | null;
  /** Shown as the host: "Malaika Malik, LeadMind" */
  organizerName: string;
  /** Used as Reply-To so a lead's reply reaches a real inbox. */
  organizerEmail?: string | null;
  /** Stable id so re-sending / updating the same meeting doesn't duplicate it in calendars. */
  uid: string;
  durationMinutes: number;
}

export type EmailSendResult =
  | { sent: true; messageId: string }
  | { sent: false; reason: string };

// ─────────────────────────────────────────────────────────────────────────────
//  Configuration
// ─────────────────────────────────────────────────────────────────────────────

export function isEmailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getFromAddress(): { name: string; address: string } {
  return {
    name: process.env.EMAIL_FROM_NAME || 'LeadMind AI',
    address: process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER || '',
  };
}

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;

  const port = Number(process.env.SMTP_PORT) || 587;
  // 465 = implicit TLS. Anything else (587/2525) = STARTTLS upgrade, which
  // nodemailer negotiates automatically when secure is false.
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465;

  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return cachedTransporter;
}

export async function verifyEmailTransport(): Promise<{ ok: boolean; error?: string }> {
  if (!isEmailConfigured()) return { ok: false, error: 'SMTP_HOST / SMTP_USER / SMTP_PASS are not set.' };
  try {
    await getTransporter().verify();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Strips CR/LF so user-supplied text can never inject extra mail headers. */
function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function formatWhen(date: Date, timezone: string, withYear = true): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' as const } : {}),
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
    timeZoneName: 'short',
  }).format(date);
}

function formatShortWhen(date: Date, timezone: string): string {
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: timezone }).format(date);
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone, timeZoneName: 'short' }).format(date);
  return `${day} at ${time}`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  iCalendar (.ics) — RFC 5545
// ─────────────────────────────────────────────────────────────────────────────

function toIcsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Lines longer than 75 octets must be folded (RFC 5545 §3.1). */
function foldIcsLine(line: string): string {
  const chunks: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest, 'utf8') > 75) {
    let cut = 75;
    // never split in the middle of a multi-byte character
    while (Buffer.byteLength(rest.slice(0, cut), 'utf8') > 75) cut--;
    chunks.push(rest.slice(0, cut));
    rest = ' ' + rest.slice(cut);
  }
  chunks.push(rest);
  return chunks.join('\r\n');
}

export function buildIcs(params: MeetingInviteEmailParams): string {
  const description = params.meetingLink
    ? `Join the meeting: ${params.meetingLink}`
    : 'Meeting with the LeadMind team.';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LeadMind AI//Meeting Invitation//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${params.uid}`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(params.startTime)}`,
    `DTEND:${toIcsUtc(params.endTime)}`,
    `SUMMARY:${icsEscape(singleLine(params.title))}`,
    `DESCRIPTION:${icsEscape(description)}`,
    ...(params.meetingLink ? [`LOCATION:${icsEscape(params.meetingLink)}`, `URL:${params.meetingLink}`] : []),
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

// ─────────────────────────────────────────────────────────────────────────────
//  Message bodies
// ─────────────────────────────────────────────────────────────────────────────

function buildText(p: MeetingInviteEmailParams): string {
  const firstName = singleLine(p.leadName).split(/\s+/)[0] || 'there';
  return [
    `Hi ${firstName},`,
    ``,
    `Thank you for speaking with the LeadMind team. Your follow-up meeting is confirmed.`,
    ``,
    `When:     ${formatWhen(p.startTime, p.timezone)}`,
    `Duration: ${p.durationMinutes} minutes`,
    `Host:     ${singleLine(p.organizerName)}`,
    p.meetingLink ? `Join:     ${p.meetingLink}` : `Join:     A meeting link will follow from our team.`,
    ``,
    `The meeting is also attached to this email as a calendar file (meeting.ics) so you can add it to your calendar.`,
    ``,
    `If this time does not work, just reply to this email and we will find another one.`,
    ``,
    `Kind regards,`,
    `${singleLine(p.organizerName)}`,
    `LeadMind`,
  ].join('\n');
}

function buildHtml(p: MeetingInviteEmailParams): string {
  const firstName = escapeHtml(singleLine(p.leadName).split(/\s+/)[0] || 'there');
  const when = escapeHtml(formatWhen(p.startTime, p.timezone));
  const host = escapeHtml(singleLine(p.organizerName));
  const link = p.meetingLink ? escapeHtml(p.meetingLink) : null;

  // Deliberately plain: single column, system fonts, no images, no tracking.
  // The link text IS the URL (a mismatch between link text and target is a
  // classic phishing signal that spam filters score against).
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(singleLine(p.title))}</title></head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="max-width:560px;margin:0 auto;padding:24px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f2937;">
  <p style="margin:0 0 16px;">Hi ${firstName},</p>
  <p style="margin:0 0 16px;">Thank you for speaking with the LeadMind team. Your follow-up meeting is confirmed.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-collapse:collapse;">
    <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">When</td><td style="padding:4px 0;"><strong>${when}</strong></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Duration</td><td style="padding:4px 0;">${p.durationMinutes} minutes</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Host</td><td style="padding:4px 0;">${host}</td></tr>
    ${link ? `<tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Join</td><td style="padding:4px 0;"><a href="${link}" style="color:#1a56db;">${link}</a></td></tr>` : ''}
  </table>
  <p style="margin:0 0 16px;">The meeting is also attached as a calendar file (meeting.ics) so you can add it to your calendar.</p>
  <p style="margin:0 0 16px;">If this time does not work, just reply to this email and we will find another one.</p>
  <p style="margin:0;">Kind regards,<br>${host}<br>LeadMind</p>
</div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────────────────────────────────────

export async function sendMeetingInviteEmail(params: MeetingInviteEmailParams): Promise<EmailSendResult> {
  if (!isEmailConfigured()) {
    return { sent: false, reason: 'SMTP is not configured (SMTP_HOST / SMTP_USER / SMTP_PASS).' };
  }

  const from = getFromAddress();
  if (!from.address) {
    return { sent: false, reason: 'No sender address — set EMAIL_FROM_ADDRESS or SMTP_USER.' };
  }

  const replyTo = process.env.EMAIL_REPLY_TO || params.organizerEmail || undefined;

  try {
    const info = await getTransporter().sendMail({
      from,
      to: params.to,
      replyTo,
      subject: `Your meeting with LeadMind is confirmed - ${formatShortWhen(params.startTime, params.timezone)}`,
      text: buildText(params),
      html: buildHtml(params),
      attachments: [
        {
          filename: 'meeting.ics',
          content: buildIcs(params),
          contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
        },
      ],
      headers: {
        // Keeps out-of-office bots from replying to a transactional message.
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
      },
    });

    const rejected = (info.rejected || []) as unknown[];
    if (rejected.length > 0) {
      return { sent: false, reason: `Recipient rejected by the mail server: ${rejected.join(', ')}` };
    }
    return { sent: true, messageId: info.messageId };
  } catch (err: any) {
    return { sent: false, reason: err?.message || String(err) };
  }
}

/** Used by scripts/sendTestEmail.ts to check SPF/DKIM/inbox placement before a real demo. */
export async function sendDeliverabilityTestEmail(to: string): Promise<EmailSendResult> {
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return sendMeetingInviteEmail({
    to,
    leadName: 'Test Recipient',
    title: 'LeadMind AI - Discovery Call (test)',
    startTime: start,
    endTime: new Date(start.getTime() + 30 * 60 * 1000),
    timezone: process.env.TEST_EMAIL_TIMEZONE || 'Asia/Karachi',
    meetingLink: 'https://meet.google.com/abc-defg-hij',
    organizerName: 'LeadMind Team',
    organizerEmail: process.env.EMAIL_REPLY_TO || null,
    uid: `test-${Date.now()}@leadmind.local`,
    durationMinutes: 30,
  });
}
