// backend/src/services/slotComputationService.ts
//
// LeadMind AI — Slot computation algorithm (Day 23, Session 1)
// Related UC: UC-06 / UC-13 — "Calculate the number of available time
// slots in the admin's calendar based on their working hours and meeting
// duration."
//
// Deliberately a PURE function — no DB reads, no Google API calls inside
// it. The controller gathers everything (MeetingSlot rules, existing
// Meeting bookings, Google Calendar busy periods) and hands it all in;
// this function just does the math. That split makes the actual
// scheduling logic fully testable without a database or network access,
// which matters a lot here since date/timezone math is exactly the kind
// of code that hides subtle bugs.

import { zonedTimeToUtc, getDayOfWeekInZone, getDatePartsInZone } from '../utils/timezone';

export interface AvailabilityWindow {
  day: string; // 'Monday', 'Tuesday', ...
  startTime: string; // 'HH:MM', 24h
  endTime: string; // 'HH:MM', 24h
  isActive: boolean;
}

export interface BusyPeriod {
  start: Date;
  end: Date;
}

export interface SlotComputationParams {
  availabilityWindows: AvailabilityWindow[];
  durationMinutes: number;
  bufferMinutes: number;
  minimumNoticeHours: number;
  maximumAdvanceDays: number;
  timezone: string;
  rangeStart: Date;
  rangeEnd: Date;
  busyPeriods: BusyPeriod[];
  /** Injectable for testing — defaults to the real current time. */
  now?: Date;
}

export interface AvailableSlot {
  start: Date;
  end: Date;
}

// Hard safety cap on how many calendar days this will ever iterate, so a
// pathological input (e.g. a huge rangeEnd) can't spin forever. 400 covers
// the max allowed maximumAdvanceDays (365) with headroom.
const MAX_DAY_ITERATIONS = 400;

export function computeAvailableSlots(params: SlotComputationParams): AvailableSlot[] {
  const {
    availabilityWindows,
    durationMinutes,
    bufferMinutes,
    minimumNoticeHours,
    maximumAdvanceDays,
    timezone,
    rangeStart,
    rangeEnd,
    busyPeriods,
  } = params;
  const now = params.now ?? new Date();

  const earliestAllowed = new Date(now.getTime() + minimumNoticeHours * 60 * 60 * 1000);
  const latestAllowed = new Date(now.getTime() + maximumAdvanceDays * 24 * 60 * 60 * 1000);

  const effectiveStart = new Date(Math.max(rangeStart.getTime(), now.getTime()));
  const effectiveEnd = new Date(Math.min(rangeEnd.getTime(), latestAllowed.getTime()));

  if (effectiveStart.getTime() >= effectiveEnd.getTime()) return [];

  // Pad every busy period by bufferMinutes on both sides — a slot must
  // not START within bufferMinutes of a busy period ending, and must not
  // END within bufferMinutes of a busy period starting.
  const paddedBusy = busyPeriods.map((b) => ({
    start: new Date(b.start.getTime() - bufferMinutes * 60 * 1000),
    end: new Date(b.end.getTime() + bufferMinutes * 60 * 1000),
  }));

  const activeWindowsByDay = new Map<string, AvailabilityWindow[]>();
  for (const w of availabilityWindows) {
    if (!w.isActive) continue;
    if (!activeWindowsByDay.has(w.day)) activeWindowsByDay.set(w.day, []);
    activeWindowsByDay.get(w.day)!.push(w);
  }

  const slots: AvailableSlot[] = [];

  // Iterate CALENDAR DAYS in the admin's own timezone (not UTC days —
  // those don't line up with the admin's local "Monday", "Tuesday" etc.).
  const startParts = getDatePartsInZone(effectiveStart, timezone);
  const endParts = getDatePartsInZone(effectiveEnd, timezone);

  let dayCursorUtc = Date.UTC(startParts.year, startParts.month - 1, startParts.day);
  const endDayCursorUtc = Date.UTC(endParts.year, endParts.month - 1, endParts.day);

  let iterations = 0;
  while (dayCursorUtc <= endDayCursorUtc && iterations < MAX_DAY_ITERATIONS) {
    iterations++;

    const cursorAsDate = new Date(dayCursorUtc);
    const y = cursorAsDate.getUTCFullYear();
    const m = cursorAsDate.getUTCMonth() + 1;
    const d = cursorAsDate.getUTCDate();

    // Determine which weekday this calendar date actually is IN THE
    // ADMIN'S TIMEZONE — using a noon instant avoids any ambiguity right
    // at a midnight boundary.
    const noonInstant = zonedTimeToUtc(y, m, d, 12, 0, timezone);
    const weekday = getDayOfWeekInZone(noonInstant, timezone);

    const windowsForDay = activeWindowsByDay.get(weekday) || [];

    for (const window of windowsForDay) {
      const [startH, startM] = window.startTime.split(':').map(Number);
      const [endH, endM] = window.endTime.split(':').map(Number);

      const windowStartUtc = zonedTimeToUtc(y, m, d, startH, startM, timezone);
      const windowEndUtc = zonedTimeToUtc(y, m, d, endH, endM, timezone);

      let slotStartMs = windowStartUtc.getTime();
      const durationMs = durationMinutes * 60 * 1000;

      while (slotStartMs + durationMs <= windowEndUtc.getTime()) {
        const slotStart = new Date(slotStartMs);
        const slotEnd = new Date(slotStartMs + durationMs);

        const withinRequestedRange =
          slotStart.getTime() >= effectiveStart.getTime() && slotEnd.getTime() <= effectiveEnd.getTime();
        const meetsMinimumNotice = slotStart.getTime() >= earliestAllowed.getTime();
        const overlapsBusyPeriod = paddedBusy.some(
          (b) => slotStart.getTime() < b.end.getTime() && slotEnd.getTime() > b.start.getTime()
        );

        if (withinRequestedRange && meetsMinimumNotice && !overlapsBusyPeriod) {
          slots.push({ start: slotStart, end: slotEnd });
        }

        slotStartMs += durationMs;
      }
    }

    dayCursorUtc += 24 * 60 * 60 * 1000;
  }

  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}