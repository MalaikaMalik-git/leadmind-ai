// backend/src/services/callSchedulingTools.ts
//
// Tools the voice agent calls during a phone or web call.
// A meeting time is spoken only after Google Calendar says that slot is free.
// Booking reuses bookMeetingForLead, so the lead gets one SMTP invitation
// (Google's own invitation stays off while SMTP is configured).

import { bookMeetingForLead, getMeetingSlotSettings, listAvailableSlots } from './meetingBookingService';
import { resolveAdminId } from './meetingAutomationService';
import { getValidAccessToken, CalendarNotConnectedError, CalendarReconnectRequiredError } from './calendarTokenService';
import { zonedTimeToUtc } from '../utils/timezone';
import { logError } from '../utils/errorLog';

const Lead = require('../models/Lead');
const Meeting = require('../models/Meeting');

const MATCH_MS = 15 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const CALENDAR_UNAVAILABLE = {
  calendarChecked: false,
  say: 'The team will email a confirmed time. Do not name a day or time.',
};

export interface SchedulingToolContext {
  leadId: string | null;
  campaignId: string | null;
}

interface Slot {
  start: Date;
  end: Date;
}

interface ReadyContext {
  lead: any;
  adminId: string;
  accessToken: string;
  meetingSlot: any;
  slots: Slot[];
}

const bookTails = new Map<string, Promise<unknown>>();

function withLeadLock<T>(leadId: string, fn: () => Promise<T>): Promise<T> {
  const prev = bookTails.get(leadId) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  bookTails.set(
    leadId,
    run.then(
      () => undefined,
      () => undefined
    )
  );
  return run;
}

function speak(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

function describe(slot: Slot, timezone: string) {
  return { startTimeIso: slot.start.toISOString(), spoken: speak(slot.start, timezone) };
}

function nearest(slots: Slot[], around: Date | null, count: number): Slot[] {
  const ranked = around
    ? [...slots].sort(
        (a, b) => Math.abs(a.start.getTime() - around.getTime()) - Math.abs(b.start.getTime() - around.getTime())
      )
    : slots;
  return ranked.slice(0, count);
}

function closestFree(slots: Slot[], requested: Date): Slot | null {
  let best: Slot | null = null;
  let bestDist = Infinity;
  for (const slot of slots) {
    const dist = Math.abs(slot.start.getTime() - requested.getTime());
    if (dist < bestDist) {
      best = slot;
      bestDist = dist;
    }
  }
  return best && bestDist <= MATCH_MS ? best : null;
}

/** Absolute instant. A wall-clock time with no offset is read in the company timezone. */
function parseStart(raw: unknown, timezone: string): Date | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const value = raw.trim();
  const wall = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (wall) {
    return zonedTimeToUtc(Number(wall[1]), Number(wall[2]), Number(wall[3]), Number(wall[4]), Number(wall[5]), timezone);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function loadContext(ctx: SchedulingToolContext): Promise<ReadyContext | { error: Record<string, unknown> }> {
  if (!ctx.leadId) return { error: CALENDAR_UNAVAILABLE };
  const lead = await Lead.findById(ctx.leadId);
  if (!lead) return { error: CALENDAR_UNAVAILABLE };

  const adminId = await resolveAdminId(ctx.campaignId || lead.campaign);
  if (!adminId) return { error: CALENDAR_UNAVAILABLE };

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(adminId);
  } catch (err: any) {
    if (err instanceof CalendarNotConnectedError || err instanceof CalendarReconnectRequiredError) {
      return { error: CALENDAR_UNAVAILABLE };
    }
    throw err;
  }

  const meetingSlot = await getMeetingSlotSettings(adminId);
  const slots = await listAvailableSlots(accessToken, meetingSlot, 14);
  return { lead, adminId, accessToken, meetingSlot, slots };
}

async function existingBooking(leadId: string, meetingSlot: any) {
  if (meetingSlot?.preferences?.oneMeetingPerLead === false) return null;
  const timezone = meetingSlot?.timezone || 'Asia/Karachi';
  const meeting = await Meeting.findOne({ lead: leadId, status: 'Scheduled' }).lean();
  if (!meeting) return null;
  // A calendar sync that failed is not a time the agent may confirm.
  if (meeting.googleCalendar?.syncStatus !== 'Synced') {
    return {
      booked: false,
      calendarChecked: false,
      say: 'The team will email a confirmed time. Do not name a day or time.',
    };
  }
  const spoken = speak(new Date(meeting.scheduledAt), meeting.timezone || timezone);
  return {
    alreadyBooked: true,
    calendarChecked: true,
    startTimeIso: new Date(meeting.scheduledAt).toISOString(),
    spoken,
    say: `This lead is already booked for ${spoken}. Do not book another time. Confirm that time and that the meeting link was emailed.`,
  };
}

export async function runSchedulingTool(
  name: string,
  args: Record<string, unknown>,
  ctx: SchedulingToolContext
): Promise<Record<string, unknown>> {
  if (name === 'confirm_lead_email') {
    return confirmEmail(args, ctx);
  }
  if (name === 'check_meeting_time') {
    return checkTime(args, ctx);
  }
  if (name === 'suggest_meeting_times') {
    return suggestTimes(args, ctx);
  }
  if (name === 'book_meeting_time') {
    if (!ctx.leadId) return CALENDAR_UNAVAILABLE;
    return withLeadLock(ctx.leadId, () => bookTime(args, ctx));
  }
  return { calendarChecked: false, say: 'That action is not available. Do not name a day or time.' };
}

async function confirmEmail(args: Record<string, unknown>, ctx: SchedulingToolContext): Promise<Record<string, unknown>> {
  if (!ctx.leadId) return { ok: false, say: 'Ask them to repeat the email address.' };
  const email = String(args.email || '').trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, say: 'That does not look like an email address. Ask them to repeat it.' };
  }
  const lead = await Lead.findById(ctx.leadId);
  if (!lead) return { ok: false, say: 'Ask them to repeat the email address.' };
  lead.email = email;
  await lead.save();
  return { ok: true, email, say: `The meeting email will go to ${email}.` };
}

