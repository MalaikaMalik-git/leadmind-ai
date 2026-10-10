// ─────────────────────────────────────────────
//  LeadMind AI — Audit Log API
//  Day 26, Session 4
//  Matches ACTUAL backend response shape:
//    GET /api/audit-log → { success, data: AuditLogEntry[], pagination }
// ─────────────────────────────────────────────

import apiClient from './client';
import { AuditLogEntry, AuditLogPagination, AuditLogQuery } from '@/src/types/auditLog';

export async function fetchAuditLog(query: AuditLogQuery = {}): Promise<{
  entries: AuditLogEntry[];
  pagination: AuditLogPagination;
}> {
  const params: Record<string, string | number> = {};
  if (query.page) params.page = query.page;
  if (query.limit) params.limit = query.limit;
  if (query.action) params.action = query.action;
  if (query.startDate) params.startDate = query.startDate;
  if (query.endDate) params.endDate = query.endDate;

  const res = await apiClient.get('/api/audit-log', { params });
  return {
    entries: res.data.data as AuditLogEntry[],
    pagination: res.data.pagination as AuditLogPagination,
  };
}
