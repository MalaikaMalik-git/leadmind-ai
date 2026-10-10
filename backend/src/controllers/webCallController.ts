// backend/src/controllers/webCallController.ts
//
// LeadMind AI — Browser Web Call (DEMO) endpoints
// Related UCs: UC-05/UC-11 (AI call), UC-08 (transcript), UC-12 (qualify),
//              UC-13 (meeting booking)
//
// This is ADDITIVE. The phone-call flow (orchestrator, /test-outbound,
// inbound assistant-request) is not modified. A web call reuses the same
// campaign assistant, the same /api/webhooks/vapi handler, the same
// Transcript → FastAPI scoring → Lead/Campaign updates. Only the transport
// (browser microphone instead of a phone number) differs.
//
//   POST /api/calls/web/start            create Lead + CallLog, return what the browser needs
//   POST /api/calls/web/:id/attach       browser reports the VAPI call id once the call starts
//   GET  /api/calls/web/:id/sync         (a) if webhooks did not reach us, pull the finished call
//                                        from VAPI and run the normal end-of-call pipeline;
//                                        (b) always returns the current result for the UI

import { Request, Response } from 'express';
const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');
const Transcript = require('../models/Transcript');
const Meeting = require('../models/Meeting');
import { syncCampaignAssistant, buildWebCallOverrides, getVapiCall } from '../services/vapiService';
import { handleEndOfCallReport } from './webhookController';
import { findOwnedLead } from './leadController';
import { logError } from '../utils/errorLog';

// Same pattern as the Lead model's email validator, so what passes here can always be saved.
const EMAIL_RE = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;

// ─── POST /api/calls/web/start ───────────────────────────────────────────────
export const startWebCall = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminId = req.admin!.adminId;
    const { campaignId, leadId, leadName, phone, email, company } = (req.body || {}) as Record<string, string | undefined>;

    // Email is mandatory: it is where the Google Calendar invitation (with the
    // meeting link) is sent after a meeting is booked.
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!leadId && !EMAIL_RE.test(cleanEmail)) {
      res.status(422).json({ success: false, message: 'A valid lead email is required so the meeting link can be sent.' });
      return;
    }

    const publicKey = process.env.VAPI_PUBLIC_KEY;
    if (!publicKey) {
      res.status(500).json({ success: false, message: 'VAPI_PUBLIC_KEY is not set in backend/.env (VAPI dashboard → API Keys → Public Key).' });
      return;
    }

    // ── Campaign (same selection rule as /test-outbound) ──────────────────
    const campaign = campaignId
      ? await Campaign.findOne({ _id: campaignId, createdBy: adminId })
      : await Campaign.findOne({ createdBy: adminId, status: { $ne: 'Archived' } }).sort({ createdAt: -1 });
    if (!campaign) {
      res.status(404).json({ success: false, message: campaignId ? 'Campaign not found.' : 'No campaigns exist yet — create one first.' });
      return;
    }
    if (campaign.status === 'Archived') {
      res.status(409).json({ success: false, message: 'This campaign is archived. Restore it first to use it.' });
      return;
    }

    // ── Make sure the campaign has a synced VAPI assistant (same as phone flow) ──
    if (!campaign.vapiAssistantId) {
      try {
        campaign.vapiAssistantId = await syncCampaignAssistant(campaign);
        campaign.vapiSyncedAt = new Date();
        await campaign.save();
      } catch (syncErr: any) {
        console.error('[startWebCall] assistant sync failed:', syncErr.response?.data || syncErr.message);
        res.status(502).json({ success: false, message: 'Could not sync campaign to VAPI before starting the web call.' });
        return;
      }
    }

    // ── Lead: use an existing one, or create a fresh demo lead ────────────
    let lead: any;
    if (leadId) {
      lead = await findOwnedLead(leadId, adminId);
      if (!lead) {
        res.status(404).json({ success: false, message: 'Lead not found.' });
        return;
      }
      lead.status = 'Calling';
      await lead.save();
    } else {
      lead = await Lead.create({
        fullName: (leadName || '').trim() || 'Web Lead',
        phone: (phone || '').trim() || '+920000000000', // placeholder — web calls have no phone number
        email: cleanEmail,
        company: company?.trim() || null,
        campaign: campaign._id,
        source: 'Manual Entry',
        status: 'Calling',
      });
      await Campaign.updateOne({ _id: campaign._id }, { $inc: { 'stats.totalLeads': 1 } });
    }

    // ── CallLog created BEFORE the call so webhooks have something to update ──
    const callLog = await CallLog.create({
      lead: lead._id,
      campaign: campaign._id,
      callType: 'Outbound',
      channel: 'Web',
      status: 'Initiated',
      fromNumber: 'web-browser',
      toNumber: 'web-call',
      vapiAssistantId: campaign.vapiAssistantId,
      attemptNumber: 1,
    });
    await Campaign.updateOne({ _id: campaign._id }, { $inc: { 'stats.callsMade': 1 } });

    res.status(201).json({
      success: true,
      data: {
        callLogId: callLog._id,
        leadId: lead._id,
        campaignId: campaign._id,
        leadName: lead.fullName,
        assistantId: campaign.vapiAssistantId,
        publicKey,
        assistantOverrides: buildWebCallOverrides(String(callLog._id), String(lead._id), String(campaign._id), {
          campaign,
          leadName: (leadName || '').trim() || undefined,
          leadEmail: cleanEmail || lead.email || undefined,
        }),
      },
    });
  } catch (err: any) {
    await logError('webCall.start', err, { adminId: req.admin?.adminId });
    res.status(500).json({ success: false, message: 'Server error while preparing the web call.' });
  }
};

