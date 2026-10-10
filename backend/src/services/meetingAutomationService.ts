// backend/src/services/meetingAutomationService.ts
//
// LeadMind AI — automatic meeting booking after a QUALIFIED call
// Related UCs: UC-12 (Qualify Lead) → UC-13 (Schedule Meeting)
//
// Runs for BOTH call channels, because it is triggered from the one place
// every finished call passes through (webhookController.handleEndOfCallReport):
//   • real phone calls (outbound campaign dialing, inbound)
//   • browser web calls (VAPI web SDK)
//
// What it does for a lead that just scored >= the qualification threshold:
//   1. finds the admin's next free slot (availability rules + Google Calendar
//      free/busy + already-booked meetings, honouring minimum notice)
//   2. books it (bookMeetingForLead — same code path as a manual booking)
//   3. emails the lead the meeting link (SMTP email, Google invite fallback)
//   4. records the outcome on CallLog.autoBooking so the UI can show it
//
// UC-13 alternative flows are honoured:
//   A1 no slot available   → lead status "Qualified (No Slot)"
//   A2 Google/API failure  → lead status "Qualified (Booking Failed)"
// A lead with no email address is NOT booked: a meeting nobody was told about
// is a guaranteed no-show, so the lead stays "Qualified" for human follow-up.
//
// The admin can switch this off with Scheduling → preferences → autoConfirm.
//
// This function never throws — it always resolves with an outcome object.

import { bookMeetingForLead, findNextAvailableSlot, getMeetingSlotSettings } from './meetingBookingService';
import { getValidAccessToken, CalendarNotConnectedError, CalendarReconnectRequiredError } from './calendarTokenService';
import { logError } from '../utils/errorLog';

const Lead = require('../models/Lead');
const Campaign = require('../models/Campaign');
const Admin = require('../models/Admin');
const CallLog = require('../models/CallLog');
const Meeting = require('../models/Meeting');

export type AutoBookOutcome =
  | { status: 'booked'; meetingId: string; scheduledAt: Date; meetingLink: string | null; inviteVia: string; inviteEmailedTo: string | null }
  | { status: 'skipped'; reason: 'auto_confirm_off' | 'already_booked' | 'no_email' | 'no_admin'; message: string }
  | { status: 'failed'; reason: 'calendar_not_connected' | 'no_slot' | 'booking_failed'; message: string };

interface AutoBookArgs {
  leadId: any;
  campaignId: any | null;
  transcriptId: any | null;
  callLogId: any;
}

/** Whoever owns the calendar: the campaign's admin, else any admin with Google connected (inbound leads). */
async function resolveAdminId(campaignId: any | null): Promise<string | null> {
  if (campaignId) {
    const campaign = await Campaign.findById(campaignId).select('createdBy').lean();
    if (campaign?.createdBy) return String(campaign.createdBy);
  }
  const connected = await Admin.findOne({ 'googleCalendar.isConnected': true }).select('_id').lean();
  if (connected) return String(connected._id);
  const anyAdmin = await Admin.findOne({}).select('_id').lean();
  return anyAdmin ? String(anyAdmin._id) : null;
}

async function record(callLogId: any, outcome: AutoBookOutcome): Promise<void> {
  const fields: Record<string, any> = {
    'autoBooking.status': outcome.status,
    'autoBooking.reason': outcome.status === 'booked' ? null : outcome.reason,
    'autoBooking.message': outcome.status === 'booked' ? null : outcome.message,
    'autoBooking.meeting': outcome.status === 'booked' ? outcome.meetingId : null,
    'autoBooking.at': new Date(),
  };
  await CallLog.updateOne({ _id: callLogId }, { $set: fields }).catch(() => undefined);
}

