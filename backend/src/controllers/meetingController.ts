// backend/src/controllers/meetingController.ts
//
// LeadMind AI — Meeting Controller (Day 23, Session 2)
// Related UC: UC-13 (Schedule Meeting)
//
// POST /api/meetings/book
//
// This is the REST endpoint itself — it's callable by an admin (e.g. a
// future "Schedule Meeting" button on the Lead Detail page) or, later, by
// a VAPI tool-call during a live conversation. Wiring up WHO calls this
// and WHEN (admin UI vs. live in-call booking) is future-day scope; this
// session builds the endpoint and its correctness guarantees.

import { Request, Response } from 'express';
const Lead = require('../models/Lead');
import { findOwnedLead } from './leadController';
import { bookMeetingForLead } from '../services/meetingBookingService';
import { logError } from '../utils/errorLog';

export const bookMeeting = async (req: Request, res: Response): Promise<void> => {
  const adminId = req.admin!.adminId;
  const { leadId, startTime, transcriptId, notes, email } = req.body as {
    leadId?: string;
    startTime?: string;
    transcriptId?: string;
    notes?: string;
    email?: string; // optional: lets the admin supply/update the address the invite is sent to
  };

  try {
    // ── Basic input validation ────────────────────────────────────────────
    if (!leadId || !startTime) {
      res.status(400).json({ success: false, message: 'leadId and startTime are required.' });
      return;
    }
    const requestedStart = new Date(startTime);
    if (isNaN(requestedStart.getTime())) {
      res.status(400).json({ success: false, message: 'startTime is not a valid date.' });
      return;
    }
    if (requestedStart.getTime() <= Date.now()) {
      res.status(400).json({ success: false, message: 'startTime must be in the future.' });
      return;
    }

    // ── Lead ownership (same rule as every other lead-scoped endpoint) ────
    const lead = await findOwnedLead(leadId, adminId);
    if (!lead) {
      res.status(404).json({ success: false, message: 'Lead not found.' });
      return;
    }

    // ── Invite address ────────────────────────────────────────────────────
    // The Google Calendar invitation (with the meeting link) is emailed to the
    // lead's address. If the admin supplies one in the request, validate it and
    // use it (saving it on the lead if the lead had none).
    const providedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (providedEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(providedEmail)) {
        res.status(400).json({ success: false, message: 'email is not a valid address.' });
        return;
      }
      if (!lead.email) {
        await Lead.updateOne({ _id: lead._id }, { $set: { email: providedEmail } });
        lead.email = providedEmail;
      }
    }
    const inviteEmail: string | null = providedEmail || lead.email || null;

    // ── Book (shared with the automatic post-call booking) ─────────────────
    // The service re-verifies the slot, syncs Google Calendar and delivers
    // the invitation email. See services/meetingBookingService.ts.
    const result = await bookMeetingForLead({
      adminId,
      lead,
      requestedStart,
      inviteEmail,
      transcriptId: transcriptId || null,
      notes: notes || null,
      bookedBy: adminId, // set = booked by an admin action, not live during a call
    });

    if (!result.ok) {
      res.status(result.status).json({
        success: false,
        message: result.message,
        code: result.code,
        ...(result.extra || {}),
      });
      return;
    }

    res.status(201).json({
      success: true,
      data: {
        meetingId: result.meeting._id,
        scheduledAt: result.meeting.scheduledAt,
        durationMinutes: result.meeting.durationMinutes,
        timezone: result.meeting.timezone,
        meetingLink: result.meetingLink,
        inviteEmailedTo: result.inviteEmailedTo, // null = no invitation could be sent
        inviteVia: result.inviteVia,             // 'smtp' | 'google' | 'none'
        inviteError: result.inviteError,
      },
    });
  } catch (err: any) {
    await logError('meeting.bookMeeting', err, { adminId, leadId });
    res.status(500).json({ success: false, message: 'Server error while booking the meeting.' });
  }
};