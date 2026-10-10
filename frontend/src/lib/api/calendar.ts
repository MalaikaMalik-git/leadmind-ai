// ─────────────────────────────────────────────
//  LeadMind AI — Calendar API
//  Matches ACTUAL backend response shapes (calendarController.ts):
//    GET    /api/calendar/auth       → { success, data: { url } }
//    GET    /api/calendar/callback   → (browser redirect, not called from here)
//    GET    /api/calendar/status     → { success, data: CalendarStatus }
//    GET    /api/calendar/slots      → { success, data: AvailableSlotsResult }
//    GET    /api/calendar/settings   → { success, data: SchedulingSettings }   (Day 24, S1)
//    PUT    /api/calendar/settings   → { success, data: SchedulingSettings }   (Day 24, S1)
//    DELETE /api/calendar/disconnect → { success, message }                    (Day 26, S1)
//
//  NOTE: this file was previously empty (0 bytes) despite the Settings page
//  (Day 26, S3) and Scheduling page (Day 24, S2) both importing named
//  exports from it — that import would have failed to compile. Rebuilt
//  here from the actual controller/route code, not guessed.
// ─────────────────────────────────────────────

import apiClient from './client';
import type { CalendarStatus } from '@/src/types/auth';
import type { SchedulingSettings, UpdateSchedulingSettingsRequest } from '@/src/types/scheduling';

// ── GET /api/calendar/auth ────────────────────
// `returnTo` is the frontend path the admin should land back on after
// Google's consent screen (e.g. '/dashboard/scheduling'). Backend
// whitelists it (googleCalendarService.ts) — anything not recognized
// silently falls back to '/dashboard/settings', so passing nothing here
// is always safe.

export async function getGoogleAuthUrl(returnTo?: string): Promise<string> {
  const response = await apiClient.get<{ success: true; data: { url: string } }>(
    '/api/calendar/auth',
    returnTo ? { params: { returnTo } } : undefined,
  );
  return response.data.data.url;
}

// ── GET /api/calendar/status ──────────────────

export async function getCalendarStatus(): Promise<CalendarStatus> {
  const response = await apiClient.get<{ success: true; data: CalendarStatus }>('/api/calendar/status');
  return response.data.data;
}

// ── DELETE /api/calendar/disconnect ───────────
// Backend requires an explicit { confirm: true } body — see
// disconnectCalendar (calendarController.ts). The frontend's own
// confirmation modal is what should gate calling this at all.

export async function disconnectCalendar(): Promise<void> {
  await apiClient.delete('/api/calendar/disconnect', { data: { confirm: true } });
}

// ── GET/PUT /api/calendar/settings (Day 24, Session 1) ────────────────────
// The raw MeetingSlot availability rules — what the Scheduling Settings
// page (Day 24, Session 2) displays and edits. Distinct from
// getAvailableSlots() below, which returns already-COMPUTED bookable
// slots, not the underlying rules that produced them.

export async function getSchedulingSettings(): Promise<SchedulingSettings> {
  const response = await apiClient.get<{ success: true; data: SchedulingSettings }>('/api/calendar/settings');
  return response.data.data;
}

export async function updateSchedulingSettings(
  data: UpdateSchedulingSettingsRequest,
): Promise<SchedulingSettings> {
  const response = await apiClient.put<{ success: true; data: SchedulingSettings }>(
    '/api/calendar/settings',
    data,
  );
  return response.data.data;
}

// ── GET /api/calendar/slots (Day 23, Session 1) ───────────────────────────
// Not used by the Scheduling Settings page itself, but part of the same
// controller/route family — included here so no other page has to touch
// this file again to reach it.

export interface AvailableSlot {
  start: string; // ISO 8601
  end: string;   // ISO 8601
}

export interface AvailableSlotsResult {
  slots: AvailableSlot[];
  meetingDurationMinutes: number;
  timezone: string;
}

export async function getAvailableSlots(startDate?: string, endDate?: string): Promise<AvailableSlotsResult> {
  const response = await apiClient.get<{ success: true; data: AvailableSlotsResult }>('/api/calendar/slots', {
    params: { startDate, endDate },
  });
  return response.data.data;
}