// ─── POST /api/calls/web/:id/attach ──────────────────────────────────────────
export const attachWebCall = async (req: Request, res: Response): Promise<void> => {
  try {
    const { vapiCallId } = (req.body || {}) as { vapiCallId?: string };
    if (!vapiCallId) {
      res.status(422).json({ success: false, message: 'vapiCallId is required.' });
      return;
    }
    const callLog = await CallLog.findOne({ _id: req.params.id, channel: 'Web' });
    if (!callLog) {
      res.status(404).json({ success: false, message: 'Web call not found.' });
      return;
    }
    if (!callLog.vapiCallId) {
      callLog.vapiCallId = vapiCallId;
      if (callLog.status === 'Initiated') callLog.status = 'Answered';
      if (!callLog.answeredAt) callLog.answeredAt = new Date();
      await callLog.save().catch((e: any) => {
        if (e.code !== 11000) throw e; // webhook already attached the same id — fine
      });
      await Lead.updateOne({ _id: callLog.lead }, { $set: { lastCalledAt: new Date() } });
    }
    res.status(200).json({ success: true });
  } catch (err: any) {
    await logError('webCall.attach', err, { callLogId: req.params.id });
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── GET /api/calls/web/:id/sync ─────────────────────────────────────────────
export const syncWebCall = async (req: Request, res: Response): Promise<void> => {
  try {
    let callLog = await CallLog.findOne({ _id: req.params.id, channel: 'Web' });
    if (!callLog) {
      res.status(404).json({ success: false, message: 'Web call not found.' });
      return;
    }

    // Fallback: webhooks have not processed this call yet → pull it from VAPI.
    if (!callLog.endOfCallProcessedAt && callLog.vapiCallId) {
      const vapiCall = await getVapiCall(callLog.vapiCallId);
      if (vapiCall?.status === 'ended') {
        const artifactMessages = (vapiCall.artifact?.messages || vapiCall.messages || []).map((m: any) => ({
          ...m,
          role: m.role === 'bot' ? 'assistant' : m.role,
        }));
        const startedAt = vapiCall.startedAt ? new Date(vapiCall.startedAt).getTime() : null;
        const endedAt = vapiCall.endedAt ? new Date(vapiCall.endedAt).getTime() : null;

        // Same shape VAPI posts to /api/webhooks/vapi → identical pipeline.
        await handleEndOfCallReport({
          type: 'end-of-call-report',
          call: { ...vapiCall, id: callLog.vapiCallId, type: vapiCall.type || 'webCall' },
          endedReason: vapiCall.endedReason,
          durationSeconds: startedAt && endedAt ? (endedAt - startedAt) / 1000 : 0,
          transcript: vapiCall.artifact?.transcript || vapiCall.transcript || null,
          artifact: { messages: artifactMessages },
        });
      }
    }

    // ── Current state for the UI ─────────────────────────────────────────
    callLog = await CallLog.findById(callLog._id);
    const lead = await Lead.findById(callLog.lead).lean();
    const transcript = callLog.transcript ? await Transcript.findById(callLog.transcript).lean() : null;

    // Outcome of the automatic "book + email the link" step (qualified leads only).
    // The meeting is looked up by lead, so it is found even if the CallLog
    // pointer was not written yet.
    const meetingDoc = lead?.isQualified
      ? await Meeting.findOne({ lead: callLog.lead, status: 'Scheduled' }).sort({ createdAt: -1 }).lean()
      : null;
    const autoBooking = callLog.autoBooking?.status
      ? {
          status: callLog.autoBooking.status,
          reason: callLog.autoBooking.reason,
          message: callLog.autoBooking.message,
        }
      : meetingDoc
        ? { status: 'booked', reason: null, message: null }
        : null;

    res.status(200).json({
      success: true,
      data: {
        callLogId: callLog._id,
        callStatus: callLog.status,
        processed: !!callLog.endOfCallProcessedAt,
        durationSeconds: callLog.durationSeconds,
        leadId: callLog.lead,
        leadStatus: lead?.status ?? null,
        transcriptId: transcript?._id ?? null,
        transcriptFinalStatus: transcript?.finalStatus ?? null,
        messages: transcript?.messages ?? [],
        qualificationScore: lead?.qualificationScore ?? null,
        isQualified: lead?.isQualified ?? null,
        scoreBreakdown: lead?.scoreBreakdown ?? null,
        qualificationReason: lead?.qualificationReason ?? null,
        detectedTopics: (transcript as any)?.detectedTopics ?? [],
        autoBooking,
        meeting: meetingDoc
          ? {
              meetingId: meetingDoc._id,
              scheduledAt: meetingDoc.scheduledAt,
              durationMinutes: meetingDoc.durationMinutes,
              timezone: meetingDoc.timezone,
              meetingLink: meetingDoc.googleCalendar?.meetingLink ?? null,
              inviteVia: meetingDoc.invite?.channel ?? 'none',
              inviteEmailedTo: meetingDoc.invite?.channel && meetingDoc.invite.channel !== 'none' ? meetingDoc.invite.sentTo : null,
              inviteError: meetingDoc.invite?.error ?? null,
            }
          : null,
      },
    });
  } catch (err: any) {
    await logError('webCall.sync', err, { callLogId: req.params.id });
    res.status(502).json({ success: false, message: err.response?.data?.message || 'Could not sync the web call.' });
  }
};
