import { Request, Response, NextFunction } from 'express';
const { DAYS_OF_WEEK } = require('../models/MeetingSlot');

// ─────────────────────────────────────────────────────────────────────────────
//  LeadMind AI — MeetingSlot (Scheduling Settings) Validation Middleware
//  Day 24, Session 1
//
//  Runs BEFORE updateMeetingSlotSettings. Mirrors validateCampaign.ts's
//  conventions exactly: 422 Unprocessable Entity with a field-level errors
//  array so the frontend (Day 24, Session 2) can highlight exactly which
//  field failed, matching UC-06 A2 ("Conflicting or Overlapping Rules:
//  System blocks save action. Validation message prompts correction.").
//
//  This is an UPDATE-only endpoint (PUT, partial updates allowed) — every
//  field below is optional, but if present, must be valid. Nothing here
//  requires ALL fields to be sent every time.
// ─────────────────────────────────────────────────────────────────────────────

const TIME_FORMAT = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const validateMeetingSlotUpdate = (req: Request, res: Response, next: NextFunction): void => {
  const errors: { field: string; message: string }[] = [];
  const {
    availabilityWindows,
    defaultMeetingDurationMinutes,
    bufferMinutes,
    minimumNoticeHours,
    maximumAdvanceDays,
    timezone,
    preferences,
  } = req.body;

  // ── availabilityWindows ─────────────────────────────────────────────────
  if (availabilityWindows !== undefined) {
    if (!Array.isArray(availabilityWindows)) {
      errors.push({ field: 'availabilityWindows', message: 'Must be an array.' });
    } else {
      availabilityWindows.forEach((window: any, i: number) => {
        const prefix = `availabilityWindows[${i}]`;

        if (!window.day || !DAYS_OF_WEEK.includes(window.day)) {
          errors.push({ field: `${prefix}.day`, message: `Day must be one of: ${DAYS_OF_WEEK.join(', ')}.` });
        }
        if (!window.startTime || !TIME_FORMAT.test(window.startTime)) {
          errors.push({ field: `${prefix}.startTime`, message: 'Start time must be in HH:MM format.' });
        }
        if (!window.endTime || !TIME_FORMAT.test(window.endTime)) {
          errors.push({ field: `${prefix}.endTime`, message: 'End time must be in HH:MM format.' });
        }
        // Only compare start/end if both are individually well-formed —
        // otherwise this comparison itself would be meaningless.
        if (window.startTime && window.endTime && TIME_FORMAT.test(window.startTime) && TIME_FORMAT.test(window.endTime)) {
          if (window.startTime >= window.endTime) {
            errors.push({
              field: `${prefix}.endTime`,
              message: `End time (${window.endTime}) must be after start time (${window.startTime}).`,
            });
          }
        }
        if (window.isActive !== undefined && typeof window.isActive !== 'boolean') {
          errors.push({ field: `${prefix}.isActive`, message: 'isActive must be true or false.' });
        }
      });

      // UC-06 A2 — "Conflicting or Overlapping Rules": two active windows
      // for the SAME day that overlap each other.
      const byDay = new Map<string, any[]>();
      for (const w of availabilityWindows) {
        if (!w.day || w.isActive === false) continue;
        if (!byDay.has(w.day)) byDay.set(w.day, []);
        byDay.get(w.day)!.push(w);
      }
      for (const [day, windows] of byDay) {
        const sorted = [...windows].sort((a, b) => (a.startTime > b.startTime ? 1 : -1));
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i].startTime < sorted[i - 1].endTime) {
            errors.push({
              field: 'availabilityWindows',
              message: `${day} has overlapping availability windows (${sorted[i - 1].startTime}-${sorted[i - 1].endTime} and ${sorted[i].startTime}-${sorted[i].endTime}).`,
            });
          }
        }
      }
    }
  }

  // ── defaultMeetingDurationMinutes ───────────────────────────────────────
  if (defaultMeetingDurationMinutes !== undefined) {
    if (typeof defaultMeetingDurationMinutes !== 'number' || defaultMeetingDurationMinutes < 5 || defaultMeetingDurationMinutes > 480) {
      errors.push({ field: 'defaultMeetingDurationMinutes', message: 'Meeting duration must be between 5 and 480 minutes.' });
    }
  }

  // ── bufferMinutes ────────────────────────────────────────────────────────
  if (bufferMinutes !== undefined) {
    if (typeof bufferMinutes !== 'number' || bufferMinutes < 0 || bufferMinutes > 120) {
      errors.push({ field: 'bufferMinutes', message: 'Buffer must be between 0 and 120 minutes.' });
    }
  }

  // ── minimumNoticeHours ───────────────────────────────────────────────────
  if (minimumNoticeHours !== undefined) {
    if (typeof minimumNoticeHours !== 'number' || minimumNoticeHours < 0 || minimumNoticeHours > 720) {
      errors.push({ field: 'minimumNoticeHours', message: 'Minimum notice must be between 0 and 720 hours (30 days).' });
    }
  }

  // ── maximumAdvanceDays ───────────────────────────────────────────────────
  if (maximumAdvanceDays !== undefined) {
    if (typeof maximumAdvanceDays !== 'number' || maximumAdvanceDays < 1 || maximumAdvanceDays > 365) {
      errors.push({ field: 'maximumAdvanceDays', message: 'Maximum advance booking must be between 1 and 365 days.' });
    }
  }

  // Cross-field: notice window can't exceed the advance window entirely —
  // would leave zero bookable time.
  if (
    typeof minimumNoticeHours === 'number' &&
    typeof maximumAdvanceDays === 'number' &&
    minimumNoticeHours >= maximumAdvanceDays * 24
  ) {
    errors.push({
      field: 'minimumNoticeHours',
      message: 'Minimum notice must be less than the maximum advance booking window, or no time would ever be bookable.',
    });
  }

  // ── timezone ─────────────────────────────────────────────────────────────
  if (timezone !== undefined) {
    if (typeof timezone !== 'string' || !isValidTimezone(timezone)) {
      errors.push({ field: 'timezone', message: 'Must be a valid IANA timezone (e.g. "Asia/Karachi").' });
    }
  }

  // ── preferences ──────────────────────────────────────────────────────────
  if (preferences !== undefined) {
    const allowedKeys = ['autoConfirm', 'sendConfirmationEmail', 'sendSmsReminder', 'allowReschedule', 'allowCancel', 'oneMeetingPerLead'];
    if (typeof preferences !== 'object' || preferences === null || Array.isArray(preferences)) {
      errors.push({ field: 'preferences', message: 'Must be an object.' });
    } else {
      for (const [key, value] of Object.entries(preferences)) {
        if (!allowedKeys.includes(key)) {
          errors.push({ field: `preferences.${key}`, message: `Unknown preference "${key}".` });
        } else if (typeof value !== 'boolean') {
          errors.push({ field: `preferences.${key}`, message: 'Must be true or false.' });
        }
      }
    }
  }

  if (errors.length > 0) {
    res.status(422).json({ success: false, message: 'Validation failed.', errors });
    return;
  }

  next();
};