// ─────────────────────────────────────────────
//  LeadMind AI — Calls API
//  Day 20 · Session 2
//  UC-08  unified call log
//
//  Response envelope from backend:
//    { success: boolean, data: CallLogRow[], pagination }
// ─────────────────────────────────────────────

import apiClient from '@/src/lib/api/client';
import { Pagination } from '@/src/lib/api/campaigns';

export type CallType = 'Inbound' | 'Outbound';

export type CallStatus =
  | 'Initiated'
  | 'Ringing'
  | 'Answered'
  | 'No Answer'
  | 'Busy'
  | 'Voicemail'
  | 'Completed'
  | 'Failed'
  | 'Abandoned';

// Statuses where the call is still actively in progress — used both for the
// live pulse indicator and to decide whether the Calls page should keep
// polling for updates.
export const LIVE_CALL_STATUSES: CallStatus[] = ['Initiated', 'Ringing', 'Answered'];

export interface CallLogRow {
  _id: string;
  lead: { _id: string; fullName: string; phone: string } | null;
  campaign: { _id: string; name: string } | null; // null for inbound calls with no campaign context
  callType: CallType;
  status: CallStatus;
  durationSeconds: number;
  durationFormatted: string; // schema virtual, e.g. "03:45"
  transcript: string | null; // Transcript _id, if one exists yet — null while a call is still live
  initiatedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  qualificationScore: number | null;
  finalLeadStatus: string | null;
  vapiCallId: string | null;
}

export interface CallsQuery {
  callType?: CallType;
  status?: CallStatus;
  campaign?: string;
  startDate?: string; // ISO date
  endDate?: string; // ISO date
  page?: number;
  limit?: number;
  sortBy?: 'initiatedAt' | 'durationSeconds' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export async function fetchCalls(query: CallsQuery = {}): Promise<{
  calls: CallLogRow[];
  pagination: Pagination;
}> {
  const params: Record<string, string | number> = {};
  if (query.callType) params.callType = query.callType;
  if (query.status) params.status = query.status;
  if (query.campaign) params.campaign = query.campaign;
  if (query.startDate) params.startDate = query.startDate;
  if (query.endDate) params.endDate = query.endDate;
  if (query.page) params.page = query.page;
  if (query.limit) params.limit = query.limit;
  if (query.sortBy) params.sortBy = query.sortBy;
  if (query.sortOrder) params.sortOrder = query.sortOrder;

  const res = await apiClient.get('/api/calls', { params });
  return {
    calls: res.data.data as CallLogRow[],
    pagination: res.data.pagination as Pagination,
  };
}