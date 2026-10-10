// ─────────────────────────────────────────────
//  LeadMind AI — Audit Log Types
//  Day 26, Session 4
//  Matches GET /api/audit-log (auditLogController.ts, Day 26, Session 1)
// ─────────────────────────────────────────────

export interface AuditLogEntry {
  _id: string;
  action: string;
  actor: string;
  actorEmail: string;
  description: string;
  metadata: Record<string, any>;
  createdAt: string;
}

export interface AuditLogPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AuditLogQuery {
  page?: number;
  limit?: number;
  action?: string;
  startDate?: string;
  endDate?: string;
}
