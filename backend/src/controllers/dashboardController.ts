import { Request, Response } from 'express';
import {
  computeCoreStats,
  computeTimeseries,
  computeCampaignStats,
  lastNDaysRange,
  percentChange,
  dayKey,
  STATS_TIMEZONE,
} from '../services/statsService';
const { Lead, Campaign } = require('../models/Index');

// ─────────────────────────────────────────────────────────────────────────────
//  LeadMind AI — Dashboard Controller
//
//  GET /api/dashboard/stats
//    KPI cards, lead-status donut, recent leads, active campaigns.
//    Every number comes from services/statsService.ts — the same module the
//    Analytics page and the Campaign pages use — so all pages always agree.
//    KPI values are ALL-TIME totals (same as Analytics with the "All" range).
//
//  GET /api/dashboard/call-volume?days=7|30|90
//    Chart data for the dashboard's 7D / 30D / 90D toggle.
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_DAYS = [7, 30, 90];

function labelFor(bucket: string): string {
  // bucket is "YYYY-MM-DD" -> "Jan 5"
  const d = new Date(`${bucket}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

async function buildCallVolume(days: number) {
  const { startDate, endDate } = lastNDaysRange(days);
  const series = await computeTimeseries({ startDate, endDate }, 'day');
  return series.map((p) => ({
    bucket: p.bucket,
    date: labelFor(p.bucket),
    calls: p.calls,
    qualified: p.qualified,
    meetings: p.meetings,
  }));
}

export const getDashboardCallVolume = async (req: Request, res: Response): Promise<void> => {
  try {
    const requested = parseInt(String(req.query.days ?? '7'), 10);
    const days = ALLOWED_DAYS.includes(requested) ? requested : 7;
    const callVolume = await buildCallVolume(days);
    res.status(200).json({ success: true, data: { days, callVolume } });
  } catch (err: any) {
    console.error('[Dashboard] getDashboardCallVolume error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to load call volume',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};

export const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const now = new Date();
    const last7 = lastNDaysRange(7);
    const prev7End = new Date(last7.startDate.getTime() - 1);
    const prev7Start = new Date(last7.startDate.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      allTime,
      recent7,
      previous7,
      activeCampaignsCount,
      leadStatusAgg,
      callVolume,
      recentLeads,
      activeCampaignsList,
    ] = await Promise.all([
      computeCoreStats({}),
      computeCoreStats({ startDate: last7.startDate, endDate: now }),
      computeCoreStats({ startDate: prev7Start, endDate: prev7End }),
      Campaign.countDocuments({ status: 'Running' }),
      Lead.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      buildCallVolume(7),
      Lead.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .select('fullName status qualificationScore campaign createdAt source')
        .populate('campaign', 'name')
        .lean(),
      Campaign.find({ status: 'Running' })
        .sort({ startedAt: -1 })
        .limit(5)
        .select('name status dailyCallLimit startedAt')
        .lean(),
    ]);

    const liveStats = await computeCampaignStats((activeCampaignsList as any[]).map((c) => c._id));

    const leadStatusBreakdown: Record<string, number> = {};
    for (const row of leadStatusAgg as any[]) leadStatusBreakdown[row._id] = row.count;

    const recentLeadsFormatted = (recentLeads as any[]).map((lead) => ({
      id: lead._id.toString(),
      fullName: lead.fullName,
      status: lead.status,
      qualificationScore: lead.qualificationScore ?? null,
      campaignName: lead.campaign?.name ?? 'Inbound',
      source: lead.source,
      createdAt: lead.createdAt,
    }));

    const activeCampaignsFormatted = (activeCampaignsList as any[]).map((c) => {
      const st = liveStats[String(c._id)];
      return {
        id: c._id.toString(),
        name: c.name,
        status: c.status,
        totalLeads: st.totalLeads,
        callsMade: st.callsMade,
        qualified: st.qualified,
        meetingsBooked: st.meetingsBooked,
        dailyCallLimit: c.dailyCallLimit,
        startedAt: c.startedAt,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        kpis: {
          totalLeads: allTime.totalLeads,
          qualifiedLeads: allTime.qualifiedLeads,
          meetingsBooked: allTime.meetingsBooked,
          totalCalls: allTime.totalCalls,
          activeCampaigns: activeCampaignsCount,
        },
        // Real week-over-week change (last 7 days vs the 7 days before).
        // Omitted (undefined) when the previous week had no data.
        trends: {
          totalLeads: percentChange(recent7.totalLeads, previous7.totalLeads),
          qualifiedLeads: percentChange(recent7.qualifiedLeads, previous7.qualifiedLeads),
          meetingsBooked: percentChange(recent7.meetingsBooked, previous7.meetingsBooked),
          totalCalls: percentChange(recent7.totalCalls, previous7.totalCalls),
        },
        callVolume,
        leadStatusBreakdown,
        recentLeads: recentLeadsFormatted,
        activeCampaigns: activeCampaignsFormatted,
        meta: { timezone: STATS_TIMEZONE, asOf: now, today: dayKey(now) },
      },
    });
  } catch (err: any) {
    console.error('[Dashboard] getDashboardStats error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to load dashboard statistics',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};
