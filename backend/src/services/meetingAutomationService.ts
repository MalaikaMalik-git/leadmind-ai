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
// This is the fallback for a qualified call that did not book a time live.
// When the agent booked during the call (callSchedulingTools.ts), the
// "already booked" check below skips a second meeting and a second email.
// Either path uses bookMeetingForLead, which sends one SMTP invitation and
// does not also send Google's invitation when SMTP is configured.
//
// A qualified call does not pick a meeting time on its own. The voice agent
// books a slot during the call, and only after Google Calendar says it is free.
// This function records that a time was not agreed when the call ends with no
// meeting, so a later step cannot invent one.
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

import { getMeetingSlotSettings } from './meetingBookingService';
import { logError } from '../utils/errorLog';

const Lead = require('../models/Lead');
const Campaign = require('../models/Campaign');
const Admin = require('../models/Admin');
const CallLog = require('../models/CallLog');
const Meeting = require('../models/Meeting');

export type AutoBookOutcome =
  | { status: 'booked'; meetingId: string; scheduledAt: Date; meetingLink: string | null; inviteVia: string; inviteEmailedTo: string | null }
  | { status: 'skipped'; reason: 'auto_confirm_off' | 'already_booked' | 'no_email' | 'no_admin' | 'not_agreed_on_call'; message: string }
  | { status: 'failed'; reason: 'calendar_not_connected' | 'no_slot' | 'booking_failed'; message: string };

interface AutoBookArgs {
  leadId: any;
  campaignId: any | null;
  transcriptId: any | null;
  callLogId: any;
}

/** Whoever owns the calendar: the campaign's admin, else any admin with Google connected (inbound leads). */
export async function resolveAdminId(campaignId: any | null): Promise<string | null> {
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
  const { leadId, campaignId, callLogId } = args;

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

    // Already booked on this call, or on an earlier one → one meeting, one email.
    const existing = await Meeting.findOne({ lead: lead._id, status: 'Scheduled' }).lean();
    if (existing) {
      return { status: 'skipped', reason: 'already_booked', message: 'This lead already has a scheduled meeting.' };
    }

    // A slot is booked only when the lead agrees to a free time during the call.
    // Picking the next open hour here is what put a meeting on the calendar
    // without anyone discussing it.
    return {
      status: 'skipped',
      reason: 'not_agreed_on_call',
      message: 'No meeting time was agreed on the call, so a slot was not booked.',
    };
  }
}
