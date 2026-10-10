// ─────────────────────────────────────────────
//  LeadMind AI — Dashboard API
//  Calls GET /api/dashboard/stats
//  Returns typed DashboardStats object
// ─────────────────────────────────────────────

import apiClient from './client';

// ── Types ─────────────────────────────────────

export interface DashboardKpis {
  totalLeads:       number;
  qualifiedLeads:   number;
  meetingsBooked:   number;
  totalCalls:       number;
  activeCampaigns:  number;
}

export interface CallVolumePoint {
  bucket:    string;   // "2026-05-05"
  date:      string;   // "May 5"
  calls:     number;
  qualified: number;
  meetings:  number;
}

export type CallVolumeRange = 7 | 30 | 90;

/** Week-over-week % change; undefined when last week had no data to compare. */
export interface DashboardTrends {
  totalLeads?:     number;
  qualifiedLeads?: number;
  meetingsBooked?: number;
  totalCalls?:     number;
}

export interface RecentLead {
  id:                 string;
  fullName:           string;
  status:             string;
  qualificationScore: number | null;
  campaignName:       string;
  source:             string;
  createdAt:          string;
}

export interface ActiveCampaign {
  id:             string;
  name:           string;
  status:         string;
  totalLeads:     number;
  callsMade:      number;
  qualified:      number;
  meetingsBooked: number;
  dailyCallLimit: number;
  startedAt:      string | null;
}

export interface DashboardStats {
  kpis:                 DashboardKpis;
  trends:               DashboardTrends;
  callVolume:           CallVolumePoint[];
  leadStatusBreakdown:  Record<string, number>;
  recentLeads:          RecentLead[];
  activeCampaigns:      ActiveCampaign[];
}

// ── API calls ─────────────────────────────────

// GET /api/dashboard/call-volume?days=7|30|90 — chart for the 7D/30D/90D toggle
export async function getCallVolume(days: CallVolumeRange): Promise<CallVolumePoint[]> {
  const res = await apiClient.get<{ success: boolean; data: { days: number; callVolume: CallVolumePoint[] } }>(
    '/api/dashboard/call-volume',
    { params: { days } },
  );
  return res.data.data.callVolume;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const res = await apiClient.get<{ success: boolean; data: DashboardStats }>(
    '/api/dashboard/stats'
  );
  return res.data.data;
}