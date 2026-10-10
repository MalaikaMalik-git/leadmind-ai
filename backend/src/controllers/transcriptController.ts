// backend/src/controllers/transcriptController.ts
//
// LeadMind AI — Transcript Controller (Day 19, Session 1)
// Related UC: UC-08 (View Call Transcript)
//
// Two endpoints:
//   GET /api/leads/:id/transcripts  — lightweight list of a lead's calls
//                                      (metadata only, no message bodies —
//                                      the frontend already gets a very
//                                      similar list from GET /api/leads/:id's
//                                      callLogs array; this one exists as a
//                                      transcript-centric view for anything
//                                      that wants "just the transcripts",
//                                      e.g. a future per-lead transcript tab)
//   GET /api/transcripts/:id        — one transcript, full ordered message
//                                      array + call metadata, per UC-08's
//                                      "chat-like" viewer requirement
//
// Both reuse leadController.findOwnedLead() for access control — the same
// rule the Lead Detail page (Day 13) uses: a transcript is visible only if
// the admin owns the campaign its lead belongs to. Leads with no campaign
// (inbound calls with no campaign context) are visible to any authenticated
// admin, matching findOwnedLead's existing behavior — this is a
// single-admin FYP system, but the ownership check is kept consistent
// rather than silently bypassed for this one endpoint.

import { Request, Response } from 'express';
const Transcript = require('../models/Transcript');
import { findOwnedLead } from './leadController';

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/leads/:id/transcripts
//  UC-08 main flow step 1-2 (list side): "Admin chooses a lead... opens a
//  particular call record" — this is the list the admin picks from.
// ─────────────────────────────────────────────────────────────────────────────

export const getLeadTranscripts = async (req: Request, res: Response): Promise<void> => {
  try {
    const leadId = req.params.id as string;

    const lead = await findOwnedLead(leadId, req.admin!.adminId);
    if (!lead) {
      res.status(404).json({ success: false, message: 'Lead not found.' });
      return;
    }

    const transcripts = await Transcript.find({ lead: leadId })
      .sort({ callDate: -1 })
      .select('callType callDate durationSeconds finalStatus isPartial qualificationScore messages vapiCallId createdAt')
      .lean();

    // Summaries only — message BODIES aren't sent here, just a count, to
    // keep this list endpoint light. Full messages are fetched per-
    // transcript via GET /api/transcripts/:id when the admin opens one.
    const data = transcripts.map((t: any) => ({
      _id: t._id,
      callType: t.callType,
      callDate: t.callDate,
      durationSeconds: t.durationSeconds,
      finalStatus: t.finalStatus,
      isPartial: t.isPartial,
      qualificationScore: t.qualificationScore,
      messageCount: Array.isArray(t.messages) ? t.messages.length : 0,
      vapiCallId: t.vapiCallId,
      createdAt: t.createdAt,
    }));

    res.status(200).json({ success: true, data });
  } catch (err: any) {
    if (err.name === 'CastError') {
      res.status(404).json({ success: false, message: 'Lead not found.' });
      return;
    }
    console.error('[getLeadTranscripts]', err);
    res.status(500).json({ success: false, message: 'Server error while fetching transcripts.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/transcripts/:id
//  UC-08 main flow steps 3-6: "Admin clicks View Transcript. System
//  retrieves transcript from Database. System displays transcript in
//  chat-like format. Transcript includes timestamps and speaker labels
//  (AI / Lead)." Special requirement: "Chat UI should clearly distinguish
//  AI and Lead messages" and "show call metadata: campaign (if outbound),
//  date, time, duration, call type, and final status."
// ─────────────────────────────────────────────────────────────────────────────

export const getTranscriptById = async (req: Request, res: Response): Promise<void> => {
  try {
    const transcriptId = req.params.id as string;

    const transcript = await Transcript.findById(transcriptId).populate('campaign', 'name');
    if (!transcript) {
      res.status(404).json({ success: false, message: 'Transcript not found.' });
      return;
    }

    // UC-08 A2 — "Transcript Missing": ownership check doubles as this
    // alternative flow. A transcript whose lead isn't owned by this admin
    // (or whose lead was somehow deleted) is treated as not found, same as
    // every other UC-07/UC-08 endpoint in this codebase.
    const lead = await findOwnedLead(String(transcript.lead), req.admin!.adminId);
    if (!lead) {
      res.status(404).json({ success: false, message: 'Transcript not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        _id: transcript._id,
        lead: { _id: lead._id, fullName: lead.fullName, phone: lead.phone },
        campaign: transcript.campaign ? { _id: transcript.campaign._id, name: transcript.campaign.name } : null,
        callType: transcript.callType,
        callDate: transcript.callDate,
        durationSeconds: transcript.durationSeconds,
        durationFormatted: transcript.durationFormatted, // schema virtual, e.g. "03:45"
        finalStatus: transcript.finalStatus,
        isPartial: transcript.isPartial,
        messages: transcript.messages, // ordered [{speaker, text, timestamp}] — UC-08: "preserve message order"
        qualificationScore: transcript.qualificationScore,
        scoreBreakdown: transcript.scoreBreakdown,
        qualificationReason: transcript.qualificationReason,
        detectedTopics: transcript.detectedTopics,
        vapiCallId: transcript.vapiCallId,
        createdAt: transcript.createdAt,
      },
    });
  } catch (err: any) {
    if (err.name === 'CastError') {
      res.status(404).json({ success: false, message: 'Transcript not found.' });
      return;
    }
    console.error('[getTranscriptById]', err);
    res.status(500).json({ success: false, message: 'Server error while fetching transcript.' });
  }
};