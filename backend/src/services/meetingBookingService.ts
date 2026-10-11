// backend/src/services/meetingBookingService.ts
//
// LeadMind AI — shared meeting-booking core (UC-13)
//
// Before this file, the whole booking algorithm lived inside
// meetingController.bookMeeting, so only an admin clicking "book" could use
// it. Callers:
//   1. meetingController.bookMeeting        — an admin picks a slot manually
//   2. meetingAutomationService            — a qualified call ended without a
//                                            time, on the phone or the web demo
//   3. callSchedulingTools                 — the agent books a free slot
//                                            during the call
// so every path behaves the same: same double-booking
// re-check, same Google Calendar sync, same invitation email.
//
// Invitation email strategy (the "meeting link must reach the lead and not
// land in spam" requirement):
//   1. SMTP configured  → send OUR transactional email (emailService.ts) with
//                         the Meet link + .ics. The Google event is created
//                         with sendUpdates='none' so the lead gets ONE email.
//   2. SMTP not set up, or the send failed, or Google had no link yet
//                       → fall back to Google Calendar's native invitation.
//   3. Lead has no email → no invitation possible; recorded as channel 'none'.
// What happened is stored on Meeting.invite so it can always be audited.

import {
  createCalendarEvent,
  queryFreeBusy,
  fetchEventMeetingLink,
  sendGoogleInvitation,
} from './googleCalendarService';
import { getValidAccessToken, CalendarNotConnectedError, CalendarReconnectRequiredError } from './calendarTokenService';
import { computeAvailableSlots, BusyPeriod } from './slotComputationService';
import { isEmailConfigured, sendMeetingInviteEmail } from './emailService';
import { logError } from '../utils/errorLog';

const Lead = require('../models/Lead');
const Meeting = require('../models/Meeting');
const MeetingSlot = require('../models/MeetingSlot');
const Campaign = require('../models/Campaign');
const Admin = require('../models/Admin');
const { GOOGLE_SYNC_STATUS } = require('../models/Meeting');

export interface BookingArgs {
  adminId: string;
  lead: any; // Mongoose Lead document
  requestedStart: Date;
  inviteEmail: string | null;
  transcriptId?: string | null;
  notes?: string | null;
  /** Admin id when booked by a person; null when the AI pipeline booked it. */
  bookedBy: string | null;
  /** Optional reuse of values the caller already loaded. */
  accessToken?: string;
  meetingSlot?: any;
}

export type BookingResult =
  | {
      ok: true;
      meeting: any;
      meetingLink: string | null;
      inviteVia: 'smtp' | 'google' | 'none';
      inviteEmailedTo: string | null;
      inviteError: string | null;
    }
  | { ok: false; status: number; code: string; message: string; extra?: Record<string, any> };

export async function getMeetingSlotSettings(adminId: string) {
  return MeetingSlot.findOneAndUpdate({ admin: adminId }, {}, { upsert: true, new: true, setDefaultsOnInsert: true });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Earliest bookable slot — same algorithm GET /api/calendar/slots uses.
// ─────────────────────────────────────────────────────────────────────────────

export async function listAvailableSlots(
  accessToken: string,
  meetingSlot: any,
  horizonDays = 14
): Promise<Array<{ start: Date; end: Date }>> {
  const rangeStart = new Date();
  const days = Math.max(1, Math.min(meetingSlot.maximumAdvanceDays, horizonDays));
  const rangeEnd = new Date(rangeStart.getTime() + days * 24 * 60 * 60 * 1000);

  const [googleBusy, existingMeetings] = await Promise.all([
    queryFreeBusy(accessToken, rangeStart, rangeEnd),
    Meeting.find({ status: 'Scheduled', scheduledAt: { $gte: rangeStart, $lt: rangeEnd } }),
  ]);

  const busyPeriods: BusyPeriod[] = [
    ...googleBusy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) })),
    ...existingMeetings.map((m: any) => ({
      start: m.scheduledAt,
      end: new Date(m.scheduledAt.getTime() + m.durationMinutes * 60 * 1000),
    })),
  ];

  return computeAvailableSlots({
    availabilityWindows: meetingSlot.availabilityWindows,
    durationMinutes: meetingSlot.defaultMeetingDurationMinutes,
    bufferMinutes: meetingSlot.bufferMinutes,
    minimumNoticeHours: meetingSlot.minimumNoticeHours,
    maximumAdvanceDays: meetingSlot.maximumAdvanceDays,
    timezone: meetingSlot.timezone,
    rangeStart,
    rangeEnd,
    busyPeriods,
  });
}

