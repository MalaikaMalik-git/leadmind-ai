// backend/src/utils/timezone.ts
//
// LeadMind AI — Timezone conversion utility (Day 23, Session 1)
// Related UC: UC-13 special requirement — "Time zone handling must remain
// consistent between system and Google Calendar."
//
// Needed because slot computation has to answer: "what UTC instant
// corresponds to 9:00 AM in the admin's timezone, on this specific
// calendar date?" Day 18's business-hours check solved a simpler version
// of this (always "today", so DST never mattered within a single check).
// Slot computation runs across a multi-day/week range, which CAN cross a
// DST transition for timezones that observe it — so this version is
// parameterized by the actual target date, not hardcoded to one fixed
// date, and recomputes the correct offset for each date independently.
//
// No new dependency added (no date-fns-tz/luxon/moment-timezone) — this
// uses the same Intl-based "guess, then correct" technique Day 18 already
// established, generalized to work for any date.

/**
 * Converts a wall-clock date+time in a given IANA timezone to the
 * corresponding UTC Date instant.
 *
 * Example: zonedTimeToUtc(2026, 6, 15, 9, 0, 'America/New_York') returns
 * the UTC Date for 9:00 AM New York time on June 15, 2026 — correctly
 * using EDT (UTC-4) for that date, vs. zonedTimeToUtc(2026, 1, 15, 9, 0,
 * 'America/New_York') which correctly uses EST (UTC-5) instead.
 */
export function zonedTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  timezone: string
): Date {
  // Initial guess: treat the wall-clock time as if it were already UTC.
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));

  // Ask what wall-clock time that UTC instant actually displays as when
  // rendered in the target timezone.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(guess);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  let zonedHour = get('hour');
  if (zonedHour === 24) zonedHour = 0; // some ICU implementations report midnight as "24" with hour12:false

  // Treat the zoned reading as if IT were a UTC timestamp too, purely so
  // we can diff the two using plain millisecond arithmetic — this
  // correctly handles the reading rolling over to a different day/month
  // than the guess, without any manual calendar math.
  const zonedAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), zonedHour, get('minute'), get('second'));

  const correctionMs = guess.getTime() - zonedAsUtc;
  return new Date(guess.getTime() + correctionMs);
}

/**
 * Returns the full day-of-week name ("Monday", "Tuesday", ...) for a
 * given UTC Date instant, as it falls in the given IANA timezone. Used to
 * match a calendar date against MeetingSlot.availabilityWindows, which
 * are keyed by day name.
 */
export function getDayOfWeekInZone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long' }).format(date);
}

/**
 * Returns {year, month, day} for a given UTC Date instant, as it falls in
 * the given IANA timezone. Used to iterate calendar dates in the admin's
 * own timezone rather than in UTC (a date range spanning e.g. 00:00-23:59
 * UTC doesn't necessarily match the admin's local calendar days).
 */
export function getDatePartsInZone(date: Date, timezone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return { year: get('year'), month: get('month'), day: get('day') };
}