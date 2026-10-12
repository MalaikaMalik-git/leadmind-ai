import { Request, Response } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
const Lead = require('../models/Lead');
const Campaign = require('../models/Campaign');
const CallLog = require('../models/CallLog');
const Meeting = require('../models/Meeting');
const Transcript = require('../models/Transcript');
import { deleteCalendarEvent } from '../services/googleCalendarService';
import { getValidAccessToken } from '../services/calendarTokenService';
import { logAction } from '../utils/auditLog';

import { parseCsvBuffer, CsvParseError } from '../utils/csvParser';
import {
  buildHeaderMap,
  validateRequiredColumns,
  mapRowToLeadFields,
  validateLeadRow,
} from '../utils/leadValidation';
import {
  DuplicateChecker,
  getExistingLeadRecords,
  toExistingContacts,
  buildContactIdMaps,
  normalizePhone,
  normalizeEmail,
} from '../utils/duplicateDetection';

// Day 12 — the three strategies UC-04 A2 calls for
type DuplicateStrategy = 'skip' | 'update' | 'importAll';
const VALID_STRATEGIES: DuplicateStrategy[] = ['skip', 'update', 'importAll'];

// ─────────────────────────────────────────────────────────────────────────────
//  LeadMind AI — Lead Controller
//  UC-04  Upload Lead List (CSV)
//
//  POST /api/leads/import/:campaignId
//  Body: multipart/form-data, field name "file" (a .csv)
//
//  Pipeline: ownership check → file presence → parse → column check (A1) →
//  per-row validation (A3) → duplicate check (A2) → batch insert → campaign
//  stats update → import summary response.
//
//  One bad row never sinks the import — every row is bucketed into
//  success / failed / duplicate, and the response always reports all three,
//  exactly as UC-04's post-condition requires ("Import summary is stored.").
// ─────────────────────────────────────────────────────────────────────────────

interface RowFailure {
  row: number; // matches the row number the admin would see in Excel/Sheets (header = row 1)
  fullName: string | null;
  reason: string;
}

