import { Request, Response } from 'express';
const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');
const Transcript = require('../models/Transcript');
const Meeting = require('../models/Meeting');
import { syncCampaignAssistant, deleteAssistant } from '../services/vapiService';
import { computeCampaignStats } from '../services/statsService';
import { logAction } from '../utils/auditLog'; // ← Day 26, Session 1

// ─────────────────────────────────────────────────────────────────────────────
//  LeadMind AI — Campaign Controller
//  UC-02  Create Campaign
//  UC-03  Update Campaign Settings (tone / instructions / quiet hours)
//
//  All routes are protected — req.admin is guaranteed by the protect middleware.
//  Campaign model uses soft-delete: isDeleted flag + pre(/^find/) hook filters
//  deleted documents automatically so no query needs { isDeleted: false }.
//
//  Day 14 addition: every create/update also syncs the campaign's tone,
//  goal, and instructions to a VAPI assistant (UC-02/UC-03 special
//  requirement — "instructions must be used by the AI agent"). VAPI sync
//  failures are logged but never block the campaign save — the admin can
//  still use the dashboard even if VAPI is temporarily unreachable, and can
//  retry the sync manually via POST /api/campaigns/:id/sync-vapi.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Validate quiet hours: only invalid when start === end (zero-length window).
 * Overnight windows that cross midnight (e.g. 22:00 -> 08:00, also this
 * form's own default) are valid — an end time "before" the start time
 * numerically just means the window wraps to the next day.
 * Returns an error string or null.
 */
const validateQuietHours = (qh: {
  enabled?: boolean;
  startTime?: string;
  endTime?: string;
}): string | null => {
  if (!qh?.enabled) return null;
  if (!qh.startTime || !qh.endTime) return 'Quiet hours start and end time are required when enabled.';
  if (qh.startTime === qh.endTime) {
    return 'Quiet hours start and end time must be different. (UC-03 A1)';
  }
  return null;
};

/**
 * Attempts to sync a campaign to VAPI and persist the resulting assistant ID.
 * Never throws — logs and returns a status string instead, so callers can
 * include sync status in the response without risking the main request.
 */
const trySyncVapiAssistant = async (campaign: any): Promise<'synced' | 'failed'> => {
  try {
    const assistantId = await syncCampaignAssistant(campaign);
    campaign.vapiAssistantId = assistantId;
    campaign.vapiSyncedAt = new Date();
    await Campaign.updateOne(
      { _id: campaign._id },
      { $set: { vapiAssistantId: assistantId, vapiSyncedAt: campaign.vapiSyncedAt } }
    );
    return 'synced';
  } catch (err: any) {
    console.error('[vapiSync] Failed to sync campaign to VAPI:', err.response?.data || err.message);
    return 'failed';
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/campaigns
//  UC-02 Main Success Scenario
//  Creates a new campaign owned by the authenticated admin.
//  Returns 201 + the saved campaign document.
// ─────────────────────────────────────────────────────────────────────────────

export const createCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      goal,
      tone,
      instructions,
      dailyCallLimit,
      quietHours,
      startDate,
      endDate,
      qualificationCriteria,
      retryPolicy,
    } = req.body;

    // ── UC-02 A1: Required field guard ────────────────────────────────────────
    const missing: string[] = [];
    if (!name)         missing.push('name');
    if (!goal)         missing.push('goal');
    if (!tone)         missing.push('tone');
    if (!instructions) missing.push('instructions');
    if (dailyCallLimit === undefined || dailyCallLimit === null) missing.push('dailyCallLimit');

    if (missing.length > 0) {
      res.status(422).json({
        success: false,
        message: 'Missing required fields.',
        errors: missing.map(f => ({ field: f, message: `${f} is required.` })),
      });
      return;
    }

    // ── UC-03 A1: Quiet hours validation ─────────────────────────────────────
    if (quietHours) {
      const qhError = validateQuietHours(quietHours);
      if (qhError) {
        res.status(422).json({
          success: false,
          message: qhError,
          errors: [{ field: 'quietHours', message: qhError }],
        });
        return;
      }
    }

    // ── Build and save ────────────────────────────────────────────────────────
    const campaign = await Campaign.create({
      name:       name.trim(),
      goal:       goal.trim(),
      tone,
      instructions: instructions.trim(),
      dailyCallLimit,
      quietHours,
      startDate:  startDate  || null,
      endDate:    endDate    || null,
      qualificationCriteria,
      retryPolicy,
      createdBy:  req.admin!.adminId,   // injected by protect middleware
      status:     'Draft',
    });

    // ── Day 14: sync tone/goal/instructions to a VAPI assistant ───────────────
    const vapiStatus = await trySyncVapiAssistant(campaign);

    // ── Day 26, Session 1: audit log entry ─────────────────────────────────
    await logAction(
      'campaign.create',
      req.admin!.adminId,
      req.admin!.email,
      `Created campaign "${campaign.name}".`,
      { campaignId: campaign._id }
    );

    res.status(201).json({
      success: true,
      message: 'Campaign created successfully.',
      data: campaign,
      vapiSync: vapiStatus,
    });
  } catch (err: any) {
    // Mongoose validation error (e.g. invalid tone enum value)
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map((e: any) => ({
        field: e.path,
        message: e.message,
      }));
      res.status(422).json({ success: false, message: 'Validation failed.', errors });
      return;
    }
    console.error('[createCampaign]', err);
    res.status(500).json({ success: false, message: 'Server error while creating campaign.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/campaigns
//  Returns a paginated, filterable list of campaigns for this admin.
//
//  Query params:
//    page    (default 1)
//    limit   (default 10, max 50)
//    status  Draft | Running | Paused | Completed | Archived
//    search  partial name match (case-insensitive)
// ─────────────────────────────────────────────────────────────────────────────

export const getCampaigns = async (req: Request, res: Response): Promise<void> => {
  try {
    const page   = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip   = (page - 1) * limit;
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;

    // ── Build filter ──────────────────────────────────────────────────────────
    const filter: Record<string, any> = {
      createdBy: req.admin!.adminId,
    };
    // Archived campaigns are hidden from the working lists unless asked for:
    //   ?status=Archived        → only archived (the "Archived" tab)
    //   ?includeArchived=true   → everything (filter dropdowns on Calls/Leads/Analytics,
    //                             so historical data can still be filtered by campaign)
    if (status) filter.status = status;
    else if (req.query.includeArchived !== 'true') filter.status = { $ne: 'Archived' };
    if (search) filter.name = { $regex: search, $options: 'i' };

    // ── Run count + data in parallel ──────────────────────────────────────────
    const [total, campaigns] = await Promise.all([
      Campaign.countDocuments(filter),
      Campaign.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-__v'),
    ]);

    // Replace the incrementally-updated Campaign.stats counters with live
    // numbers computed from leads / calls / meetings (same source as the
    // Dashboard and Analytics pages), so every page agrees.
    const live = await computeCampaignStats(campaigns.map((c: any) => c._id));
    const withLiveStats = campaigns.map((c: any) => {
      const obj = c.toObject();
      obj.stats = { ...(obj.stats || {}), ...live[String(c._id)] };
      return obj;
    });

    res.status(200).json({
      success: true,
      data: withLiveStats,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (err: any) {
    console.error('[getCampaigns]', err);
    res.status(500).json({ success: false, message: 'Server error while fetching campaigns.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/campaigns/:id
//  Returns a single campaign by ID.
//  404 if not found or belongs to a different admin.
// ─────────────────────────────────────────────────────────────────────────────

export const getCampaignById = async (req: Request, res: Response): Promise<void> => {
  try {
    const campaign = await Campaign.findOne({
      _id:       req.params.id,
      createdBy: req.admin!.adminId,
    }).select('-__v');

    if (!campaign) {
      res.status(404).json({ success: false, message: 'Campaign not found.' });
      return;
    }

    const live = await computeCampaignStats([campaign._id]);
    const obj = campaign.toObject();
    obj.stats = { ...(obj.stats || {}), ...live[String(campaign._id)] };

    res.status(200).json({ success: true, data: obj });
  } catch (err: any) {
    // Invalid ObjectId format
    if (err.name === 'CastError') {
      res.status(404).json({ success: false, message: 'Campaign not found.' });
      return;
    }
    console.error('[getCampaignById]', err);
    res.status(500).json({ success: false, message: 'Server error while fetching campaign.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  PUT /api/campaigns/:id
//  UC-03 Main Success Scenario — Update Campaign Settings
//
//  Rules (from spec):
//   • Admin can update goal, tone, instructions, quietHours, dailyCallLimit,
//     startDate, endDate, qualificationCriteria, retryPolicy.
//   • If campaign is Running, update is still allowed (UC-03 A2).
//     Updated settings apply only to future calls — ongoing calls unaffected.
//   • status and stats are NOT updatable through this endpoint.
//   • Quiet hours must pass validation (UC-03 A1).
//   • Day 14: if tone/goal/instructions/qualificationCriteria changed, the
//     linked VAPI assistant is re-synced so future calls use the new script.
// ─────────────────────────────────────────────────────────────────────────────

export const updateCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    // ── Find and ownership check ──────────────────────────────────────────────
    const campaign = await Campaign.findOne({
      _id:       req.params.id,
      createdBy: req.admin!.adminId,
    });

    if (!campaign) {
      res.status(404).json({ success: false, message: 'Campaign not found.' });
      return;
    }

    if (campaign.status === 'Archived') {
      res.status(409).json({ success: false, message: 'This campaign is archived. Restore it before editing.' });
      return;
    }

    // ── Extract allowed update fields ─────────────────────────────────────────
    const {
      name,
      goal,
      tone,
      instructions,
      dailyCallLimit,
      quietHours,
      startDate,
      endDate,
      qualificationCriteria,
      retryPolicy,
    } = req.body;

    // ── UC-03 A1: Quiet hours validation ─────────────────────────────────────
    if (quietHours !== undefined) {
      const qhError = validateQuietHours(quietHours);
      if (qhError) {
        res.status(422).json({
          success: false,
          message: qhError,
          errors: [{ field: 'quietHours', message: qhError }],
        });
        return;
      }
    }

    // ── Detect whether anything VAPI-relevant is changing ─────────────────────
    const vapiRelevantChanged =
      (goal !== undefined && goal.trim() !== campaign.goal) ||
      (tone !== undefined && tone !== campaign.tone) ||
      (instructions !== undefined && instructions.trim() !== campaign.instructions) ||
      (qualificationCriteria !== undefined);

    // ── Apply only the fields that were sent ──────────────────────────────────
    if (name         !== undefined) campaign.name              = name.trim();
    if (goal         !== undefined) campaign.goal              = goal.trim();
    if (tone         !== undefined) campaign.tone              = tone;
    if (instructions !== undefined) campaign.instructions      = instructions.trim();
    if (dailyCallLimit !== undefined) campaign.dailyCallLimit  = dailyCallLimit;
    if (quietHours   !== undefined) campaign.quietHours        = quietHours;
    if (startDate    !== undefined) campaign.startDate         = startDate;
    if (endDate      !== undefined) campaign.endDate           = endDate;
    if (qualificationCriteria !== undefined) campaign.qualificationCriteria = qualificationCriteria;
    if (retryPolicy  !== undefined) campaign.retryPolicy       = retryPolicy;

    // ── Save (triggers pre-save validation: endDate > startDate) ─────────────
    await campaign.save();

    // ── Day 14: re-sync VAPI assistant only if something relevant changed ────
    let vapiStatus: 'synced' | 'failed' | 'skipped' = 'skipped';
    if (vapiRelevantChanged) {
      vapiStatus = await trySyncVapiAssistant(campaign);
    }

    res.status(200).json({
      success: true,
      message: campaign.status === 'Running'
        ? 'Campaign updated. Changes will apply to future calls.'
        : 'Campaign updated successfully.',
      data: campaign,
      vapiSync: vapiStatus,
    });
  } catch (err: any) {
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map((e: any) => ({
        field: e.path,
        message: e.message,
      }));
      res.status(422).json({ success: false, message: 'Validation failed.', errors });
      return;
    }
    if (err.name === 'CastError') {
      res.status(404).json({ success: false, message: 'Campaign not found.' });
      return;
    }
    // Campaign model pre-save hook throws plain Error for date logic
    if (err.message?.includes('End date must be after')) {
      res.status(422).json({
        success: false,
        message: err.message,
        errors: [{ field: 'endDate', message: err.message }],
      });
      return;
    }
    console.error('[updateCampaign]', err);
    res.status(500).json({ success: false, message: 'Server error while updating campaign.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/campaigns/:id/sync-vapi
//  Day 14 addition — manual re-sync trigger. Useful when the automatic sync
//  on create/update failed (e.g. VAPI was down) and the admin wants to retry
//  without editing the campaign again.
// ─────────────────────────────────────────────────────────────────────────────

export const syncCampaignVapi = async (req: Request, res: Response): Promise<void> => {
  try {
    const campaign = await Campaign.findOne({
      _id:       req.params.id,
      createdBy: req.admin!.adminId,
    });

    if (!campaign) {
      res.status(404).json({ success: false, message: 'Campaign not found.' });
      return;
    }

    const vapiStatus = await trySyncVapiAssistant(campaign);

    if (vapiStatus === 'failed') {
      res.status(502).json({
        success: false,
        message: 'Failed to sync campaign to VAPI. Check backend logs for details.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Campaign synced to VAPI successfully.',
      data: {
        vapiAssistantId: campaign.vapiAssistantId,
        vapiSyncedAt: campaign.vapiSyncedAt,
      },
    });
  } catch (err: any) {
    if (err.name === 'CastError') {
      res.status(404).json({ success: false, message: 'Campaign not found.' });
      return;
    }
    console.error('[syncCampaignVapi]', err);
    res.status(500).json({ success: false, message: 'Server error while syncing campaign to VAPI.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  Archive / Restore / Permanent delete — how a production system treats
//  "delete campaign"
//
//  A campaign is the container for the most valuable thing the product makes:
//  qualified leads, call recordings/transcripts and booked meetings. Wiping
//  those because someone tidied up the campaign list is the classic mistake,
//  so deletion is two deliberate steps:
//
//   1. ARCHIVE  (default, reversible)
//        Campaign moves to status "Archived": it disappears from the working
//        lists, can no longer be started/edited/used for calls, but EVERY
//        lead, call, transcript and meeting is kept and still counts in
//        Leads / Calls / Transcripts / Analytics. Restore brings it back.
//
//   2. DELETE PERMANENTLY  (irreversible, guarded)
//        Only for an Archived campaign (or a Draft that never made a call).
//        Requires typing the campaign name. By default QUALIFIED leads — and
//        their calls, transcripts and meetings — are KEPT and detached from
//        the campaign (campaign = null, like inbound leads); everything else
//        is removed. "keepQualified=false" removes absolutely everything and
//        is refused while upcoming meetings exist, so a lead is never left
//        with a calendar invite for a meeting that silently vanished.
// ─────────────────────────────────────────────────────────────────────────────

// Lead statuses that mean "this lead is worth keeping"
const QUALIFIED_LEAD_STATUSES = ['Qualified', 'Meeting Booked', 'Qualified (No Slot)', 'Qualified (Booking Failed)'];
const QUALIFIED_LEAD_FILTER = { $or: [{ isQualified: true }, { status: { $in: QUALIFIED_LEAD_STATUSES } }] };

async function loadOwnedCampaign(req: Request): Promise<any | null> {
  return Campaign.findOne({ _id: req.params.id, createdBy: req.admin!.adminId });
}

async function computeImpact(campaignId: any) {
  const now = new Date();
  const [leads, qualifiedLeads, pendingLeads, calls, transcripts, meetings, upcomingMeetings] = await Promise.all([
    Lead.countDocuments({ campaign: campaignId }),
    Lead.countDocuments({ campaign: campaignId, ...QUALIFIED_LEAD_FILTER }),
    Lead.countDocuments({ campaign: campaignId, status: 'Pending' }),
    CallLog.countDocuments({ campaign: campaignId }),
    Transcript.countDocuments({ campaign: campaignId }),
    Meeting.countDocuments({ campaign: campaignId }),
    Meeting.countDocuments({ campaign: campaignId, status: 'Scheduled', scheduledAt: { $gte: now } }),
  ]);
  return { leads, qualifiedLeads, pendingLeads, calls, transcripts, meetings, upcomingMeetings };
}

// ── GET /api/campaigns/:id/impact — what a delete would touch (for the confirm dialog) ──
export const getCampaignImpact = async (req: Request, res: Response): Promise<void> => {
  try {
    const campaign = await loadOwnedCampaign(req);
    if (!campaign) {
      res.status(404).json({ success: false, message: 'Campaign not found.' });
      return;
    }
    const impact = await computeImpact(campaign._id);
    res.status(200).json({
      success: true,
      data: {
        status: campaign.status,
        name: campaign.name,
        ...impact,
        // Permanent delete is only offered for archived campaigns, or drafts that never called anyone
        canDeletePermanently: campaign.status === 'Archived' || (campaign.status === 'Draft' && impact.calls === 0),
      },
    });
  } catch (err: any) {
    if (err.name === 'CastError') {
      res.status(404).json({ success: false, message: 'Campaign not found.' });
      return;
    }
    console.error('[getCampaignImpact]', err);
    res.status(500).json({ success: false, message: 'Server error while checking the campaign.' });
  }
};

// ── POST /api/campaigns/:id/archive ──────────────────────────────────────────
export const archiveCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const campaign = await loadOwnedCampaign(req);
    if (!campaign) {
      res.status(404).json({ success: false, message: 'Campaign not found.' });
      return;
    }
    if (campaign.status === 'Archived') {
      res.status(409).json({ success: false, message: 'Campaign is already archived.' });
      return;
    }
    if (campaign.status === 'Running') {
      res.status(409).json({ success: false, message: 'Cannot archive a running campaign. Pause it first.' });
      return;
    }

    const previous = campaign.status;
    await Campaign.updateOne(
      { _id: campaign._id },
      { $set: { status: 'Archived', archivedAt: new Date(), statusBeforeArchive: previous } }
    );

    await logAction(
      'campaign.archive',
      req.admin!.adminId,
      req.admin!.email,
      `Archived campaign "${campaign.name}".`,
      { campaignId: campaign._id, previousStatus: previous }
    );

    res.status(200).json({ success: true, message: 'Campaign archived. All leads, calls and meetings were kept.' });
  } catch (err: any) {
    if (err.name === 'CastError') {
      res.status(404).json({ success: false, message: 'Campaign not found.' });
      return;
    }
    console.error('[archiveCampaign]', err);
    res.status(500).json({ success: false, message: 'Server error while archiving campaign.' });
  }
};

// ── POST /api/campaigns/:id/restore ──────────────────────────────────────────
export const restoreCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const campaign = await loadOwnedCampaign(req);
    if (!campaign) {
      res.status(404).json({ success: false, message: 'Campaign not found.' });
      return;
    }
    if (campaign.status !== 'Archived') {
      res.status(409).json({ success: false, message: 'Only archived campaigns can be restored.' });
      return;
    }

    // Never come back as "Running": a restored campaign must not start dialing by itself.
    const before = campaign.statusBeforeArchive;
    const restoredStatus = before === 'Draft' || before === 'Completed' ? before : 'Paused';

    await Campaign.updateOne(
      { _id: campaign._id },
      { $set: { status: restoredStatus, archivedAt: null, statusBeforeArchive: null } }
    );

    await logAction(
      'campaign.restore',
      req.admin!.adminId,
      req.admin!.email,
      `Restored campaign "${campaign.name}" as ${restoredStatus}.`,
      { campaignId: campaign._id, newStatus: restoredStatus }
    );

    res.status(200).json({ success: true, message: `Campaign restored as ${restoredStatus}.`, data: { status: restoredStatus } });
  } catch (err: any) {
    if (err.name === 'CastError') {
      res.status(404).json({ success: false, message: 'Campaign not found.' });
      return;
    }
    console.error('[restoreCampaign]', err);
    res.status(500).json({ success: false, message: 'Server error while restoring campaign.' });
  }
};

// ── DELETE /api/campaigns/:id?confirmName=<exact name>&keepQualified=true|false ──
export const deleteCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const campaign = await loadOwnedCampaign(req);
    if (!campaign) {
      res.status(404).json({ success: false, message: 'Campaign not found.' });
      return;
    }

    if (campaign.status === 'Running') {
      res.status(409).json({ success: false, message: 'Cannot delete a running campaign. Pause it first.', code: 'CAMPAIGN_RUNNING' });
      return;
    }

    const impact = await computeImpact(campaign._id);
    const eligible = campaign.status === 'Archived' || (campaign.status === 'Draft' && impact.calls === 0);
    if (!eligible) {
      res.status(409).json({
        success: false,
        message: 'Archive this campaign first. Only archived campaigns (or drafts that never made a call) can be deleted permanently.',
        code: 'ARCHIVE_FIRST',
      });
      return;
    }

    // Typing the exact name is the "are you sure" — an accidental click can never do this.
    const confirmName = typeof req.query.confirmName === 'string' ? req.query.confirmName.trim() : '';
    if (confirmName !== campaign.name.trim()) {
      res.status(422).json({ success: false, message: 'Type the exact campaign name to confirm.', code: 'CONFIRM_NAME_MISMATCH' });
      return;
    }

    const keepQualified = req.query.keepQualified !== 'false'; // default: keep them

    if (!keepQualified && impact.upcomingMeetings > 0) {
      res.status(409).json({
        success: false,
        message: `This campaign has ${impact.upcomingMeetings} upcoming meeting(s). Cancel them first, or keep the qualified leads.`,
        code: 'UPCOMING_MEETINGS',
      });
      return;
    }

    // ── 1. Detach everything worth keeping (idempotent — safe to re-run if interrupted) ──
    let keptLeads = 0;
    if (keepQualified) {
      const keepIds = (await Lead.find({ campaign: campaign._id, ...QUALIFIED_LEAD_FILTER }).select('_id').lean()).map((l: any) => l._id);
      keptLeads = keepIds.length;
      if (keepIds.length > 0) {
        await Lead.updateMany({ _id: { $in: keepIds } }, { $set: { campaign: null } });
        await CallLog.updateMany({ campaign: campaign._id, lead: { $in: keepIds } }, { $set: { campaign: null } });
        await Transcript.updateMany({ campaign: campaign._id, lead: { $in: keepIds } }, { $set: { campaign: null } });
        await Meeting.updateMany({ campaign: campaign._id, lead: { $in: keepIds } }, { $set: { campaign: null } });
      }
    }

    // ── 2. Delete what is left that still points at this campaign ──
    const [delMeetings, delTranscripts, delCalls, delLeads] = await Promise.all([
      Meeting.deleteMany({ campaign: campaign._id }),
      Transcript.deleteMany({ campaign: campaign._id }),
      CallLog.deleteMany({ campaign: campaign._id }),
      Lead.deleteMany({ campaign: campaign._id }),
    ]);

    // ── 3. Remove the VAPI assistant (best-effort — an orphan there is harmless) ──
    let vapiAssistantRemoved = false;
    if (campaign.vapiAssistantId) {
      try {
        await deleteAssistant(campaign.vapiAssistantId);
        vapiAssistantRemoved = true;
      } catch (e: any) {
        console.warn('[deleteCampaign] Could not remove VAPI assistant (non-fatal):', e?.response?.data || e?.message);
      }
    }

    // ── 4. Finally the campaign itself ──
    await Campaign.deleteOne({ _id: campaign._id, createdBy: req.admin!.adminId });

    const summary = {
      keptQualifiedLeads: keptLeads,
      deletedLeads: delLeads.deletedCount ?? 0,
      deletedCalls: delCalls.deletedCount ?? 0,
      deletedTranscripts: delTranscripts.deletedCount ?? 0,
      deletedMeetings: delMeetings.deletedCount ?? 0,
      vapiAssistantRemoved,
    };

    await logAction(
      'campaign.delete',
      req.admin!.adminId,
      req.admin!.email,
      `Permanently deleted campaign "${campaign.name}" (kept ${keptLeads} qualified lead(s)).`,
      { campaignId: campaign._id, campaignName: campaign.name, keepQualified, ...summary }
    );

    res.status(200).json({
      success: true,
      message: keepQualified
        ? `Campaign deleted. ${keptLeads} qualified lead(s) and their history were kept.`
        : 'Campaign and all of its data were deleted.',
      data: summary,
    });
  } catch (err: any) {
    if (err.name === 'CastError') {
      res.status(404).json({ success: false, message: 'Campaign not found.' });
      return;
    }
    console.error('[deleteCampaign]', err);
    res.status(500).json({ success: false, message: 'Server error while deleting campaign.' });
  }
};
