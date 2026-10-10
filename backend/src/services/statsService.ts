// backend/src/services/statsService.ts
//
// LeadMind AI — single source of truth for every statistic shown in the app.
//
// Dashboard, Analytics and Campaign pages all call the functions below, so a
// number can never differ between pages. Definitions (change them HERE only):
//
//   • totalLeads      — Lead docs (by createdAt)
//   • qualifiedLeads  — Lead with isQualified:true OR a qualified status
//                       (Qualified, Meeting Booked, Qualified (No Slot),
//                       Qualified (Booking Failed))        (by createdAt)
//   • meetingsBooked  — Meeting docs that are not Cancelled (by createdAt)
//   • totalCalls      — CallLog docs, any status/channel   (by initiatedAt)
//   • callsAnswered   — CallLog docs with answeredAt set   (by initiatedAt)
//   • avg duration    — Completed calls only
//
// All "per day" grouping and date-only filters use ONE timezone
// (STATS_TIMEZONE, default Asia/Karachi) so that a call made at 11pm local
// time lands on the same day in every chart and filter.

import mongoose from 'mongoose';
const { Lead, Meeting, CallLog } = require('../models/Index');

export const STATS_TIMEZONE = process.env.STATS_TIMEZONE || 'Asia/Karachi';

export const QUALIFIED_STATUSES = [
  'Qualified',
  'Meeting Booked',
  'Qualified (No Slot)',
  'Qualified (Booking Failed)',
];

// ─── Timezone helpers ───────────────────────────────────────────────────────

function tzOffsetMs(date: Date, tz = STATS_TIMEZONE): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** "YYYY-MM-DD" of an instant, in the stats timezone. */
export function dayKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: STATS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** The instant a given local day starts (00:00:00.000) in the stats timezone. */
export function dayStart(key: string): Date {
  const utc = Date.parse(`${key}T00:00:00Z`);
  let instant = utc - tzOffsetMs(new Date(utc));
  instant = utc - tzOffsetMs(new Date(instant)); // refine across DST edges
  return new Date(instant);
}

