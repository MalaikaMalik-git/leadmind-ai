import { Router } from 'express';
import { protect } from '../middleware/auth';
import { validateMeetingSlotUpdate } from '../middleware/validateMeetingSlot';
import {
  getGoogleAuthUrl,
  handleGoogleCallback,
  getCalendarStatus,
  getAvailableSlots,
  getMeetingSlotSettings,
  updateMeetingSlotSettings,
  disconnectCalendar,
} from '../controllers/calendarController';

// ─────────────────────────────────────────────
//  LeadMind AI — Calendar Routes (Day 22, Session 1; extended Day 23 & 24, Session 1)
//  Base: /api/calendar
//  Related UC: UC-06 — Configure Meeting Scheduling, UC-13 — Schedule Meeting
// ─────────────────────────────────────────────

const router = Router();

// GET /api/calendar/auth — Bearer-protected, returns the Google consent URL
router.get('/auth', protect, getGoogleAuthUrl);

// GET /api/calendar/callback — deliberately NOT protected. Google calls
// this directly after consent; it can't carry our Bearer token. Security
// here comes from the signed `state` param instead — see
// googleCalendarService.ts's header comment for the full reasoning.
router.get('/callback', handleGoogleCallback);

// GET /api/calendar/status — Bearer-protected
router.get('/status', protect, getCalendarStatus);

// GET /api/calendar/slots — Bearer-protected (Day 23, Session 1)
router.get('/slots', protect, getAvailableSlots);

// GET/PUT /api/calendar/settings — Bearer-protected (Day 24, Session 1)
router.get('/settings', protect, getMeetingSlotSettings);
router.put('/settings', protect, validateMeetingSlotUpdate, updateMeetingSlotSettings);

// DELETE /api/calendar/disconnect — Bearer-protected (Day 26, Session 1)
router.delete('/disconnect', protect, disconnectCalendar);

export default router;