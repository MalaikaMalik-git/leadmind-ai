// backend/src/controllers/analyticsController.ts
//
// LeadMind AI — Analytics Controller
// Related UC: UC-09 (View Reporting & Analytics)
//
// Day 17, Session 2 endpoints (unchanged):
//   • GET /api/analytics/topics          — most-discussed project topics
//   • GET /api/analytics/call-duration   — average call duration
//   • GET /api/analytics/conversion-rate — meetings booked / calls answered
//
// Day 25, Session 1 additions (new):
//   • GET /api/analytics/summary    — the 5 KPI cards in one call
//   • GET /api/analytics/timeseries — calls/qualified/meetings per bucket, for the multi-line chart
//
// Both new endpoints reuse the same filter/match helpers as the Day 17
// endpoints so behavior (campaign filtering, date range filtering,
// invalid-campaignId handling) stays consistent across all five endpoints.

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import {
  computeCoreStats,
  computeTimeseries,
  meetingFilter,
  isDateOnly,
  dayStart,
  dayEnd,
  dayKey,
  addDaysToKey,
} from '../services/statsService';
const { Lead, Transcript, CallLog, Meeting } = require('../models/Index');

// ─── Shared query-param parsing ─────────────────────────────────────────────

interface AnalyticsFilters {
  campaignId?: string;
  startDate?: Date;
  endDate?: Date;
}

function parseFilters(req: Request): AnalyticsFilters {
  const { campaignId, startDate, endDate } = req.query;

  const filters: AnalyticsFilters = {};

  if (typeof campaignId === 'string' && campaignId.trim().length > 0) {
    filters.campaignId = campaignId.trim();
  }
  // Date-only values ("2026-10-09") mean whole local days: the start date
  // begins at 00:00 and the end date runs to 23:59:59.999 of that day (in the
  // stats timezone) so "today" is included. Full ISO timestamps are used as-is.
  if (typeof startDate === 'string' && !isNaN(Date.parse(startDate))) {
    filters.startDate = isDateOnly(startDate) ? dayStart(startDate) : new Date(startDate);
  }
  if (typeof endDate === 'string' && !isNaN(Date.parse(endDate))) {
    filters.endDate = isDateOnly(endDate) ? dayEnd(endDate) : new Date(endDate);
  }

  return filters;
}

// Builds a Mongo match clause for a given date field from parsed filters
function dateMatch(field: string, filters: AnalyticsFilters): Record<string, any> {
  if (!filters.startDate && !filters.endDate) return {};

  const range: Record<string, Date> = {};
  if (filters.startDate) range.$gte = filters.startDate;
  if (filters.endDate) range.$lte = filters.endDate;

  return { [field]: range };
}

// Bug fix (Day 17, Session 2 verification): Mongoose auto-casts query filter
// values to ObjectId for find()/countDocuments()/findOne() based on the
// schema path type — but it does NOT do this inside aggregate() pipeline
// $match stages, which are passed to the MongoDB driver unmodified. Passing
// a raw string campaignId into an aggregate $match silently matches zero
// documents (string !== ObjectId in BSON) instead of erroring, so this was
// caught by comparing against getConversionRate (which uses
// countDocuments() and worked correctly) rather than by a thrown exception.
// Every aggregate() $match on a campaign field must go through this helper.
class InvalidCampaignIdError extends Error {}

function campaignObjectId(campaignId: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(campaignId)) {
    throw new InvalidCampaignIdError(`"${campaignId}" is not a valid campaignId`);
  }
  return new mongoose.Types.ObjectId(campaignId);
}

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/analytics/topics
// ─────────────────────────────────────────────────────────────────────────────

