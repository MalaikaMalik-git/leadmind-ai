// backend/src/utils/businessHours.ts
//
// LeadMind AI — Business Hours Utility (Day 18, Session 1)
// Related UC: UC-10 (Receive Inbound Call from Lead)
//   Alternative flow A1 — Outside Working Hours: "AI informs lead politely
//   about working hours. AI offers callback or meeting scheduling option."
//
// This deliberately reuses utils/quietHours.ts's isWithinQuietHours() rather
// than duplicating the timezone-aware window-matching logic. The two
// concepts are structurally identical — "is the current time inside a
// configured [start, end) window in a given IANA timezone" — they just mean
// opposite things:
//   - Campaign quiet hours (Day 15): window = DON'T call during this time.
//   - System business hours (Day 18): window = DO answer normally during
//     this time; outside it, give the outside-hours message instead.
//
// Business hours are SYSTEM-wide (env-configured), not per-campaign, because
// an inbound call arrives before we know which campaign (if any) it relates
// to — there's no Campaign document to read a window from yet.
//
// Unlike outbound's per-campaign quietHours (stored in MongoDB), this reads
// from environment variables — no DB round-trip, which matters here because
// the assistant-request webhook (see controllers/webhookController.ts) has
// a hard 7.5-second response budget from VAPI. A pure, synchronous check
// keeps this path fast no matter what.

import { isWithinQuietHours, QuietHoursConfig } from './quietHours';

const DEFAULT_START = '09:00';
const DEFAULT_END = '18:00';
const DEFAULT_TIMEZONE = 'Asia/Karachi'; // matches Campaign quietHours' own default (Day 9) and the FYP report's UC-06 timezone note (UTC+5 PKT)

export interface BusinessHoursStatus {
  withinBusinessHours: boolean;
  currentTimeInZone: string | null;
  timezone: string;
  windowStart: string;
  windowEnd: string;
}

function getBusinessHoursConfig(): QuietHoursConfig {
  return {
    enabled: true,
    startTime: process.env.BUSINESS_HOURS_START || DEFAULT_START,
    endTime: process.env.BUSINESS_HOURS_END || DEFAULT_END,
    timezone: process.env.BUSINESS_HOURS_TIMEZONE || DEFAULT_TIMEZONE,
  };
}

/**
 * True if `now` falls inside the configured business-hours window.
 * Pure function — no DB access, safe to call from the time-critical
 * assistant-request path.
 */
export function isWithinBusinessHours(now: Date = new Date()): boolean {
  const config = getBusinessHoursConfig();
  // isWithinQuietHours() answers "is now inside [startTime, endTime)?" —
  // exactly the question we need, just relabeled from "quiet" to "business".
  return isWithinQuietHours(config, now);
}

/**
 * Richer status object for logging / debugging — mirrors
 * quietHours.getQuietHoursStatus()'s shape for consistency.
 */
export function getBusinessHoursStatus(now: Date = new Date()): BusinessHoursStatus {
  const config = getBusinessHoursConfig();
  const withinBusinessHours = isWithinQuietHours(config, now);

  const currentTimeInZone = new Intl.DateTimeFormat('en-US', {
    timeZone: config.timezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);

  return {
    withinBusinessHours,
    currentTimeInZone,
    timezone: config.timezone,
    windowStart: config.startTime,
    windowEnd: config.endTime,
  };
}