async function checkTime(args: Record<string, unknown>, ctx: SchedulingToolContext): Promise<Record<string, unknown>> {
  const loaded = await loadContext(ctx);
  if ('error' in loaded) return loaded.error;
  const { lead, meetingSlot, slots } = loaded;
  const timezone = meetingSlot.timezone || 'Asia/Karachi';

  const already = await existingBooking(String(lead._id), meetingSlot);
  if (already) return already;

  const requested = parseStart(args.startTimeIso, timezone);
  if (!requested) {
    return {
      calendarChecked: false,
      say: 'Ask for the time again. Do not name a day or time until a check succeeds.',
    };
  }

  const match = closestFree(slots, requested);
  if (match) {
    const offered = describe(match, timezone);
    return {
      calendarChecked: true,
      free: true,
      ...offered,
      say: `${offered.spoken} is free. Book that exact startTimeIso before you tell them the time.`,
    };
  }

  const options = nearest(slots, requested, 3).map((slot) => describe(slot, timezone));
  return {
    calendarChecked: true,
    free: false,
    times: options,
    say:
      options.length > 0
        ? 'That time is busy. Apologize and ask whether they want these open times or they would rather name another time. Offer only the spoken times.'
        : 'That time is busy and there is no open time to offer. Say the team will email a confirmed time. Do not name a day or time.',
  };
}

async function suggestTimes(args: Record<string, unknown>, ctx: SchedulingToolContext): Promise<Record<string, unknown>> {
  const loaded = await loadContext(ctx);
  if ('error' in loaded) return loaded.error;
  const { meetingSlot, slots } = loaded;
  const timezone = meetingSlot.timezone || 'Asia/Karachi';
  const around = args.aroundIso ? parseStart(args.aroundIso, timezone) : null;
  const options = nearest(slots, around, 3).map((slot) => describe(slot, timezone));
  return {
    calendarChecked: true,
    times: options,
    say:
      options.length > 0
        ? 'Offer only these spoken times. If they pick one, book that exact startTimeIso before you confirm it.'
        : 'There is no open time to offer. Say the team will email a confirmed time. Do not name a day or time.',
  };
}

async function bookTime(args: Record<string, unknown>, ctx: SchedulingToolContext): Promise<Record<string, unknown>> {
  const loaded = await loadContext(ctx);
  if ('error' in loaded) return loaded.error;
  const { lead, adminId, accessToken, meetingSlot, slots } = loaded;
  const timezone = meetingSlot.timezone || 'Asia/Karachi';

  const already = await existingBooking(String(lead._id), meetingSlot);
  if (already) return already;

  if (!lead.email) {
    return {
      booked: false,
      calendarChecked: true,
      say: 'Ask for an email address, call confirm_lead_email, then book. Do not name a time yet.',
    };
  }

  const requested = parseStart(args.startTimeIso, timezone);
  const match = requested ? closestFree(slots, requested) : null;
  if (!match) {
    const options = nearest(slots, requested, 3).map((slot) => describe(slot, timezone));
    return {
      booked: false,
      calendarChecked: true,
      free: false,
      times: options,
      say: 'That time is not free. Do not say it is booked. Offer only the spoken times, or let them name another time.',
    };
  }

  const result = await bookMeetingForLead({
    adminId,
    lead,
    requestedStart: match.start,
    inviteEmail: lead.email,
    notes: 'Booked during the call.',
    bookedBy: null,
    accessToken,
    meetingSlot,
  });

  if (!result.ok) {
    await logError('callScheduling.book', new Error(result.message), {
      leadId: String(lead._id),
      code: result.code,
    });
    if (result.code === 'ONE_MEETING_PER_LEAD') {
      const existing = await existingBooking(String(lead._id), meetingSlot);
      if (existing) return existing;
    }
    if (result.code === 'SLOT_UNAVAILABLE') {
      const options = nearest(slots, requested, 3).map((slot) => describe(slot, timezone));
      return {
        booked: false,
        calendarChecked: true,
        free: false,
        times: options,
        say: 'That time is not free. Do not say it is booked. Offer only the spoken times, or let them name another time.',
      };
    }
    return {
      booked: false,
      calendarChecked: false,
      say: 'The team will email a confirmed time. Do not name a day or time.',
    };
  }

  const spoken = speak(match.start, timezone);
  return {
    booked: true,
    calendarChecked: true,
    startTimeIso: match.start.toISOString(),
    spoken,
    emailedTo: result.inviteEmailedTo || lead.email,
    say: `Booked for ${spoken}. The meeting link is being emailed to ${result.inviteEmailedTo || lead.email}. Tell them that time and that address.`,
  };
}