export const importLeads = async (req: Request, res: Response): Promise<void> => {
  try {
    const campaignId = req.params.campaignId as string;

    // ── Ownership check — campaign must exist and belong to this admin ──────
    const campaign = await Campaign.findOne({
      _id: campaignId,
      createdBy: req.admin!.adminId,
    });

    if (!campaign) {
      res.status(404).json({ success: false, message: 'Campaign not found.' });
      return;
    }

    if (campaign.status === 'Archived') {
      res.status(409).json({ success: false, message: 'This campaign is archived. Restore it before importing leads.' });
      return;
    }

    // ── multer must have attached a file (uploadCsv middleware ran first) ───
    if (!req.file) {
      res.status(422).json({
        success: false,
        message: 'No file uploaded. Attach a CSV file under the "file" field.',
      });
      return;
    }

    // ── Day 12: duplicate handling strategy (UC-04 A2 — Skip / Update / Import All) ─
    // multer's .single() puts non-file form fields on req.body, same as normal form data.
    const rawStrategy = (req.body?.duplicateStrategy as string) || 'skip';
    if (!VALID_STRATEGIES.includes(rawStrategy as DuplicateStrategy)) {
      res.status(422).json({
        success: false,
        message: `Invalid duplicateStrategy. Must be one of: ${VALID_STRATEGIES.join(', ')}.`,
      });
      return;
    }
    const duplicateStrategy = rawStrategy as DuplicateStrategy;

    // ── Parse the CSV buffer ─────────────────────────────────────────────────
    let headers: string[];
    let rows: Record<string, string>[];
    try {
      ({ headers, rows } = parseCsvBuffer(req.file.buffer));
    } catch (err: any) {
      if (err instanceof CsvParseError) {
        res.status(422).json({ success: false, message: err.message });
        return;
      }
      throw err;
    }

    // ── UC-04 A1: Missing Required Columns ───────────────────────────────────
    const columnCheck = validateRequiredColumns(headers);
    if (!columnCheck.valid) {
      res.status(422).json({
        success: false,
        message: `Missing required column(s): ${columnCheck.missing.join(', ')}`,
        missingColumns: columnCheck.missing,
      });
      return;
    }

    // ── Preload existing contacts for this campaign for duplicate checks ────
    // One query, reused three ways: the Set-based checker (fast lookups),
    // and — only needed for the 'update' strategy — id maps so we know
    // *which* existing document to write to.
    const existingRecords = await getExistingLeadRecords(campaignId);
    const duplicateChecker = new DuplicateChecker(toExistingContacts(existingRecords));
    const { phoneToId, emailToId } = buildContactIdMaps(existingRecords);

    const headerMap = buildHeaderMap(headers);
    const importBatch = crypto.randomUUID();

    const leadsToInsert: Record<string, any>[] = [];
    const updatePromises: Promise<unknown>[] = [];
    const failures: RowFailure[] = [];
    let duplicateCount = 0;
    let updatedCount = 0;

    rows.forEach((rawRow, index) => {
      const rowNumber = index + 2; // +1 for 0-index, +1 because row 1 is the header
      const mapped = mapRowToLeadFields(rawRow, headerMap);

      // UC-04 A3 — invalid phone format / missing required fields
      const validation = validateLeadRow(mapped);
      if (!validation.valid) {
        failures.push({
          row: rowNumber,
          fullName: mapped.fullName || null,
          reason: validation.errors.join(' '),
        });
        return;
      }

      const rawExtra = Object.keys(mapped.rawExtra).length > 0 ? mapped.rawExtra : null;
      const isDupe = duplicateChecker.isDuplicate(mapped.phone, mapped.email);

      if (isDupe) {
        duplicateCount++; // reported regardless of strategy — informational

        if (duplicateStrategy === 'skip') {
          return; // UC-04 A2 default — leave the existing lead untouched
        }

        if (duplicateStrategy === 'update') {
          // Find which existing document this row matches (phone wins, email as fallback)
          const normPhone = normalizePhone(mapped.phone);
          const normEmail = mapped.email ? normalizeEmail(mapped.email) : null;
          const existingId = phoneToId.get(normPhone) ?? (normEmail ? emailToId.get(normEmail) : undefined);

          if (existingId) {
            updatePromises.push(
              Lead.updateOne(
                { _id: existingId },
                {
                  $set: {
                    fullName: mapped.fullName,
                    email: mapped.email,
                    company: mapped.company,
                    jobTitle: mapped.jobTitle,
                    importBatch, // so this lead shows up in the latest import's history entry
                    ...(rawExtra ? { rawCsvData: rawExtra } : {}),
                  },
                }
              )
            );
            updatedCount++;
          }
          return; // either updated in place, or (rare) id lookup missed — don't insert either way
        }

        // duplicateStrategy === 'importAll' → intentionally fall through to insert below
      }

      duplicateChecker.markSeen(mapped.phone, mapped.email);

      leadsToInsert.push({
        fullName: mapped.fullName,
        phone: mapped.phone,
        email: mapped.email,
        company: mapped.company,
        jobTitle: mapped.jobTitle,
        campaign: campaignId,
        source: 'CSV Upload',
        status: 'Pending', // UC-04 post-condition: initial status = Pending
        importBatch,
        rawCsvData: rawExtra,
      });
    });

    // ── Apply all 'update' strategy writes ───────────────────────────────────
    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }

    // ── Batch insert (UC-04 special requirement: must support batch insertion) ─
    let insertedCount = 0;
    if (leadsToInsert.length > 0) {
      try {
        const inserted = await Lead.insertMany(leadsToInsert, { ordered: false });
        insertedCount = inserted.length;
      } catch (bulkErr: any) {
        // ordered:false means valid docs still get inserted even if others fail
        // at the DB layer (e.g. an edge-case length limit our own row validator
        // doesn't check). Count what actually made it in, report the rest as failed.
        insertedCount = bulkErr.insertedDocs?.length ?? 0;
        const dbFailedCount = leadsToInsert.length - insertedCount;
        if (dbFailedCount > 0) {
          failures.push({
            row: -1,
            fullName: null,
            reason: `${dbFailedCount} row(s) failed database validation unexpectedly.`,
          });
        }
      }
    }

    // ── Keep Campaign.stats.totalLeads in sync (feeds the Day 8 stats bar) ───
    if (insertedCount > 0) {
      await Campaign.updateOne(
        { _id: campaignId },
        { $inc: { 'stats.totalLeads': insertedCount } }
      );
    }

    // ── UC-04 post-condition: "Import summary is stored" (returned here; ────
    //    persisting it as its own document is optional — out of scope for Day 11) ─
    res.status(200).json({
      success: true,
      message: 'Import completed.',
      summary: {
        total: rows.length,
        success: insertedCount,
        updated: updatedCount,
        failed: failures.length,
        duplicates: duplicateCount,
        duplicateStrategy,
        importBatch,
      },
      failedRows: failures,
    });
  } catch (err: any) {
    if (err.name === 'CastError') {
      res.status(404).json({ success: false, message: 'Campaign not found.' });
      return;
    }
    console.error('[importLeads]', err);
    res.status(500).json({ success: false, message: 'Server error while importing leads.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/leads
//  UC-07  View Leads & Statuses
//
//  Query params: status, campaign, source, search, page, limit, sortBy, sortOrder
//  Scoped to campaigns owned by the logged-in admin — a lead can never leak
//  across admin accounts even if someone guesses a campaign id.
// ─────────────────────────────────────────────────────────────────────────────

const SORTABLE_FIELDS = ['createdAt', 'fullName', 'qualificationScore', 'status'];

export const getLeads = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      status,
      campaign,
      source,
      search,
      importBatch,
      page = '1',
      limit = '20',
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query as Record<string, string>;

    // Every lead must belong to a campaign this admin owns.
    const ownedCampaigns = await Campaign.find(
      { createdBy: req.admin!.adminId },
      '_id'
    ).lean();
    const ownedCampaignIds = ownedCampaigns.map((c: any) => c._id.toString());

    // `null` is included on purpose: leads with no campaign (inbound callers,
    // and qualified leads kept after their campaign was permanently deleted)
    // must stay visible — same trust boundary findOwnedLead() already uses.
    const filter: Record<string, any> = { campaign: { $in: [...ownedCampaignIds, null] } };

    if (campaign) {
      // Narrow to one specific campaign — but only if the admin actually owns it.
      if (!ownedCampaignIds.includes(campaign)) {
        res.status(404).json({ success: false, message: 'Campaign not found.' });
        return;
      }
      filter.campaign = campaign;
    }

    if (status) filter.status = status;
    if (source) filter.source = source;
    if (importBatch) filter.importBatch = importBatch;

    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const sortField = SORTABLE_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
    const sortDir = sortOrder === 'asc' ? 1 : -1;

    const [leads, total] = await Promise.all([
      Lead.find(filter)
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limitNum)
        .populate('campaign', 'name')
        .lean(),
      Lead.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: leads,
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
    console.error('[getLeads]', err);
    res.status(500).json({ success: false, message: 'Server error while fetching leads.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/leads/import-history/:campaignId
//  Day 12 — Import History sidebar panel
//
//  Note: we don't persist a separate "ImportLog" entity (not part of the
//  domain model / ERD in the FYP report), so history is derived directly
//  from Lead documents grouped by importBatch. This means it shows batches
//  that actually landed leads in the DB — a batch where every row failed
//  validation (nothing ever got as far as insertMany) won't appear here,
//  since there'd be nothing to group. That's an acceptable trade-off for
//  Day 12 scope; the immediate import summary (returned directly from
//  importLeads) already covers that case in the moment it happens.
// ─────────────────────────────────────────────────────────────────────────────

export const getImportHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const campaignId = req.params.campaignId as string;

    const campaign = await Campaign.findOne({
      _id: campaignId,
      createdBy: req.admin!.adminId,
    });

    if (!campaign) {
      res.status(404).json({ success: false, message: 'Campaign not found.' });
      return;
    }

    const batches = await Lead.aggregate([
      {
        $match: {
          campaign: new mongoose.Types.ObjectId(campaignId),
          importBatch: { $ne: null },
        },
      },
      {
        $group: {
          _id: '$importBatch',
          total: { $sum: 1 },
          importedAt: { $min: '$createdAt' },
          qualified: {
            $sum: { $cond: [{ $eq: ['$status', 'Qualified'] }, 1, 0] },
          },
        },
      },
      { $sort: { importedAt: -1 } },
    ]);

    const history = batches.map((b: any) => ({
      importBatch: b._id,
      total: b.total,
      qualified: b.qualified,
      importedAt: b.importedAt,
    }));

    res.status(200).json({ success: true, data: history });
  } catch (err: any) {
    console.error('[getImportHistory]', err);
    res.status(500).json({ success: false, message: 'Server error while fetching import history.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  Shared helper — fetch a lead and confirm the requesting admin owns it
//
//  A lead is "owned" via its campaign's createdBy. Leads with no campaign
//  (source = 'Inbound Call' with no campaign context, or 'Manual Entry')
//  have no owner to check against in the current single-admin-per-lead
//  domain model (ERD §2.12 has no Admin↔Lead link) — those are treated as
//  visible to any authenticated admin, same trust boundary the rest of the
//  dashboard already runs on. Leads that DO have a campaign are strictly
//  scoped: a lead can never leak across admin accounts, matching the same
//  rule getLeads() already enforces.
// ─────────────────────────────────────────────────────────────────────────────

export async function findOwnedLead(leadId: string, adminId: string) {
  const lead = await Lead.findById(leadId).populate('campaign', 'name createdBy');

  if (!lead) return null;

  if (lead.campaign && lead.campaign.createdBy?.toString() !== adminId) {
    return null; // exists, but belongs to another admin's campaign — treat as not found
  }

  return lead;
}

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/leads/:id
//  UC-07  View Leads & Statuses — "Admin selects a particular lead. System
//  shows the details of the lead, including the call, outcome, and meeting
//  link (if booked)."
//
//  Returns the lead itself plus its call history (newest first, with just
//  enough on each transcript ref for the frontend to link to it — full
//  transcript viewing is Day 19/UC-08) and its booked meeting, if any.
// ─────────────────────────────────────────────────────────────────────────────

export const getLeadById = async (req: Request, res: Response): Promise<void> => {
  try {
    const leadId = req.params.id as string;

    const lead = await findOwnedLead(leadId, req.admin!.adminId);
    if (!lead) {
      res.status(404).json({ success: false, message: 'Lead not found.' });
      return;
    }

    const callLogs = await CallLog.find({ lead: leadId })
      .sort({ initiatedAt: -1 })
      .select(
        'callType status durationSeconds attemptNumber isRetry initiatedAt answeredAt endedAt transcript qualificationScore finalLeadStatus errorMessage'
      )
      .lean();

    const meeting = lead.meeting ? await Meeting.findById(lead.meeting).lean() : null;

    res.status(200).json({
      success: true,
      data: {
        lead,
        callLogs,
        meeting,
      },
    });
  } catch (err: any) {
    if (err.name === 'CastError') {
      res.status(404).json({ success: false, message: 'Lead not found.' });
      return;
    }
    console.error('[getLeadById]', err);
    res.status(500).json({ success: false, message: 'Server error while fetching lead.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  PATCH /api/leads/:id
//  UC-07  View Leads & Statuses — "Give admins space to change lead statuses
//  and add their own notes."
//
//  Deliberately narrow: only status and adminNotes are admin-writable here.
//  Every other field (score, breakdown, call counts, etc.) is owned by the
//  AI qualification pipeline (UC-12) or the calling pipeline (UC-05), not
//  manual edits, so they're not accepted on this route even if sent.
// ─────────────────────────────────────────────────────────────────────────────

export const updateLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const leadId = req.params.id as string;
    const { status, adminNotes } = req.body;

    const lead = await findOwnedLead(leadId, req.admin!.adminId);
    if (!lead) {
      res.status(404).json({ success: false, message: 'Lead not found.' });
      return;
    }

    if (status !== undefined) lead.status = status;
    if (adminNotes !== undefined) lead.adminNotes = adminNotes === '' ? null : adminNotes;

    await lead.save();

    res.status(200).json({
      success: true,
      message: 'Lead updated.',
      data: lead,
    });
  } catch (err: any) {
    if (err.name === 'CastError') {
      res.status(404).json({ success: false, message: 'Lead not found.' });
      return;
    }
    if (err.name === 'ValidationError') {
      res.status(422).json({ success: false, message: err.message });
      return;
    }
    console.error('[updateLead]', err);
    res.status(500).json({ success: false, message: 'Server error while updating lead.' });
  }
};

const QUALIFIED_STATUSES = ['Qualified', 'Meeting Booked', 'Qualified (No Slot)', 'Qualified (Booking Failed)'];

async function refreshCampaignStats(campaignId: string): Promise<void> {
  const [totalLeads, qualified, notQualified, meetingsBooked, calls] = await Promise.all([
    Lead.countDocuments({ campaign: campaignId }),
    Lead.countDocuments({ campaign: campaignId, status: { $in: QUALIFIED_STATUSES } }),
    Lead.countDocuments({ campaign: campaignId, status: 'Not Qualified' }),
    Meeting.countDocuments({ campaign: campaignId, status: 'Scheduled' }),
    CallLog.find({ campaign: campaignId }).select('status answeredAt').lean(),
  ]);

  await Campaign.updateOne({ _id: campaignId }, {
    $set: {
      'stats.totalLeads': totalLeads,
      'stats.qualified': qualified,
      'stats.notQualified': notQualified,
      'stats.meetingsBooked': meetingsBooked,
      'stats.callsMade': calls.length,
      'stats.callsAnswered': calls.filter((call: { answeredAt?: Date | null }) => call.answeredAt).length,
      'stats.noAnswer': calls.filter((call: { status?: string }) => call.status === 'No Answer').length,
      'stats.failed': calls.filter((call: { status?: string }) => call.status === 'Failed').length,
    },
  });
}

async function removeLeadCalendarEvents(adminId: string, leadId: string): Promise<void> {
  const meetings = await Meeting.find({ lead: leadId }).select('status googleCalendar.eventId').lean();
  const events = meetings.filter((meeting: { googleCalendar?: { eventId?: string | null } }) => meeting.googleCalendar?.eventId);
  if (events.length === 0) return;

  let token: string;
  try {
    token = await getValidAccessToken(adminId);
  } catch {
    console.warn('[deleteLead] calendar is not connected, so the Google event was left in place');
    return;
  }

  for (const meeting of events) {
    try {
      await deleteCalendarEvent(
        token,
        meeting.googleCalendar.eventId,
        meeting.status === 'Scheduled' ? 'all' : 'none',
      );
    } catch (err) {
      console.warn('[deleteLead] could not remove a calendar event', err);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE /api/leads/:id
//  Removes one lead and the calls, transcripts, and meetings that belong to it.
//  A lead who is on a call right now is left alone until that call ends.
// ─────────────────────────────────────────────────────────────────────────────

export const deleteLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const leadId = req.params.id as string;
    const lead = await findOwnedLead(leadId, req.admin!.adminId);
    if (!lead) {
      res.status(404).json({ success: false, message: 'Lead not found.' });
      return;
    }

    if (lead.status === 'Calling') {
      res.status(409).json({
        success: false,
        message: 'This lead is on a call. Wait until the call ends, then delete them.',
      });
      return;
    }

    const campaignId = lead.campaign?._id ? String(lead.campaign._id) : null;
    await removeLeadCalendarEvents(req.admin!.adminId, leadId);

    await Promise.all([
      Meeting.deleteMany({ lead: leadId }),
      Transcript.deleteMany({ lead: leadId }),
      CallLog.deleteMany({ lead: leadId }),
    ]);
    await Lead.deleteOne({ _id: leadId });

    if (campaignId) await refreshCampaignStats(campaignId);

    await logAction(
      'lead.delete',
      req.admin!.adminId,
      req.admin!.email,
      `Deleted lead "${lead.fullName}".`,
      { leadId, fullName: lead.fullName, campaignId },
    );

    res.status(200).json({ success: true, message: 'Lead deleted.' });
  } catch (err: any) {
    if (err.name === 'CastError') {
      res.status(404).json({ success: false, message: 'Lead not found.' });
      return;
    }
    console.error('[deleteLead]', err);
    res.status(500).json({ success: false, message: 'Server error while deleting lead.' });
  }
};