export const getTopicAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const filters = parseFilters(req);

    const match: Record<string, any> = {
      detectedTopics: { $exists: true, $ne: [] },
      ...dateMatch('callDate', filters),
    };
    if (filters.campaignId) match.campaign = campaignObjectId(filters.campaignId);

    const [topicAgg, totalTranscriptsAnalyzed] = await Promise.all([
      Transcript.aggregate([
        { $match: match },
        { $unwind: '$detectedTopics' },
        {
          $group: {
            _id: '$detectedTopics',
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),
      Transcript.countDocuments(match),
    ]);

    const topics = (topicAgg as any[]).map((row) => ({
      topic: row._id,
      count: row.count,
    }));

    res.status(200).json({
      success: true,
      data: {
        topics,
        totalTranscriptsAnalyzed,
        filters: {
          campaignId: filters.campaignId ?? null,
          startDate: filters.startDate ?? null,
          endDate: filters.endDate ?? null,
        },
      },
    });
  } catch (err: any) {
    if (err instanceof InvalidCampaignIdError) {
      res.status(400).json({ success: false, message: err.message });
      return;
    }
    console.error('[Analytics] getTopicAnalytics error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to load topic analytics',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/analytics/call-duration
// ─────────────────────────────────────────────────────────────────────────────

export const getAvgCallDuration = async (req: Request, res: Response): Promise<void> => {
  try {
    const filters = parseFilters(req);

    const match: Record<string, any> = {
      status: 'Completed',
      ...dateMatch('initiatedAt', filters),
    };
    if (filters.campaignId) match.campaign = campaignObjectId(filters.campaignId);

    const [agg] = await CallLog.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          averageDurationSeconds: { $avg: '$durationSeconds' },
          totalCallsIncluded: { $sum: 1 },
        },
      },
    ]);

    const averageDurationSeconds = agg ? Math.round(agg.averageDurationSeconds) : 0;
    const totalCallsIncluded = agg ? agg.totalCallsIncluded : 0;

    const mins = Math.floor(averageDurationSeconds / 60);
    const secs = averageDurationSeconds % 60;
    const averageDurationFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    res.status(200).json({
      success: true,
      data: {
        averageDurationSeconds,
        averageDurationFormatted,
        totalCallsIncluded,
        filters: {
          campaignId: filters.campaignId ?? null,
          startDate: filters.startDate ?? null,
          endDate: filters.endDate ?? null,
        },
      },
    });
  } catch (err: any) {
    if (err instanceof InvalidCampaignIdError) {
      res.status(400).json({ success: false, message: err.message });
      return;
    }
    console.error('[Analytics] getAvgCallDuration error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to load average call duration',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/analytics/conversion-rate
// ─────────────────────────────────────────────────────────────────────────────

export const getConversionRate = async (req: Request, res: Response): Promise<void> => {
  try {
    const filters = parseFilters(req);

    const callMatch: Record<string, any> = {
      answeredAt: { $ne: null },
      ...dateMatch('initiatedAt', filters),
    };
    if (filters.campaignId) callMatch.campaign = campaignObjectId(filters.campaignId);

    const meetingMatch = meetingFilter({
      campaignId: filters.campaignId ? campaignObjectId(filters.campaignId) : null,
      startDate: filters.startDate,
      endDate: filters.endDate,
    });

    const [callsAnswered, meetingsBooked] = await Promise.all([
      CallLog.countDocuments(callMatch),
      Meeting.countDocuments(meetingMatch),
    ]);

    const conversionRatePercent = callsAnswered > 0 ? Math.round((meetingsBooked / callsAnswered) * 1000) / 10 : 0;

    res.status(200).json({
      success: true,
      data: {
        meetingsBooked,
        callsAnswered,
        conversionRatePercent,
        filters: {
          campaignId: filters.campaignId ?? null,
          startDate: filters.startDate ?? null,
          endDate: filters.endDate ?? null,
        },
      },
    });
  } catch (err: any) {
    if (err instanceof InvalidCampaignIdError) {
      res.status(400).json({ success: false, message: err.message });
      return;
    }
    console.error('[Analytics] getConversionRate error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to load conversion rate',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/analytics/summary   (Day 25, Session 1 — NEW)
//
//  Returns the 5 numbers the Analytics Dashboard's KPI cards need, in one
//  round trip: Total Calls, Qualified Leads, Meetings Booked, Qual Rate %,
//  Avg Call Duration. Accepts the same campaignId/startDate/endDate filters
//  as every other analytics endpoint.
//
//  Definitions (documented here since these aren't specified in the SRS
//  down to this level of detail — pick a fight with these later if the
//  demo needs different semantics, it's a one-line change):
//   • totalCalls      — all CallLog docs in range (any status)
//   • qualifiedLeads  — Lead docs with isQualified: true, filtered by
//                       Lead.createdAt (leads don't have a separate
//                       "qualified at" timestamp yet)
//   • meetingsBooked  — Meeting docs in range, filtered by Meeting.createdAt
//   • qualRatePercent — qualifiedLeads / totalLeadsInRange * 100
//   • avgCallDuration — same definition as GET /call-duration (Completed
//                       calls only), reused here so the two endpoints can
//                       never disagree
// ─────────────────────────────────────────────────────────────────────────────

export const getAnalyticsSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const filters = parseFilters(req);
    const campaignObjId = filters.campaignId ? campaignObjectId(filters.campaignId) : null;

    // Same function the Dashboard uses — numbers can't disagree.
    const core = await computeCoreStats({
      campaignId: campaignObjId,
      startDate: filters.startDate,
      endDate: filters.endDate,
    });

    const totalCalls = core.totalCalls;
    const qualifiedLeads = core.qualifiedLeads;
    const meetingsBooked = core.meetingsBooked;
    const qualRatePercent = core.qualRatePercent;
    const averageDurationSeconds = core.avgCallDurationSeconds;
    const avgCallDurationFormatted = core.avgCallDurationFormatted;

    res.status(200).json({
      success: true,
      data: {
        totalCalls,
        qualifiedLeads,
        meetingsBooked,
        qualRatePercent,
        avgCallDurationSeconds: averageDurationSeconds,
        avgCallDurationFormatted,
        filters: {
          campaignId: filters.campaignId ?? null,
          startDate: filters.startDate ?? null,
          endDate: filters.endDate ?? null,
        },
      },
    });
  } catch (err: any) {
    if (err instanceof InvalidCampaignIdError) {
      res.status(400).json({ success: false, message: err.message });
      return;
    }
    console.error('[Analytics] getAnalyticsSummary error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to load analytics summary',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/analytics/timeseries   (Day 25, Session 1 — NEW)
//
//  Data source for the Session 3 multi-line chart: calls / qualified leads /
//  meetings booked, bucketed per day (or per week) across a date range.
//
//  Query params: campaignId?, startDate?, endDate?, granularity? ('day' | 'week', default 'day')
//  Defaults to the last 30 days if no startDate/endDate given, so the
//  endpoint is safely callable (and testable) with no query params at all.
// ─────────────────────────────────────────────────────────────────────────────

function bucketKeyExpr(field: string, granularity: 'day' | 'week') {
  return granularity === 'week'
    ? { $dateToString: { format: '%G-W%V', date: `$${field}` } } // ISO week, e.g. 2026-W34
    : { $dateToString: { format: '%Y-%m-%d', date: `$${field}` } };
}

export const getAnalyticsTimeseries = async (req: Request, res: Response): Promise<void> => {
  try {
    const filters = parseFilters(req);
    const campaignObjId = filters.campaignId ? campaignObjectId(filters.campaignId) : null;

    const granularityParam = typeof req.query.granularity === 'string' ? req.query.granularity : 'day';
    const granularity: 'day' | 'week' = granularityParam === 'week' ? 'week' : 'day';

    const endDate = filters.endDate ?? new Date();
    let startDate = filters.startDate;
    if (!startDate) {
      // No start given ("All" range): begin at the earliest record we have,
      // capped at 1 year, falling back to 30 days when there is no data.
      const [firstCall, firstLead, firstMeeting] = await Promise.all([
        CallLog.findOne({}).sort({ initiatedAt: 1 }).select('initiatedAt').lean(),
        Lead.findOne({}).sort({ createdAt: 1 }).select('createdAt').lean(),
        Meeting.findOne({}).sort({ createdAt: 1 }).select('createdAt').lean(),
      ]);
      const candidates = [firstCall?.initiatedAt, firstLead?.createdAt, firstMeeting?.createdAt]
        .filter(Boolean)
        .map((d: any) => new Date(d).getTime());
      const earliest = candidates.length ? new Date(Math.min(...candidates)) : null;
      const cap = dayStart(addDaysToKey(dayKey(endDate), -364));
      const fallback = dayStart(addDaysToKey(dayKey(endDate), -29));
      startDate = earliest ? new Date(Math.max(earliest.getTime(), cap.getTime())) : fallback;
    }

    const series = await computeTimeseries(
      { campaignId: campaignObjId, startDate, endDate },
      granularity,
    );

    res.status(200).json({
      success: true,
      data: {
        granularity,
        series,
        filters: {
          campaignId: filters.campaignId ?? null,
          startDate,
          endDate,
        },
      },
    });
  } catch (err: any) {
    if (err instanceof InvalidCampaignIdError) {
      res.status(400).json({ success: false, message: err.message });
      return;
    }
    console.error('[Analytics] getAnalyticsTimeseries error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to load analytics timeseries',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};