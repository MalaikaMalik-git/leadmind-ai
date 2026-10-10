// backend/src/utils/auditLog.ts
//
// LeadMind AI — logAction utility (Day 26, Session 1)
//
// Single entry point used across controllers to record an ADMIN ACTION
// (login, campaign create, campaign status change) to the AuditLog
// collection, for the Day 26 audit log viewer. Deliberately mirrors
// errorLog.ts's logError() shape and guarantees — see that file's header
// comment for the full reasoning, repeated here because it applies
// identically:
//
//   - The DB write is best-effort. If it fails (Mongo down, validation
//     error, whatever), that failure is itself only logged to console —
//     it must NEVER throw back into the caller. An audit logger that can
//     crash the request it's logging (e.g. fail a real login because the
//     audit write failed) would be strictly worse than no audit log.
//   - Console output happens unconditionally alongside the DB write, so
//     the action is still visible in server logs even if Mongo is briefly
//     unreachable.

const AuditLog = require('../models/AuditLog');

export interface AuditLogMetadata {
  [key: string]: any;
}

export async function logAction(
  action: string,
  actorId: string,
  actorEmail: string,
  description: string,
  metadata: AuditLogMetadata = {}
): Promise<void> {
  console.log(`[audit] ${action} — ${description}`);

  try {
    await AuditLog.create({ action, actor: actorId, actorEmail, description, metadata });
  } catch (dbErr: any) {
    console.error('[auditLog] Failed to persist AuditLog to DB (non-fatal):', dbErr.message);
  }
}
