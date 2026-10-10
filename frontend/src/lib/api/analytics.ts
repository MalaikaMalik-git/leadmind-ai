// ─────────────────────────────────────────────
//  LeadMind AI — Analytics API
//  Day 25, Session 2
//
//  Talks to the 5 backend endpoints under /api/analytics
//  (3 from Day 17, 2 new from Day 25 Session 1).
//  Follows the same conventions as lib/api/dashboard.ts
//  and lib/api/campaigns.ts — apiClient handles the
//  Bearer token automatically.
// ─────────────────────────────────────────────

import apiClient from '@/src/lib/api/client';

// ── Shared filter shape used by every analytics call ──

export interface AnalyticsQuery {
  campaignId?: string;
  startDate?: string; // ISO date string, e.g. "2026-07-27"
  endDate?: string;
}

function toParams(query: AnalyticsQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.campaignId) params.campaignId = query.campaignId;
  if (query.startDate) params.startDate = query.startDate;
  if (query.endDate) params.endDate = query.endDate;
  return params;
}

// ── GET /api/analytics/summary (Day 25) ───────

export interface AnalyticsSummary {
  totalCalls: number;
  qualifiedLeads: number;
  meetingsBooked: number;
  qualRatePercent: number;
  avgCallDurationSeconds: number;
  avgCallDurationFormatted: string;
}

export async function getAnalyticsSummary(query: AnalyticsQuery = {}): Promise<AnalyticsSummary> {
  const res = await apiClient.get<{ success: boolean; data: AnalyticsSummary }>(
    '/api/analytics/summary',
    { params: toParams(query) }
  );
  return res.data.data;
}

// ── GET /api/analytics/timeseries (Day 25) — used in Session 3 ──

export interface TimeseriesPoint {
  bucket: string; // "2026-08-01" or "2026-W34"
  calls: number;
  qualified: number;
  meetings: number;
}

export interface AnalyticsTimeseries {
  granularity: 'day' | 'week';
  series: TimeseriesPoint[];
}

export async function getAnalyticsTimeseries(
  query: AnalyticsQuery & { granularity?: 'day' | 'week' } = {}
): Promise<AnalyticsTimeseries> {
  const params = { ...toParams(query), ...(query.granularity ? { granularity: query.granularity } : {}) };
  const res = await apiClient.get<{ success: boolean; data: AnalyticsTimeseries }>(
    '/api/analytics/timeseries',
    { params }
  );
  return res.data.data;
}

// ── GET /api/analytics/topics (Day 17) — used in Session 3 ──

export interface TopicCount {
  topic: string;
  count: number;
}

export async function getTopicAnalytics(
  query: AnalyticsQuery = {}
): Promise<{ topics: TopicCount[]; totalTranscriptsAnalyzed: number }> {
  const res = await apiClient.get<{
    success: boolean;
    data: { topics: TopicCount[]; totalTranscriptsAnalyzed: number };
  }>('/api/analytics/topics', { params: toParams(query) });
  return res.data.data;
}