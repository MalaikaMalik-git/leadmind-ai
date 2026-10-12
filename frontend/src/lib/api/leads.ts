// ─────────────────────────────────────────────
//  LeadMind AI — Leads API
//  Day 12 · Session 1
//
//  All calls go through the shared axios instance in client.ts, which
//  automatically attaches the in-memory Bearer token on every request.
//
//  Response envelope from backend:
//    { success: boolean, data: Lead | Lead[], pagination?: {...} }
//    (importLeads is the one exception — its payload is { summary, failedRows })
// ─────────────────────────────────────────────

import apiClient from '@/src/lib/api/client';

// ── Lead shape — mirrors backend/src/models/Lead.js exactly ──────────────
export type LeadStatus =
  | 'Pending'
  | 'Calling'
  | 'Qualified'
  | 'Not Qualified'
  | 'No Answer'
  | 'Voicemail'
  | 'Busy'
  | 'Meeting Booked'
  | 'Needs Human Follow-up'
  | 'Callback Requested'
  | 'Invalid Contact'
  | 'Abandoned'
  | 'Call Failed'
  | 'Qualified (No Slot)'
  | 'Qualified (Booking Failed)';

export type LeadSource = 'CSV Upload' | 'Inbound Call' | 'Manual Entry';

export interface ScoreBreakdown {
  budgetConfirmed: boolean | null;
  timelineDefined: boolean | null;
  scopeClear: boolean | null;
  isDecisionMaker: boolean | null;
}

export interface Lead {
  _id: string;
  fullName: string;
  phone: string;
  email: string | null;
  company: string | null;
  jobTitle: string | null;
  campaign: { _id: string; name: string } | string | null; // populated on list endpoint
  source: LeadSource;
  status: LeadStatus;
  qualificationScore: number | null;
  isQualified: boolean | null;
  scoreBreakdown: ScoreBreakdown;
  qualificationReason: string | null;
  totalCallAttempts: number;
  lastCalledAt: string | null;
  adminNotes: string | null;
  meeting: string | null;
  importBatch: string | null;
  rawCsvData: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}

// ── Pagination meta returned by backend ───────
export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
//  Import Leads (CSV) — UC-04
//  POST /api/leads/import/:campaignId  (multipart/form-data)
// ─────────────────────────────────────────────────────────────────────────

export type DuplicateStrategy = 'skip' | 'update' | 'importAll';

export interface ImportFailedRow {
  row: number;
  fullName: string | null;
  reason: string;
}

export interface ImportSummary {
  total: number;
  success: number;
  updated: number;
  failed: number;
  duplicates: number;
  duplicateStrategy: DuplicateStrategy;
  importBatch: string;
}

export interface ImportLeadsResult {
  summary: ImportSummary;
  failedRows: ImportFailedRow[];
}

export async function importLeads(
  campaignId: string,
  file: File,
  duplicateStrategy: DuplicateStrategy = 'skip'
): Promise<ImportLeadsResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('duplicateStrategy', duplicateStrategy);

  const res = await apiClient.post(`/api/leads/import/${campaignId}`, formData, {
    // Let the browser compute the multipart boundary — this header value
    // (without a boundary param) is what tells axios/XHR not to keep the
    // client's default 'application/json' header instead.
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return {
    summary: res.data.summary as ImportSummary,
    failedRows: res.data.failedRows as ImportFailedRow[],
  };
}

// ─────────────────────────────────────────────────────────────────────────
//  List Leads — UC-07
//  GET /api/leads
// ─────────────────────────────────────────────────────────────────────────

export interface LeadQuery {
  status?: LeadStatus;
  campaign?: string;
  source?: LeadSource;
  search?: string;
  importBatch?: string;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'fullName' | 'qualificationScore' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export async function fetchLeads(query: LeadQuery = {}): Promise<{
  leads: Lead[];
  pagination: Pagination;
}> {
  const params: Record<string, string | number> = {};
  if (query.status) params.status = query.status;
  if (query.campaign) params.campaign = query.campaign;
  if (query.source) params.source = query.source;
  if (query.search) params.search = query.search;
  if (query.importBatch) params.importBatch = query.importBatch;
  if (query.page) params.page = query.page;
  if (query.limit) params.limit = query.limit;
  if (query.sortBy) params.sortBy = query.sortBy;
  if (query.sortOrder) params.sortOrder = query.sortOrder;

  const res = await apiClient.get('/api/leads', { params });
  return {
    leads: res.data.data as Lead[],
    pagination: res.data.pagination as Pagination,
  };
}

// ─────────────────────────────────────────────────────────────────────────
//  Import History — Day 12 sidebar panel
//  GET /api/leads/import-history/:campaignId
// ─────────────────────────────────────────────────────────────────────────

export interface ImportHistoryEntry {
  importBatch: string;
  total: number;
  qualified: number;
  importedAt: string;
}

export async function fetchImportHistory(campaignId: string): Promise<ImportHistoryEntry[]> {
  const res = await apiClient.get(`/api/leads/import-history/${campaignId}`);
  return res.data.data as ImportHistoryEntry[];
}

// ─────────────────────────────────────────────────────────────────────────
//  Lead Detail — Day 13 · Session 1 (backend) / Session 2 (this file)
//  UC-07  View Leads & Statuses
//  GET   /api/leads/:id
//  PATCH /api/leads/:id
// ─────────────────────────────────────────────────────────────────────────

// ── Call history entry — mirrors backend/src/models/CallLog.js (selected fields) ──
export type CallType = 'Inbound' | 'Outbound';

export interface CallLogEntry {
  _id: string;
  callType: CallType;
  status: string;
  durationSeconds: number;
  attemptNumber: number;
  isRetry: boolean;
  initiatedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  transcript: string | null; // Transcript _id, if one was created for this call
  qualificationScore: number | null;
  finalLeadStatus: string | null;
  errorMessage: string | null;
}

// ── Booked meeting — mirrors backend/src/models/Meeting.js (selected fields) ──
export interface MeetingSummary {
  _id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  timezone: string;
  status: 'Scheduled' | 'Completed' | 'Cancelled' | 'Rescheduled' | 'No Show';
  googleCalendar?: { eventId: string | null; meetingLink: string | null };
}

export interface LeadDetail {
  lead: Lead;
  callLogs: CallLogEntry[];
  meeting: MeetingSummary | null;
}

export async function fetchLeadById(id: string): Promise<LeadDetail> {
  const res = await apiClient.get(`/api/leads/${id}`);
  return res.data.data as LeadDetail;
}

// ── Update Lead — UC-07: manual status change + admin notes ──────────────
export interface UpdateLeadPayload {
  status?: LeadStatus;
  adminNotes?: string | null;
}

export async function updateLead(id: string, payload: UpdateLeadPayload): Promise<Lead> {
  const res = await apiClient.patch(`/api/leads/${id}`, payload);
  return res.data.data as Lead;
}

export async function deleteLead(id: string): Promise<void> {
  await apiClient.delete(`/api/leads/${id}`);
}