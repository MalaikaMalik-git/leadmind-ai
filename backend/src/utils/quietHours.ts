// backend/src/utils/quietHours.ts
//
// LeadMind AI — Quiet Hours Compliance Utility (Day 15, Session 1)
// Related UC: UC-05 Start/Run Outbound Calling Campaign
//   Main flow step 3: "The system checks quiet hours compliance."
//   A1 — Quiet Hours Active: "System delays call execution. Campaign shows
//   'Paused due to Quiet Hours'."
//
// This is a pure, framework-agnostic function — no DB access, no Express
// types — so it's trivially unit-testable (see scripts/testDay15Session1.ts)
// and reusable from both the orchestrator service and the queue-status
// endpoint.
//
// Design note: "Paused due to Quiet Hours" from UC-05 A1 is a *derived*
// display state, not a stored Campaign.status value (Campaign.status enum
// is Draft/Running/Paused/Completed/Archived — see Campaign.js). A campaign
// stays "Running" through quiet hours; we just skip dialing until the
// window ends. This matches the CallLog.blockedByQuietHours flag Day 14
// already added to the schema.

export interface QuietHoursConfig {
  enabled: boolean;
  startTime: string; // "HH:MM", 24-hour
  endTime: string;   // "HH:MM", 24-hour
  timezone: string;  // IANA tz, e.g. "Asia/Karachi"
}

export interface QuietHoursStatus {
  blocked: boolean;
  reason: string;
  currentTimeInZone: string | null;
  timezone: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  getTimeInTimezone
//  Returns "HH:MM" for `date` as observed in IANA timezone `timeZone`,
//  using Intl (no extra date library dependency needed).
// ─────────────────────────────────────────────────────────────────────────────

function getTimeInTimezone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);

  const rawHour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  // Some environments return "24" for midnight with hour12:false — normalize.
  const hour = rawHour === '24' ? '00' : rawHour;

  return `${hour}:${minute}`;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// ─────────────────────────────────────────────────────────────────────────────
//  isWithinQuietHours
//  Handles both same-day windows (e.g. 13:00 -> 18:00) and overnight windows
//  that cross midnight (e.g. 22:00 -> 08:00, the campaign's own default).
// ─────────────────────────────────────────────────────────────────────────────

export function isWithinQuietHours(
  quietHours: QuietHoursConfig | undefined | null,
  now: Date = new Date()
): boolean {
  if (!quietHours?.enabled) return false;

  const tz = quietHours.timezone || 'Asia/Karachi';
  const currentMinutes = toMinutes(getTimeInTimezone(now, tz));
  const startMinutes = toMinutes(quietHours.startTime);
  const endMinutes = toMinutes(quietHours.endTime);

  if (startMinutes === endMinutes) return false; // zero-length window — already blocked at save time (UC-03 A1)

  if (startMinutes < endMinutes) {
    // Same-day window, e.g. 13:00 -> 18:00
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  // Overnight window, e.g. 22:00 -> 08:00
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

// ─────────────────────────────────────────────────────────────────────────────
//  getQuietHoursStatus
//  Richer version for the queue-status endpoint (Session 1) — includes the
//  human-readable reason and the admin's local time, so the dashboard can
//  show something like "Paused due to Quiet Hours (23:14 PKT)".
// ─────────────────────────────────────────────────────────────────────────────

export function getQuietHoursStatus(
  quietHours: QuietHoursConfig | undefined | null,
  now: Date = new Date()
): QuietHoursStatus {
  if (!quietHours?.enabled) {
    return { blocked: false, reason: 'Quiet hours not enabled for this campaign.', currentTimeInZone: null, timezone: null };
  }

  const tz = quietHours.timezone || 'Asia/Karachi';
  const currentTimeInZone = getTimeInTimezone(now, tz);
  const blocked = isWithinQuietHours(quietHours, now);

  return {
    blocked,
    reason: blocked
      ? `Paused due to Quiet Hours (${currentTimeInZone} ${tz}, window ${quietHours.startTime}-${quietHours.endTime}).`
      : `Outside quiet hours (${currentTimeInZone} ${tz}) — calling is allowed.`,
    currentTimeInZone,
    timezone: tz,
  };
}