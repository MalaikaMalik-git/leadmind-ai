// backend/src/controllers/campaignOrchestratorController.ts
//
// LeadMind AI — Campaign Orchestrator Controller (Day 15, Session 1)
// Related UC: UC-05 Start/Run Outbound Calling Campaign
//
// Endpoints:
//   POST /api/campaigns/:id/start          — begin dialing (UC-05 main flow)
//   POST /api/campaigns/:id/pause          — halt further dialing
//   GET  /api/campaigns/:id/queue-status   — live queue snapshot for the UI
//
// Kept separate from campaignController.ts (which owns UC-02/UC-03 CRUD) so
// each file maps cleanly to one group of use cases.

import { Request, Response } from 'express';
const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
import { dialNextEligibleLead, countCallsMadeToday } from '../services/campaignOrchestratorService';
import { getQuietHoursStatus } from '../utils/quietHours';
import { logAction } from '../utils/auditLog'; // ← Day 26, Session 1

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/campaigns/:id/start
//  UC-05 Main Success Scenario, steps 1-2 (+ kicks off step 3 onward once).
//
//  Pre-conditions enforced here (UC-05 Pre-Condition list):
//   • Campaign exists and belongs to this admin
//   • At least one Pending lead exists (leads uploaded — UC-04)
//   • VAPI assistant is synced (credentials configured — Day 14)
//
//  This dials exactly the FIRST eligible lead synchronously so the admin
//  gets immediate feedback. Every subsequent lead is dialed automatically
//  by the webhook handler once each call ends (Session 2) — this endpoint
//  does not loop or block waiting for the whole campaign to finish.
// ─────────────────────────────────────────────────────────────────────────────

export const startCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      createdBy: req.admin!.adminId,
    });

    if (!campaign) {
      res.status(404).json({ success: false, message: 'Campaign not found.' });
      return;
    }

    if (campaign.status === 'Running') {
      res.status(409).json({ success: false, message: 'Campaign is already Running.' });
      return;
    }

    if (campaign.status === 'Completed' || campaign.status === 'Archived') {
      res.status(409).json({ success: false, message: `Cannot start a campaign in "${campaign.status}" state.` });
      return;
    }

    // ── UC-05 Pre-Condition: leads must be uploaded (UC-04) ──────────────────
    const pendingCount = await Lead.countDocuments({ campaign: campaign._id, status: 'Pending' });
    if (pendingCount === 0) {
      res.status(422).json({
        success: false,
        message: 'No Pending leads to call. Upload a lead list first (UC-04).',
      });
      return;
    }

    // ── Flip to Running before dialing, so the orchestrator's own state
    //    check (campaign.status === 'Running') passes ────────────────────────
    campaign.status = 'Running';
    campaign.startedAt = new Date();
    campaign.pausedAt = null;
    await campaign.save();

    // ── Day 26, Session 1: audit log entry ─────────────────────────────────
    await logAction(
      'campaign.start',
      req.admin!.adminId,
      req.admin!.email,
      `Started campaign "${campaign.name}".`,
      { campaignId: campaign._id, previousStatus: 'not-running', newStatus: 'Running' }
    );

    // ── Attempt to dial the first eligible lead ───────────────────────────────
    const dialResult = await dialNextEligibleLead(String(campaign._id));

    res.status(200).json({
      success: true,
      message: 'Campaign started.',
      data: {
        campaignId: campaign._id,
        status: campaign.status,
        startedAt: campaign.startedAt,
        pendingLeads: pendingCount,
      },
      dialResult,
    });
  } catch (err: any) {
    if (err.name === 'CastError') {
      res.status(404).json({ success: false, message: 'Campaign not found.' });
      return;
    }
    console.error('[startCampaign]', err);
    res.status(500).json({ success: false, message: 'Server error while starting campaign.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/campaigns/:id/pause
//  UC-05 does not require in-flight calls to be interrupted — pausing only
//  stops the NEXT lead from being dialed. Any call already placed with VAPI
//  will run to completion and its webhook events will still be processed
//  normally (they just won't trigger a further auto-dial once Session 2's
//  webhook hook checks campaign.status and sees Paused).
// ─────────────────────────────────────────────────────────────────────────────

export const pauseCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      createdBy: req.admin!.adminId,
    });

    if (!campaign) {
      res.status(404).json({ success: false, message: 'Campaign not found.' });
      return;
    }

    if (campaign.status !== 'Running') {
      res.status(409).json({ success: false, message: `Cannot pause a campaign in "${campaign.status}" state.` });
      return;
    }

    campaign.status = 'Paused';
    campaign.pausedAt = new Date();
    await campaign.save();

    // ── Day 26, Session 1: audit log entry ─────────────────────────────────
    await logAction(
      'campaign.pause',
      req.admin!.adminId,
      req.admin!.email,
      `Paused campaign "${campaign.name}".`,
      { campaignId: campaign._id, previousStatus: 'Running', newStatus: 'Paused' }
    );

    res.status(200).json({
      success: true,
      message: 'Campaign paused. In-flight calls will finish; no new calls will be dialed.',
      data: {
        campaignId: campaign._id,
        status: campaign.status,
        pausedAt: campaign.pausedAt,
      },
    });
  } catch (err: any) {
    if (err.name === 'CastError') {
      res.status(404).json({ success: false, message: 'Campaign not found.' });
      return;
    }
    console.error('[pauseCampaign]', err);
    res.status(500).json({ success: false, message: 'Server error while pausing campaign.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/campaigns/:id/queue-status
//  Read-only snapshot for the dashboard: lead breakdown by status, today's
//  call count vs. daily limit, and live quiet-hours state. Not part of a
//  numbered UC directly, but supports UC-05/UC-07's dashboard visibility
//  requirements and gives us a way to verify Session 1 without waiting on
//  real webhook traffic.
// ─────────────────────────────────────────────────────────────────────────────

export const getQueueStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      createdBy: req.admin!.adminId,
    });

    if (!campaign) {
      res.status(404).json({ success: false, message: 'Campaign not found.' });
      return;
    }

    const statusCounts = await Lead.aggregate([
      { $match: { campaign: campaign._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const leadsByStatus: Record<string, number> = {};
    for (const row of statusCounts) {
      leadsByStatus[row._id] = row.count;
    }

    const callsToday = await countCallsMadeToday(String(campaign._id));
    const quietHoursStatus = getQuietHoursStatus(campaign.quietHours, new Date());

    res.status(200).json({
      success: true,
      data: {
        campaignId: campaign._id,
        campaignStatus: campaign.status,
        leadsByStatus,
        dailyCallLimit: campaign.dailyCallLimit,
        callsMadeToday: callsToday,
        callsRemainingToday: Math.max(0, campaign.dailyCallLimit - callsToday),
        quietHours: quietHoursStatus,
      },
    });
  } catch (err: any) {
    if (err.name === 'CastError') {
      res.status(404).json({ success: false, message: 'Campaign not found.' });
      return;
    }
    console.error('[getQueueStatus]', err);
    res.status(500).json({ success: false, message: 'Server error while fetching queue status.' });
  }
};