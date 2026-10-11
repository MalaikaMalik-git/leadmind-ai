// backend/src/controllers/callController.ts
//
// LeadMind AI — Test Outbound Call (Day 14, Session 4)
// Related UCs: UC-05 (Start/Run Outbound Calling Campaign), UC-11 (Connect
// Outbound Call to Lead)
//
// This is a MANUAL, single-call trigger for verifying the VAPI + webhook
// pipeline end-to-end. It is NOT the full campaign calling pipeline — that
// orchestrator (queueing every Pending lead, respecting quiet hours, daily
// limits, and retries) is Day 15's job. This endpoint exists purely so you
// can place one real call to a real phone number and watch the whole chain
// (VAPI call → webhook → CallLog/Transcript/Lead updates) work correctly
// before building the automated orchestrator on top of it.

import { Request, Response } from 'express';
const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');
const Transcript = require('../models/Transcript');
import { syncCampaignAssistant, createOutboundCall, buildPhoneCallOverrides } from '../services/vapiService';
import { qualifyAndPersist } from '../services/qualificationService';
import { TranscriptMessageInput } from '../services/aiScoringService';

const CALL_SORTABLE_FIELDS = ['initiatedAt', 'durationSeconds', 'status'];

export const placeTestOutboundCall = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phoneNumber, campaignId, email, leadName } = req.body as { phoneNumber?: string; campaignId?: string; email?: string; leadName?: string };

    if (!phoneNumber || typeof phoneNumber !== 'string') {
      res.status(422).json({ success: false, message: 'phoneNumber is required (E.164 format, e.g. +15551234567).' });
      return;
    }

    // ── Find the campaign to use ──────────────────────────────────────────────
    // If no campaignId given, use the admin's most recently created campaign
    // (handy for quick manual testing without looking up an ID first).
    const campaign = campaignId
      ? await Campaign.findOne({ _id: campaignId, createdBy: req.admin!.adminId })
      : await Campaign.findOne({ createdBy: req.admin!.adminId, status: { $ne: 'Archived' } }).sort({ createdAt: -1 });

    if (!campaign) {
      res.status(404).json({
        success: false,
        message: campaignId ? 'Campaign not found.' : 'No campaigns exist yet — create one first.',
      });
      return;
    }
    if (campaign.status === 'Archived') {
      res.status(409).json({ success: false, message: 'This campaign is archived. Restore it first to use it.' });
      return;
    }

    // Optional lead email: where the meeting link is sent if this call qualifies.
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      res.status(422).json({ success: false, message: 'email is not a valid address.' });
      return;
    }

    // ── Make sure this campaign has a synced VAPI assistant ──────────────────
    if (!campaign.vapiAssistantId) {
      try {
        const assistantId = await syncCampaignAssistant(campaign);
        campaign.vapiAssistantId = assistantId;
        campaign.vapiSyncedAt = new Date();
        await campaign.save();
      } catch (syncErr: any) {
        console.error('[placeTestOutboundCall] Failed to sync assistant before call:', syncErr.response?.data || syncErr.message);
        res.status(502).json({ success: false, message: 'Could not sync campaign to VAPI before placing call.' });
        return;
      }
    }

    // ── Find or create a Lead for this phone number under this campaign ──────
    let lead = await Lead.findOne({ phone: phoneNumber, campaign: campaign._id });
    if (!lead) {
      lead = await Lead.create({
        fullName: (leadName || '').trim() || 'Outbound Lead',
        phone: phoneNumber,
        email: cleanEmail || null,
        campaign: campaign._id,
        source: 'Manual Entry',
        status: 'Calling',
      });
    } else {
      lead.status = 'Calling';
      if (cleanEmail && !lead.email) lead.email = cleanEmail;
      await lead.save();
    }

    // ── Create the CallLog before dialing, so the webhook has something to update ──
    const callLog = await CallLog.create({
      lead: lead._id,
      campaign: campaign._id,
      callType: 'Outbound',
      status: 'Initiated',
      toNumber: phoneNumber,
      vapiAssistantId: campaign.vapiAssistantId,
      attemptNumber: 1,
    });

    // ── Place the real call via VAPI ──────────────────────────────────────────
    try {
      const vapiCall = await createOutboundCall(
        campaign.vapiAssistantId,
        phoneNumber,
        buildPhoneCallOverrides(campaign, { leadEmail: lead.email, leadName: lead.fullName }),
        {
          leadmindCallLogId: String(callLog._id),
          leadmindLeadId: String(lead._id),
          leadmindCampaignId: String(campaign._id),
          leadmindChannel: 'phone',
        }
      );
      callLog.vapiCallId = vapiCall.id;
      await callLog.save();
    } catch (callErr: any) {
      console.error('[placeTestOutboundCall] VAPI call creation failed:', callErr.response?.data || callErr.message);
      callLog.status = 'Failed';
      callLog.errorMessage = callErr.response?.data?.message || callErr.message;
      await callLog.save();
      res.status(502).json({
        success: false,
        message: 'Failed to place call via VAPI. Check backend logs for details.',
        callLogId: callLog._id,
      });
      return;
    }

    res.status(201).json({
      success: true,
      message: 'Call placed. The phone should ring shortly — watch your backend logs for incoming webhook events.',
      data: {
        leadId: lead._id,
        callLogId: callLog._id,
        vapiCallId: callLog.vapiCallId,
        campaignId: campaign._id,
      },
    });
  } catch (err: any) {
    console.error('[placeTestOutboundCall]', err);
    res.status(500).json({ success: false, message: 'Server error while placing test call.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  Test AI Qualification (Day 16, Session 2)
//  Related UC: UC-12 (Qualify Lead + Score Lead)
//
//  This is a MANUAL trigger for verifying the full qualification pipeline —
//  AI service call + Transcript/Lead/CallLog/Campaign persistence — WITHOUT
//  needing a real VAPI call. It builds a fake "completed call" (CallLog +
//  Transcript) exactly like handleEndOfCallReport does, then runs it through
//  the same qualifyAndPersist() used by the real webhook, so this exercises
//  the identical code path a real call would hit.
// ─────────────────────────────────────────────────────────────────────────────

// Default sample transcript used when the caller doesn't supply their own —
// a clearly-qualified conversation (all 4 criteria present), matching the
// AI service's own Session 1 test case for consistency.
const DEFAULT_TEST_MESSAGES: TranscriptMessageInput[] = [
  { speaker: 'AI', text: 'Hi, thanks for your interest! Could you tell me a bit about the project you have in mind?' },
  { speaker: 'Lead', text: "Sure, we're looking to build a mobile app for our delivery business." },
  { speaker: 'AI', text: 'Great, and do you have a budget range in mind?' },
  { speaker: 'Lead', text: 'Yes, our budget is around $15,000 for the first version.' },
  { speaker: 'AI', text: "What's your expected timeline?" },
  { speaker: 'Lead', text: "We'd like to launch within 2 months if possible." },
  { speaker: 'AI', text: 'And are you the one making the final decision on this project?' },
  { speaker: 'Lead', text: "Yes, I'm the founder, so it's my call." },
];

export const testQualifyLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { leadId, campaignId, messages } = (req.body || {}) as {
      leadId?: string;
      campaignId?: string;
      messages?: TranscriptMessageInput[];
    };

    const transcriptMessages: TranscriptMessageInput[] =
      Array.isArray(messages) && messages.length > 0 ? messages : DEFAULT_TEST_MESSAGES;

    // ── Resolve the campaign (optional — qualification works without one) ────
    const campaign = campaignId
      ? await Campaign.findOne({ _id: campaignId, createdBy: req.admin!.adminId })
      : await Campaign.findOne({ createdBy: req.admin!.adminId, status: { $ne: 'Archived' } }).sort({ createdAt: -1 });

    // ── Resolve or create the lead ────────────────────────────────────────────
    let lead = leadId ? await Lead.findById(leadId) : null;
    if (leadId && !lead) {
      res.status(404).json({ success: false, message: 'Lead not found.' });
      return;
    }
    if (!lead) {
      lead = await Lead.create({
        fullName: 'Test Qualification Lead',
        phone: '+10000000000',
        campaign: campaign?._id || null,
        source: 'Manual Entry',
        status: 'Calling',
      });
    }

    const now = new Date();

    // ── Build a fake completed CallLog, exactly like handleEndOfCallReport ───
    const callLog = await CallLog.create({
      lead: lead._id,
      campaign: campaign?._id || null,
      callType: 'Outbound',
      status: 'Completed',
      toNumber: lead.phone,
      durationSeconds: 180,
      initiatedAt: now,
      answeredAt: now,
      endedAt: now,
      attemptNumber: 1,
    });

    // ── Build the matching Transcript (placeholder finalStatus, as usual) ────
    const transcript = await Transcript.create({
      lead: lead._id,
      campaign: campaign?._id || null,
      callLog: callLog._id,
      callType: 'Outbound',
      callDate: now,
      durationSeconds: 180,
      finalStatus: 'Needs Human Follow-up',
      messages: transcriptMessages,
      isPartial: false,
    });

    callLog.transcript = transcript._id;
    callLog.finalLeadStatus = transcript.finalStatus;

    // ── Run the exact same scoring + persistence path the webhook uses ───────
    const outcome = await qualifyAndPersist({
      transcript,
      callLog,
      leadId: lead._id,
      campaignId: campaign?._id || null,
      messages: transcriptMessages,
    });

    if (outcome.status === 'scored') {
      await transcript.save();
    }
    await callLog.save();

    if (outcome.status === 'failed') {
      res.status(502).json({
        success: false,
        message: 'AI service unreachable — lead left as "Needs Human Follow-up". Is the ai-service running on the port set in AI_SERVICE_URL?',
        data: { leadId: lead._id, callLogId: callLog._id, transcriptId: transcript._id },
      });
      return;
    }

    const updatedLead = await Lead.findById(lead._id);

    res.status(200).json({
      success: true,
      message: 'Qualification pipeline ran successfully.',
      data: {
        leadId: lead._id,
        campaignId: campaign?._id || null,
        callLogId: callLog._id,
        transcriptId: transcript._id,
        qualified: updatedLead.isQualified,
        score: updatedLead.qualificationScore,
        scoreBreakdown: updatedLead.scoreBreakdown,
        reason: updatedLead.qualificationReason,
        leadStatus: updatedLead.status,
      },
    });
  } catch (err: any) {
    console.error('[testQualifyLead]', err);
    res.status(500).json({ success: false, message: 'Server error while testing qualification.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/calls  (Day 20, Session 1)
//  Related UC: UC-08 (View Call Transcript) — this list is the entry point
//  the plan describes: "Table of all calls... Click row → open transcript".
//
//  Unified across BOTH call types — unlike getLeads() (Day 12), which only
//  ever shows leads belonging to an owned campaign and would silently drop
//  any campaign:null lead, this endpoint explicitly includes campaign:null
//  (inbound) calls via the $or below, matching the pattern
//  transcriptController.ts (Day 19) already established. Flagging for the
//  record: getLeads() has that same gap and doesn't correctly show inbound
//  leads either — worth a fix, but it's a Day 12 file outside this
//  session's scope, so it's left untouched here.
// ─────────────────────────────────────────────────────────────────────────────

export const getCalls = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      callType,
      status,
      campaign: campaignId,
      startDate,
      endDate,
      page = '1',
      limit = '20',
      sortBy = 'initiatedAt',
      sortOrder = 'desc',
    } = req.query as Record<string, string>;

    const ownedCampaigns = await Campaign.find({ createdBy: req.admin!.adminId }, '_id').lean();
    const ownedCampaignIds = ownedCampaigns.map((c: any) => c._id.toString());

    // Base scope: this admin's own campaign calls, PLUS any call with no
    // campaign at all (inbound calls not tied to a campaign — Day 18).
    const filter: Record<string, any> = {
      $or: [{ campaign: null }, { campaign: { $in: ownedCampaignIds } }],
    };

    if (campaignId) {
      // Narrowing to one specific campaign — only if the admin owns it.
      if (!ownedCampaignIds.includes(campaignId)) {
        res.status(404).json({ success: false, message: 'Campaign not found.' });
        return;
      }
      delete filter.$or;
      filter.campaign = campaignId;
    }

    if (callType) filter.callType = callType;
    if (status) filter.status = status;

    if (startDate || endDate) {
      filter.initiatedAt = {};
      if (startDate && !isNaN(Date.parse(startDate))) filter.initiatedAt.$gte = new Date(startDate);
      if (endDate && !isNaN(Date.parse(endDate))) filter.initiatedAt.$lte = new Date(endDate);
      if (Object.keys(filter.initiatedAt).length === 0) delete filter.initiatedAt;
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const sortField = CALL_SORTABLE_FIELDS.includes(sortBy) ? sortBy : 'initiatedAt';
    const sortDir = sortOrder === 'asc' ? 1 : -1;

    const [calls, total] = await Promise.all([
      CallLog.find(filter)
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limitNum)
        .populate('lead', 'fullName phone')
        .populate('campaign', 'name')
        .select('lead campaign callType status durationSeconds transcript initiatedAt answeredAt endedAt qualificationScore finalLeadStatus vapiCallId')
        .lean({ virtuals: true })
        .catch((err: any) => {
          // A stale/invalid campaignId filter (or a malformed ObjectId in
          // startDate/endDate parsing edge cases) should read as "no
          // results", not a 500 — mirrors the CastError handling pattern
          // used across the other Day 19 endpoints.
          if (err.name === 'CastError') return [];
          throw err;
        }),
      CallLog.countDocuments(filter).catch((err: any) => {
        if (err.name === 'CastError') return 0;
        throw err;
      }),
    ]);

    res.status(200).json({
      success: true,
      data: calls,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
        hasNext: pageNum * limitNum < total,
        hasPrev: pageNum > 1,
      },
    });
  } catch (err: any) {
    console.error('[getCalls]', err);
    res.status(500).json({ success: false, message: 'Server error while fetching calls.' });
  }
};