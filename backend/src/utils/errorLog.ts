// backend/src/utils/errorLog.ts
//
// LeadMind AI — logError utility (Day 21, Session 2)
//
// Single entry point used across the calling pipeline (webhook handler,
// orchestrator, AI service wrappers) to record a failure both to the
// console (as every one of these call sites already did) AND to the
// ErrorLog collection, without changing the calling code's control flow.
//
// Design principles:
//   - Console logging is unconditional and synchronous — never depends on
//     Mongo being reachable. This preserves exactly the debugging behavior
//     that already existed at every call site before this session.
//   - The DB write is best-effort. If it fails (Mongo down, validation
//     error, whatever), that failure is itself only logged to console —
//     it must NEVER throw back into the caller. An error logger that can
//     crash the code path it's logging from is worse than no logger at
//     all, especially here where most call sites are themselves inside
//     "(non-fatal)" recovery branches.
//   - Fire-and-forget is fine for the DB write in most call sites (they
//     already `await` it below since they're in async functions with
//     nothing time-critical after), EXCEPT handleAssistantRequest in
//     webhookController.ts, which deliberately does NOT await this — see
//     the comment there. Vapi's 7.5s response budget must never depend on
//     a database round-trip.

const ErrorLog = require('../models/ErrorLog');

export interface ErrorLogContext {
  [key: string]: any;
}

export async function logError(
  source: string,
  error: unknown,
  context: ErrorLogContext = {},
  severity: 'error' | 'warning' = 'error'
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  // Unconditional console output — identical to what every call site did
  // before this session, so nothing about local debugging changes.
  console.error(`[${source}]`, message, Object.keys(context).length ? context : '');

  try {
    await ErrorLog.create({ source, message, stack, context, severity });
  } catch (dbErr: any) {
    console.error('[errorLog] Failed to persist ErrorLog to DB (non-fatal):', dbErr.message);
  }
}