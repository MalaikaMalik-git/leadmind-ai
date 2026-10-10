// ─────────────────────────────────────────────
//  LeadMind AI — Scheduling Settings Types
//  Day 24, Session 2
//  Matches MeetingSlot.js + calendarController.ts (Day 24, Session 1):
//    GET/PUT /api/calendar/settings → { success, data: SchedulingSettings }
// ─────────────────────────────────────────────

export const DAYS_OF_WEEK = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

// Mirrors MeetingSlot.js's MEETING_DURATIONS enum exactly — the backend
// schema-level validator only accepts these values, so the UI offers
// nothing else rather than letting an admin pick a value that will
// round-trip into a confusing "ValidationError" after save.
export const MEETING_DURATIONS = [15, 30, 45, 60, 90] as const;
export type MeetingDuration = (typeof MEETING_DURATIONS)[number];

export interface AvailabilityWindow {
  day: DayOfWeek;
  startTime: string; // "HH:MM", 24-hour
  endTime: string;   // "HH:MM", 24-hour
  isActive: boolean;
}

export interface SchedulingPreferences {
  autoConfirm: boolean;
  sendConfirmationEmail: boolean;
  sendSmsReminder: boolean;
  allowReschedule: boolean;
  allowCancel: boolean;
  oneMeetingPerLead: boolean;
}

export interface SchedulingSettings {
  availabilityWindows: AvailabilityWindow[];
  defaultMeetingDurationMinutes: number;
  bufferMinutes: number;
  minimumNoticeHours: number;
  maximumAdvanceDays: number;
  timezone: string;
  preferences: SchedulingPreferences;
}

// PUT body — every field optional (partial update), matches
// validateMeetingSlot.ts / updateMeetingSlotSettings exactly.
export interface UpdateSchedulingSettingsRequest {
  availabilityWindows?: AvailabilityWindow[];
  defaultMeetingDurationMinutes?: number;
  bufferMinutes?: number;
  minimumNoticeHours?: number;
  maximumAdvanceDays?: number;
  timezone?: string;
  preferences?: Partial<SchedulingPreferences>;
}