export async function autoBookMeetingForQualifiedLead(args: AutoBookArgs): Promise<AutoBookOutcome> {
  const { leadId, campaignId, transcriptId, callLogId } = args;

  let outcome: AutoBookOutcome;
  try {
    outcome = await run();
  } catch (err: any) {
    await logError('meetingAutomation.unexpected', err, { leadId: String(leadId), callLogId: String(callLogId) });
    await Lead.updateOne({ _id: leadId, status: 'Qualified' }, { $set: { status: 'Qualified (Booking Failed)' } }).catch(() => undefined);
    outcome = { status: 'failed', reason: 'booking_failed', message: err?.message || 'Unexpected error while booking.' };
  }

  await record(callLogId, outcome);
  console.log(`[autoBook] lead=${leadId} → ${outcome.status}${'reason' in outcome ? ` (${outcome.reason})` : ''}`);
  return outcome;

  async function run(): Promise<AutoBookOutcome> {
    const adminId = await resolveAdminId(campaignId);
    if (!adminId) return { status: 'skipped', reason: 'no_admin', message: 'No admin account found to book the meeting on.' };

    const lead = await Lead.findById(leadId).populate('campaign', 'name createdBy');
    if (!lead) return { status: 'skipped', reason: 'no_admin', message: 'Lead no longer exists.' };

    const meetingSlot = await getMeetingSlotSettings(adminId);
    if (meetingSlot.preferences.autoConfirm === false) {
      return { status: 'skipped', reason: 'auto_confirm_off', message: 'Automatic booking is switched off in Scheduling settings.' };
    }

    // Already has a scheduled meeting (e.g. a repeat call) → don't create another.
    const existing = await Meeting.findOne({ lead: lead._id, status: 'Scheduled' }).lean();
    if (existing) {
      return { status: 'skipped', reason: 'already_booked', message: 'This lead already has a scheduled meeting.' };
    }

    if (!lead.email) {
      return {
        status: 'skipped',
        reason: 'no_email',
        message: 'The lead has no email address, so the meeting link cannot be sent. Add an email and book from the lead page.',
      };
    }

    // ── Google access ─────────────────────────────────────────────────────
    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(adminId);
    } catch (err: any) {
      if (err instanceof CalendarNotConnectedError || err instanceof CalendarReconnectRequiredError) {
        await Lead.updateOne({ _id: lead._id }, { $set: { status: 'Qualified (Booking Failed)' } });
        return { status: 'failed', reason: 'calendar_not_connected', message: err.message };
      }
      throw err;
    }

    // ── UC-13 A1: no free slot ────────────────────────────────────────────
    const slotStart = await findNextAvailableSlot(accessToken, meetingSlot);
    if (!slotStart) {
      await Lead.updateOne({ _id: lead._id }, { $set: { status: 'Qualified (No Slot)' } });
      return { status: 'failed', reason: 'no_slot', message: 'No free slot in the next two weeks. Check Scheduling settings or book manually.' };
    }

    const result = await bookMeetingForLead({
      adminId,
      lead,
      requestedStart: slotStart,
      inviteEmail: lead.email,
      transcriptId: transcriptId ? String(transcriptId) : null,
      notes: null, // keep the lead-facing invite text clean; bookedBy=null already marks it as AI-booked
      bookedBy: null, // null = booked by the AI pipeline
      accessToken,
      meetingSlot,
    });

    if (!result.ok) {
      // bookMeetingForLead already set "Qualified (Booking Failed)" for sync errors
      if (result.code === 'SLOT_UNAVAILABLE') {
        await Lead.updateOne({ _id: lead._id, status: 'Qualified' }, { $set: { status: 'Qualified (No Slot)' } });
        return { status: 'failed', reason: 'no_slot', message: result.message };
      }
      if (result.code === 'ONE_MEETING_PER_LEAD') {
        return { status: 'skipped', reason: 'already_booked', message: result.message };
      }
      return { status: 'failed', reason: 'booking_failed', message: result.message };
    }

    return {
      status: 'booked',
      meetingId: String(result.meeting._id),
      scheduledAt: result.meeting.scheduledAt,
      meetingLink: result.meetingLink,
      inviteVia: result.inviteVia,
      inviteEmailedTo: result.inviteEmailedTo,
    };
  }
}