export async function findNextAvailableSlot(accessToken: string, meetingSlot: any, horizonDays = 14): Promise<Date | null> {
  const slots = await listAvailableSlots(accessToken, meetingSlot, horizonDays);
  return slots.length > 0 ? slots[0].start : null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  bookMeetingForLead
// ─────────────────────────────────────────────────────────────────────────────

// Serializes bookings for one lead so a live tool call and the post-call
// fallback cannot both pass the "already booked" check.
const bookingTails = new Map<string, Promise<unknown>>();

function withBookingLock<T>(leadId: string, fn: () => Promise<T>): Promise<T> {
  const prev = bookingTails.get(leadId) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  bookingTails.set(
    leadId,
    run.then(
      () => undefined,
      () => undefined
    )
  );
  return run;
}

export function bookMeetingForLead(args: BookingArgs): Promise<BookingResult> {
  const leadId = args.lead?._id ? String(args.lead._id) : '';
  if (!leadId) return performBooking(args);
  return withBookingLock(leadId, () => performBooking(args));
}

async function performBooking(args: BookingArgs): Promise<BookingResult> {
  const { adminId, lead, requestedStart, inviteEmail, transcriptId, notes, bookedBy } = args;

  const meetingSlot = args.meetingSlot || (await getMeetingSlotSettings(adminId));
  const requestedEnd = new Date(requestedStart.getTime() + meetingSlot.defaultMeetingDurationMinutes * 60 * 1000);

  // ── UC-06 preference: "1 meeting per lead" ──────────────────────────────
  if (meetingSlot.preferences.oneMeetingPerLead) {
    const existingMeeting = await Meeting.findOne({ lead: lead._id, status: 'Scheduled' });
    if (existingMeeting) {
      return {
        ok: false,
        status: 409,
        code: 'ONE_MEETING_PER_LEAD',
        message: 'This lead already has a scheduled meeting. Cancel or reschedule it first.',
        extra: { existingMeetingId: existingMeeting._id },
      };
    }
  }

  // ── Valid Google access token ────────────────────────────────────────────
  let accessToken = args.accessToken;
  if (!accessToken) {
    try {
      accessToken = await getValidAccessToken(adminId);
    } catch (err: any) {
      if (err instanceof CalendarNotConnectedError || err instanceof CalendarReconnectRequiredError) {
        return { ok: false, status: 409, code: err.name, message: err.message };
      }
      throw err;
    }
  }

  // ── UC-13 special requirement: RE-VERIFY availability right before booking ──
  const [googleBusy, existingMeetings] = await Promise.all([
    queryFreeBusy(accessToken, requestedStart, requestedEnd),
    Meeting.find({ status: 'Scheduled', scheduledAt: { $gte: requestedStart, $lt: requestedEnd } }),
  ]);
  const busyPeriods: BusyPeriod[] = [
    ...googleBusy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) })),
    ...existingMeetings.map((m: any) => ({
      start: m.scheduledAt,
      end: new Date(m.scheduledAt.getTime() + m.durationMinutes * 60 * 1000),
    })),
  ];

  const reVerifiedSlots = computeAvailableSlots({
    availabilityWindows: meetingSlot.availabilityWindows,
    durationMinutes: meetingSlot.defaultMeetingDurationMinutes,
    bufferMinutes: meetingSlot.bufferMinutes,
    minimumNoticeHours: meetingSlot.minimumNoticeHours,
    maximumAdvanceDays: meetingSlot.maximumAdvanceDays,
    timezone: meetingSlot.timezone,
    rangeStart: requestedStart,
    rangeEnd: requestedEnd,
    busyPeriods,
  });

  if (!reVerifiedSlots.some((s) => s.start.getTime() === requestedStart.getTime())) {
    return {
      ok: false,
      status: 409,
      code: 'SLOT_UNAVAILABLE',
      message: 'This time slot is no longer available. Please choose another.',
    };
  }

  // ── Create the Meeting record FIRST (survives a Google failure) ──────────
  const meeting = await Meeting.create({
    lead: lead._id,
    campaign: lead.campaign ? (lead.campaign as any)._id || lead.campaign : null,
    transcript: transcriptId || null,
    bookedBy,
    title: `LeadMind AI — Discovery Call with ${lead.fullName}`,
    scheduledAt: requestedStart,
    durationMinutes: meetingSlot.defaultMeetingDurationMinutes,
    timezone: meetingSlot.timezone,
    status: 'Scheduled',
    leadSnapshot: {
      fullName: lead.fullName,
      phone: lead.phone,
      email: inviteEmail,
      company: lead.company || null,
    },
    notes: notes || null,
  });

  // Our own email is used whenever SMTP is configured and there is an address.
  const useOwnEmail = !!inviteEmail && isEmailConfigured();

  // ── Sync to Google Calendar ──────────────────────────────────────────────
  let eventId: string;
  let meetingLink: string | null;
  try {
    const eventResult = await createCalendarEvent(accessToken, {
      summary: meeting.title,
      description: `Scheduled via LeadMind AI.${notes ? `\n\nNotes: ${notes}` : ''}`,
      startTime: requestedStart,
      endTime: requestedEnd,
      timezone: meetingSlot.timezone,
      attendeeEmail: inviteEmail,
      sendUpdates: useOwnEmail ? 'none' : 'all',
    });
    eventId = eventResult.eventId;
    meetingLink = eventResult.meetingLink;
  } catch (syncErr: any) {
    // UC-13 A2 — Google Calendar API failure
    await logError('meeting.googleSyncFailed', syncErr, { meetingId: String(meeting._id), leadId: String(lead._id) });
    meeting.googleCalendar.syncStatus = GOOGLE_SYNC_STATUS.FAILED;
    meeting.googleCalendar.syncError = syncErr.response?.data?.error?.message || syncErr.message;
    await meeting.save();
    await Lead.updateOne({ _id: lead._id }, { $set: { status: 'Qualified (Booking Failed)' } });
    return {
      ok: false,
      status: 502,
      code: 'GOOGLE_SYNC_FAILED',
      message: 'Could not sync this meeting to Google Calendar. It has been saved and can be retried, or the lead can be followed up with manually.',
      extra: { meetingId: meeting._id },
    };
  }

  // Meet link occasionally arrives a moment after the event is created.
  if (!meetingLink) {
    try {
      meetingLink = await fetchEventMeetingLink(accessToken, eventId);
    } catch (e: any) {
      await logError('meeting.fetchMeetLink', e, { meetingId: String(meeting._id), eventId });
    }
  }

  meeting.googleCalendar.eventId = eventId;
  meeting.googleCalendar.meetingLink = meetingLink;
  meeting.googleCalendar.syncStatus = GOOGLE_SYNC_STATUS.SYNCED;
  meeting.googleCalendar.syncedAt = new Date();
  await meeting.save();

  // UC-13 post-condition: "Lead status updated to Meeting Booked."
  await Lead.updateOne({ _id: lead._id }, { $set: { status: 'Meeting Booked', meeting: meeting._id } });

  // Keep Campaign.stats.meetingsBooked in sync — best-effort, never fails the booking.
  const campaignId = lead.campaign ? (lead.campaign as any)._id || lead.campaign : null;
  if (campaignId) {
    await Campaign.updateOne({ _id: campaignId }, { $inc: { 'stats.meetingsBooked': 1 } }).catch(() => undefined);
  }

  // ── Deliver the invitation (never allowed to fail the booking) ───────────
  let inviteVia: 'smtp' | 'google' | 'none' = 'none';
  let inviteError: string | null = null;

  if (inviteEmail) {
    if (useOwnEmail && meetingLink) {
      const admin = await Admin.findById(adminId).select('name email googleCalendar.calendarEmail').lean();
      const result = await sendMeetingInviteEmail({
        to: inviteEmail,
        leadName: lead.fullName,
        title: meeting.title,
        startTime: requestedStart,
        endTime: requestedEnd,
        timezone: meetingSlot.timezone,
        meetingLink,
        organizerName: admin?.name || 'The LeadMind Team',
        organizerEmail: admin?.googleCalendar?.calendarEmail || admin?.email || null,
        uid: `${eventId}@leadmind.ai`,
        durationMinutes: meetingSlot.defaultMeetingDurationMinutes,
      });

      if (result.sent) {
        inviteVia = 'smtp';
      } else {
        inviteError = result.reason;
        await logError('meeting.inviteEmailFailed', new Error(result.reason), { meetingId: String(meeting._id), to: inviteEmail });
        inviteVia = await googleFallback(accessToken, eventId, meetingLink, meeting, (msg) => { inviteError = `${inviteError} | ${msg}`; });
      }
    } else if (useOwnEmail) {
      // SMTP is configured but Google still has no Meet link → let Google send its invitation
      inviteError = 'No meeting link was available yet; Google Calendar sent the invitation instead.';
      inviteVia = await googleFallback(accessToken, eventId, meetingLink, meeting, (msg) => { inviteError = `${inviteError} | ${msg}`; });
    } else {
      inviteVia = 'google'; // already sent by Google when the event was created (sendUpdates=all)
    }
  }

  meeting.invite = {
    channel: inviteVia,
    sentTo: inviteVia === 'none' ? null : inviteEmail,
    sentAt: inviteVia === 'none' ? null : new Date(),
    error: inviteError,
  };
  await meeting.save();

  return {
    ok: true,
    meeting,
    meetingLink,
    inviteVia,
    inviteEmailedTo: inviteVia === 'none' ? null : inviteEmail,
    inviteError,
  };
}

async function googleFallback(
  accessToken: string,
  eventId: string,
  meetingLink: string | null,
  meeting: any,
  appendError: (msg: string) => void
): Promise<'google' | 'none'> {
  try {
    await sendGoogleInvitation(accessToken, eventId, meetingLink);
    return 'google';
  } catch (e: any) {
    await logError('meeting.googleInviteFallbackFailed', e, { meetingId: String(meeting._id), eventId });
    appendError(`Google fallback failed: ${e?.response?.data?.error?.message || e?.message}`);
    return 'none';
  }
}