export function addDaysToKey(key: string, days: number): string {
  const d = new Date(Date.parse(`${key}T00:00:00Z`));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The last instant (23:59:59.999) of a given local day. */
export function dayEnd(key: string): Date {
  return new Date(dayStart(addDaysToKey(key, 1)).getTime() - 1);
}

/** ISO-week key such as "2026-W34" for a "YYYY-MM-DD" key. */
export function isoWeekKey(key: string): string {
  const d = new Date(Date.parse(`${key}T00:00:00Z`));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// ─── Filters ────────────────────────────────────────────────────────────────

export interface StatsRange {
  campaignId?: mongoose.Types.ObjectId | null;
  startDate?: Date;
  endDate?: Date;
}

function range(field: string, r: StatsRange): Record<string, any> {
  if (!r.startDate && !r.endDate) return {};
  const q: Record<string, Date> = {};
  if (r.startDate) q.$gte = r.startDate;
  if (r.endDate) q.$lte = r.endDate;
  return { [field]: q };
}

export function leadFilter(r: StatsRange = {}): Record<string, any> {
  const f: Record<string, any> = { ...range('createdAt', r) };
  if (r.campaignId) f.campaign = r.campaignId;
  return f;
}

export function qualifiedLeadFilter(r: StatsRange = {}): Record<string, any> {
  return {
    ...leadFilter(r),
    $or: [{ isQualified: true }, { status: { $in: QUALIFIED_STATUSES } }],
  };
}

export function meetingFilter(r: StatsRange = {}): Record<string, any> {
  const f: Record<string, any> = { status: { $ne: 'Cancelled' }, ...range('createdAt', r) };
  if (r.campaignId) f.campaign = r.campaignId;
  return f;
}

export function callFilter(r: StatsRange = {}): Record<string, any> {
  const f: Record<string, any> = { ...range('initiatedAt', r) };
  if (r.campaignId) f.campaign = r.campaignId;
  return f;
}

// ─── Core numbers ───────────────────────────────────────────────────────────

export interface CoreStats {
  totalLeads: number;
  qualifiedLeads: number;
  meetingsBooked: number;
  totalCalls: number;
  callsAnswered: number;
  qualRatePercent: number;
  avgCallDurationSeconds: number;
  avgCallDurationFormatted: string;
}

export function formatDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export async function computeCoreStats(r: StatsRange = {}): Promise<CoreStats> {
  const [totalLeads, qualifiedLeads, meetingsBooked, totalCalls, callsAnswered, durationAgg] = await Promise.all([
    Lead.countDocuments(leadFilter(r)),
    Lead.countDocuments(qualifiedLeadFilter(r)),
    Meeting.countDocuments(meetingFilter(r)),
    CallLog.countDocuments(callFilter(r)),
    CallLog.countDocuments({ ...callFilter(r), answeredAt: { $ne: null } }),
    CallLog.aggregate([
      { $match: { ...callFilter(r), status: 'Completed' } },
      { $group: { _id: null, avg: { $avg: '$durationSeconds' } } },
    ]),
  ]);

  const avg = durationAgg[0]?.avg ? Math.round(durationAgg[0].avg) : 0;
  return {
    totalLeads,
    qualifiedLeads,
    meetingsBooked,
    totalCalls,
    callsAnswered,
    qualRatePercent: totalLeads > 0 ? Math.round((qualifiedLeads / totalLeads) * 1000) / 10 : 0,
    avgCallDurationSeconds: avg,
    avgCallDurationFormatted: formatDuration(avg),
  };
}

/** % change of `current` vs `previous`; undefined when it can't be computed. */
export function percentChange(current: number, previous: number): number | undefined {
  if (previous <= 0) return undefined;
  return Math.round(((current - previous) / previous) * 100);
}

// ─── Time series ────────────────────────────────────────────────────────────

export interface SeriesPoint {
  bucket: string;
  calls: number;
  qualified: number;
  meetings: number;
}

function bucketExpr(field: string, granularity: 'day' | 'week') {
  return {
    $dateToString: {
      format: granularity === 'week' ? '%G-W%V' : '%Y-%m-%d',
      date: `$${field}`,
      timezone: STATS_TIMEZONE,
    },
  };
}

export async function computeTimeseries(
  r: StatsRange & { startDate: Date; endDate: Date },
  granularity: 'day' | 'week' = 'day',
): Promise<SeriesPoint[]> {
  const [callBuckets, qualifiedBuckets, meetingBuckets] = await Promise.all([
    CallLog.aggregate([
      { $match: callFilter(r) },
      { $group: { _id: bucketExpr('initiatedAt', granularity), count: { $sum: 1 } } },
    ]),
    Lead.aggregate([
      { $match: qualifiedLeadFilter(r) },
      { $group: { _id: bucketExpr('createdAt', granularity), count: { $sum: 1 } } },
    ]),
    Meeting.aggregate([
      { $match: meetingFilter(r) },
      { $group: { _id: bucketExpr('createdAt', granularity), count: { $sum: 1 } } },
    ]),
  ]);

  const merged: Record<string, SeriesPoint> = {};
  const ensure = (bucket: string) =>
    (merged[bucket] ??= { bucket, calls: 0, qualified: 0, meetings: 0 });

  // Zero-fill every bucket in the range so charts have no gaps.
  const lastKey = dayKey(r.endDate);
  for (let key = dayKey(r.startDate); key <= lastKey; key = addDaysToKey(key, 1)) {
    ensure(granularity === 'week' ? isoWeekKey(key) : key);
  }
  for (const row of callBuckets as any[]) ensure(row._id).calls = row.count;
  for (const row of qualifiedBuckets as any[]) ensure(row._id).qualified = row.count;
  for (const row of meetingBuckets as any[]) ensure(row._id).meetings = row.count;

  return Object.values(merged).sort((a, b) => a.bucket.localeCompare(b.bucket));
}

/** Range covering the last `days` local days, including today. */
export function lastNDaysRange(days: number): { startDate: Date; endDate: Date } {
  const now = new Date();
  const startKey = addDaysToKey(dayKey(now), -(days - 1));
  return { startDate: dayStart(startKey), endDate: now };
}

// ─── Per-campaign live stats ────────────────────────────────────────────────
// Campaign.stats counters are incremented from several code paths and can
// drift (retries, web calls, re-scored leads, deleted leads). Pages show these
// live numbers instead, computed from the same collections as everything else.

export interface CampaignLiveStats {
  totalLeads: number;
  callsMade: number;
  callsAnswered: number;
  qualified: number;
  notQualified: number;
  meetingsBooked: number;
  noAnswer: number;
  failed: number;
}

const EMPTY_STATS: CampaignLiveStats = {
  totalLeads: 0,
  callsMade: 0,
  callsAnswered: 0,
  qualified: 0,
  notQualified: 0,
  meetingsBooked: 0,
  noAnswer: 0,
  failed: 0,
};

export async function computeCampaignStats(
  campaignIds: Array<string | mongoose.Types.ObjectId>,
): Promise<Record<string, CampaignLiveStats>> {
  const ids = campaignIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  const out: Record<string, CampaignLiveStats> = {};
  for (const id of ids) out[String(id)] = { ...EMPTY_STATS };
  if (ids.length === 0) return out;

  const [leadAgg, callAgg, meetingAgg] = await Promise.all([
    Lead.aggregate([
      { $match: { campaign: { $in: ids } } },
      {
        $group: {
          _id: '$campaign',
          totalLeads: { $sum: 1 },
          qualified: {
            $sum: {
              $cond: [
                { $or: [{ $eq: ['$isQualified', true] }, { $in: ['$status', QUALIFIED_STATUSES] }] },
                1,
                0,
              ],
            },
          },
          notQualified: { $sum: { $cond: [{ $eq: ['$status', 'Not Qualified'] }, 1, 0] } },
        },
      },
    ]),
    CallLog.aggregate([
      { $match: { campaign: { $in: ids } } },
      {
        $group: {
          _id: '$campaign',
          callsMade: { $sum: 1 },
          callsAnswered: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$answeredAt', null] }, null] }, 1, 0] } },
          noAnswer: { $sum: { $cond: [{ $eq: ['$status', 'No Answer'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'Failed'] }, 1, 0] } },
        },
      },
    ]),
    Meeting.aggregate([
      { $match: { campaign: { $in: ids }, status: { $ne: 'Cancelled' } } },
      { $group: { _id: '$campaign', meetingsBooked: { $sum: 1 } } },
    ]),
  ]);

  for (const row of leadAgg as any[]) {
    Object.assign(out[String(row._id)], {
      totalLeads: row.totalLeads,
      qualified: row.qualified,
      notQualified: row.notQualified,
    });
  }
  for (const row of callAgg as any[]) {
    Object.assign(out[String(row._id)], {
      callsMade: row.callsMade,
      callsAnswered: row.callsAnswered,
      noAnswer: row.noAnswer,
      failed: row.failed,
    });
  }
  for (const row of meetingAgg as any[]) {
    out[String(row._id)].meetingsBooked = row.meetingsBooked;
  }
  return out;
}
