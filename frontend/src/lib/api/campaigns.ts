// ─────────────────────────────────────────────
//  LeadMind AI — Campaigns API
//  Day 8 · Session 3 (list/stats/status)
//  Day 9 · Session 4 (createCampaign added)
//
//  All calls go through the shared axios instance
//  in client.ts which automatically attaches the
//  in-memory Bearer token on every request.
//
//  Response envelope from backend:
//    { success: boolean, data: Campaign | Campaign[],
//      pagination?: { total, page, limit, totalPages,
//                     hasNext, hasPrev } }
// ─────────────────────────────────────────────

import apiClient from '@/src/lib/api/client';
import { Campaign } from '@/src/components/campaigns/CampaignCard';

// ── Query params for GET /api/campaigns ───────
export interface CampaignQuery {
  status?: 'Draft' | 'Running' | 'Paused' | 'Completed' | 'Archived';
  search?: string;
  page?:   number;
  limit?:  number;
  /** Include archived campaigns (filter dropdowns on Calls / Leads / Analytics). */
  includeArchived?: boolean;
}

// ── Pagination meta returned by backend ───────
export interface Pagination {
  total:      number;
  page:       number;
  limit:      number;
  totalPages: number;
  hasNext:    boolean;
  hasPrev:    boolean;
}

// ── List campaigns (GET /api/campaigns) ───────
export async function fetchCampaigns(query: CampaignQuery = {}): Promise<{
  campaigns:  Campaign[];
  pagination: Pagination;
}> {
  const params: Record<string, string | number> = {};
  if (query.status) params.status = query.status;
  if (query.search) params.search = query.search;
  if (query.page)   params.page   = query.page;
  if (query.limit)  params.limit  = query.limit;
  if (query.includeArchived) params.includeArchived = 'true';

  const res = await apiClient.get('/api/campaigns', { params });
  return {
    campaigns:  res.data.data        as Campaign[],
    pagination: res.data.pagination  as Pagination,
  };
}

// ── Aggregate stats: one call per status ──────
// Backend doesn't have a /stats endpoint yet so
// we derive totals from countDocuments-style calls.
// We fetch all (limit=200) once and derive counts
// client-side — fast enough for typical campaign counts.
export async function fetchCampaignStats() {
  const res = await apiClient.get('/api/campaigns', {
    params: { limit: 200, page: 1, includeArchived: 'true' },
  });

  const all: Campaign[] = res.data.data ?? [];
  return {
    total:     all.filter((c: Campaign) => c.status !== 'Archived').length,   // archived are hidden from the working total
    running:   all.filter((c: Campaign) => c.status === 'Running').length,
    paused:    all.filter((c: Campaign) => c.status === 'Paused').length,
    draft:     all.filter((c: Campaign) => c.status === 'Draft').length,
    completed: all.filter((c: Campaign) => c.status === 'Completed').length,
    archived:  all.filter((c: Campaign) => c.status === 'Archived').length,
  };
}

// ── Get single campaign (GET /api/campaigns/:id) ──
// Day 10 · Session 1 — used by the Campaign Settings page.
// Throws on 404 (handled by the caller) — apiClient's
// interceptor already normalizes error.message.
export async function getCampaignById(id: string): Promise<Campaign> {
  const res = await apiClient.get(`/api/campaigns/${id}`);
  return res.data.data as Campaign;
}

// ── Update campaign settings (PUT /api/campaigns/:id) ──
// Day 10 · Session 4 — powers the Campaign Settings save flow (UC-03).
// Partial update: only send the fields the settings page actually
// edits (goal, tone, instructions, dailyCallLimit, quietHours).
// Name/dates/status are untouched by this call.
export interface UpdateCampaignPayload {
  goal:           string;
  tone:           string;
  instructions:   string;
  dailyCallLimit: number;
  quietHours: {
    enabled:   boolean;
    startTime: string;
    endTime:   string;
    timezone:  string;
  };
}

export async function updateCampaign(
  id:      string,
  payload: UpdateCampaignPayload,
): Promise<Campaign> {
  const res = await apiClient.put(`/api/campaigns/${id}`, payload);
  return res.data.data as Campaign;
}

// ── Update campaign status (Pause / Resume) ───
// PUT /api/campaigns/:id deliberately ignores `status`, so pause/resume use the
// orchestrator endpoints (UC-05): POST /:id/pause stops further dialing;
// POST /:id/start (Resume) sets the campaign Running and dials the next lead.
// A failure (e.g. "No Pending leads to call") is thrown to the caller.
export async function updateCampaignStatus(
  id:     string,
  status: 'Running' | 'Paused',
): Promise<void> {
  await apiClient.post(`/api/campaigns/${id}/${status === 'Paused' ? 'pause' : 'start'}`);
}

// ── Create campaign (POST /api/campaigns) ─────
// UC-02 Main Success Scenario — used by the Create
// Campaign wizard (Day 9, Session 4).
//
// Shape matches exactly what campaignController.ts
// createCampaign() destructures from req.body.
// Backend always sets status: 'Draft' on create —
// we never send status here.

export interface CreateCampaignPayload {
  name:           string;
  goal:           string;
  tone:           string;
  instructions:   string;
  dailyCallLimit: number;
  startDate?:     string | null;
  endDate?:       string | null;
  quietHours: {
    enabled:   boolean;
    startTime: string;
    endTime:   string;
    timezone:  string;
  };
}

export async function createCampaign(
  payload: CreateCampaignPayload,
): Promise<Campaign> {
  const res = await apiClient.post('/api/campaigns', payload);
  return res.data.data as Campaign;
}

// ── Archive / restore / permanent delete ──────
// Archive is the normal "delete": reversible, keeps all leads/calls/meetings.
export interface CampaignImpact {
  status: string;
  name: string;
  leads: number;
  qualifiedLeads: number;
  pendingLeads: number;
  calls: number;
  transcripts: number;
  meetings: number;
  upcomingMeetings: number;
  canDeletePermanently: boolean;
}

export async function fetchCampaignImpact(id: string): Promise<CampaignImpact> {
  const res = await apiClient.get(`/api/campaigns/${id}/impact`);
  return res.data.data as CampaignImpact;
}

export async function archiveCampaign(id: string): Promise<void> {
  await apiClient.post(`/api/campaigns/${id}/archive`);
}

export async function restoreCampaign(id: string): Promise<void> {
  await apiClient.post(`/api/campaigns/${id}/restore`);
}

export async function deleteCampaignPermanently(
  id: string,
  opts: { confirmName: string; keepQualified: boolean },
): Promise<{ message: string }> {
  const res = await apiClient.delete(`/api/campaigns/${id}`, {
    params: { confirmName: opts.confirmName, keepQualified: opts.keepQualified ? 'true' : 'false' },
  });
  return { message: res.data.message as string };
}
