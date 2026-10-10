// backend/src/controllers/calendarController.ts
//
// LeadMind AI — Calendar Controller (Day 22, Session 1)
// Related UC: UC-06 (Configure Meeting Scheduling)
//
// getGoogleAuthUrl  — GET /api/calendar/auth      (Bearer-protected)
// handleGoogleCallback — GET /api/calendar/callback (UNPROTECTED — see
//                         googleCalendarService.ts's header comment for why)
// getCalendarStatus — GET /api/calendar/status    (Bearer-protected)

import { Request, Response } from 'express';
const Admin = require('../models/Admin');
const MeetingSlot = require('../models/MeetingSlot');
const Meeting = require('../models/Meeting');
import {
  buildGoogleAuthUrl,
  verifyOAuthState,
  exchangeCodeForTokens,
  fetchGoogleUserEmail,
  queryFreeBusy,
} from '../services/googleCalendarService';
import { getValidAccessToken, CalendarNotConnectedError, CalendarReconnectRequiredError } from '../services/calendarTokenService';
import { computeAvailableSlots, BusyPeriod } from '../services/slotComputationService';
import { encrypt } from '../utils/encryption';
import { logError } from '../utils/errorLog';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
// Fallback only — as of Day 24 Session 2, the real redirect target is
// whatever `returnTo` the initiating page sent to GET /api/calendar/auth
// (see googleCalendarService.ts). This constant is just what's used when
// no returnTo is present at all (e.g. state token predates this change).
const SETTINGS_REDIRECT_PATH = '/dashboard/settings';

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/calendar/auth
//  Accepts an optional ?returnTo= query param — the Settings page (Day 26)
//  and Scheduling Settings page (Day 24, Session 2) both have their own
//  Google Calendar connect card and pass their own path here, so the
//  admin lands back on whichever page they actually clicked "Connect" from.
// ─────────────────────────────────────────────────────────────────────────────

export const getGoogleAuthUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : undefined;
    const url = buildGoogleAuthUrl(req.admin!.adminId, returnTo);
    res.status(200).json({ success: true, data: { url } });
  } catch (err: any) {
    await logError('calendar.getGoogleAuthUrl', err, { adminId: req.admin?.adminId });
    res.status(500).json({ success: false, message: 'Failed to start Google Calendar connection.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/calendar/slots
//  Related UC: UC-13 step 4 — "System identifies available times using
//  admin input availability + Google Calendar availability."
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_RANGE_DAYS = 7;

export const getAvailableSlots = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminId = req.admin!.adminId;
    const { startDate, endDate } = req.query as Record<string, string | undefined>;

    const rangeStart = startDate && !isNaN(Date.parse(startDate)) ? new Date(startDate) : new Date();
    const rangeEnd =
      endDate && !isNaN(Date.parse(endDate))
        ? new Date(endDate)
        : new Date(rangeStart.getTime() + DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);

    if (rangeEnd.getTime() <= rangeStart.getTime()) {
      res.status(400).json({ success: false, message: 'endDate must be after startDate.' });
      return;
    }

    // Lazily create the admin's MeetingSlot rules on first access, using
    // the schema's own sensible defaults (Mon-Fri 9-17, 30min, etc.) —
    // avoids requiring a separate "initialize my scheduling settings"
    // step before this endpoint works. Day 24 builds the UI to edit these.
    const meetingSlot = await MeetingSlot.findOneAndUpdate(
      { admin: adminId },
      {},
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Get a valid (auto-refreshed if needed, per Day 22 Session 2) access
    // token — surfaces a clear "not connected" / "please reconnect" error
    // rather than a confusing downstream Google API failure.
    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(adminId);
    } catch (err: any) {
      if (err instanceof CalendarNotConnectedError || err instanceof CalendarReconnectRequiredError) {
        res.status(409).json({ success: false, message: err.message, code: err.name });
        return;
      }
      throw err;
    }

    // Busy periods from TWO sources: Google Calendar's real freeBusy data,
    // AND this app's own Meeting bookings (belt-and-suspenders — a Meeting
    // we just booked should already be reflected in Google's freeBusy
    // response too, but checking both catches any sync lag / edge case).
    const [googleBusy, existingMeetings] = await Promise.all([
      queryFreeBusy(accessToken, rangeStart, rangeEnd),
      Meeting.find({
        status: 'Scheduled',
        scheduledAt: { $gte: rangeStart, $lt: rangeEnd },
      }),
    ]);

    const busyPeriods: BusyPeriod[] = [
      ...googleBusy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) })),
      ...existingMeetings.map((m: any) => ({
        start: m.scheduledAt,
        end: new Date(m.scheduledAt.getTime() + m.durationMinutes * 60 * 1000),
      })),
    ];

    const slots = computeAvailableSlots({
      availabilityWindows: meetingSlot.availabilityWindows,
      durationMinutes: meetingSlot.defaultMeetingDurationMinutes,
      bufferMinutes: meetingSlot.bufferMinutes,
      minimumNoticeHours: meetingSlot.minimumNoticeHours,
      maximumAdvanceDays: meetingSlot.maximumAdvanceDays,
      timezone: meetingSlot.timezone,
      rangeStart,
      rangeEnd,
      busyPeriods,
    });

    res.status(200).json({
      success: true,
      data: {
        slots: slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() })),
        meetingDurationMinutes: meetingSlot.defaultMeetingDurationMinutes,
        timezone: meetingSlot.timezone,
      },
    });
  } catch (err: any) {
    await logError('calendar.getAvailableSlots', err, { adminId: req.admin?.adminId });
    res.status(500).json({ success: false, message: 'Failed to compute available slots.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/calendar/callback
//
//  UC-06 A1 — "Google Authorization Failure: System displays error message.
//  Admin is prompted to reconnect Google account." Every failure path here
//  redirects back to the settings page with an error indicator instead of
//  returning raw JSON — the browser is mid-navigation from Google at this
//  point, there's no frontend fetch() call waiting for a JSON response.
// ─────────────────────────────────────────────────────────────────────────────

export const handleGoogleCallback = async (req: Request, res: Response): Promise<void> => {
  const { code, state, error: googleError } = req.query as Record<string, string | undefined>;

  // Recover returnTo from state up front — Google echoes `state` back
  // verbatim even on cancel, so every redirect below (including the
  // cancel/missing-params paths, which never reach the try block further
  // down) can still send the admin back to whichever page — Settings or
  // Scheduling — they actually clicked "Connect" from. Falls back to the
  // default if state is absent/invalid here; the dedicated invalid-state
  // branch below still separately handles a genuinely bad state value for
  // the real code-exchange path.
  let returnTo = SETTINGS_REDIRECT_PATH;
  if (state) {
    try {
      returnTo = verifyOAuthState(state).returnTo;
    } catch {
      // leave the default — nothing else to do with an unparsable state
      // this early; the branches below don't depend on adminId yet.
    }
  }

  if (googleError) {
    // Admin clicked "Cancel" on Google's consent screen.
    res.redirect(`${FRONTEND_URL}${returnTo}?calendar=denied`);
    return;
  }

  if (!code || !state) {
    await logError('calendar.callback', new Error('Missing code or state in Google callback'), {
      hasCode: !!code,
      hasState: !!state,
    });
    res.redirect(`${FRONTEND_URL}${returnTo}?calendar=error`);
    return;
  }

  let adminId: string;
  try {
    ({ adminId, returnTo } = verifyOAuthState(state));
  } catch (err: any) {
    // Expired (>10 min since /auth was called) or tampered state — treat
    // identically to any other auth failure, per UC-06 A1.
    await logError('calendar.callback.invalidState', err, {});
    res.redirect(`${FRONTEND_URL}${returnTo}?calendar=error`);
    return;
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const email = await fetchGoogleUserEmail(tokens.access_token);

    const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000);

    const admin = await Admin.findById(adminId).select('+googleCalendar.refreshToken');
    if (!admin) {
      throw new Error(`Admin ${adminId} not found during calendar callback`);
    }

    admin.googleCalendar.isConnected = true;
    admin.googleCalendar.accessToken = encrypt(tokens.access_token);
    // Google only returns a refresh_token on the FIRST consent (or when
    // prompt=consent forces re-issuance, which buildGoogleAuthUrl always
    // sets) — but guard anyway rather than overwrite a good refresh token
    // with nothing on some edge case where Google omits it.
    if (tokens.refresh_token) {
      admin.googleCalendar.refreshToken = encrypt(tokens.refresh_token);
    }
    admin.googleCalendar.tokenExpiry = tokenExpiry;
    admin.googleCalendar.calendarEmail = email;
    await admin.save();

    res.redirect(`${FRONTEND_URL}${returnTo}?calendar=connected`);
  } catch (err: any) {
    await logError('calendar.callback.tokenExchange', err, { adminId });
    res.redirect(`${FRONTEND_URL}${returnTo}?calendar=error`);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/calendar/status
//  Never returns raw tokens — accessToken/refreshToken stay `select: false`
//  at the schema level (Admin.js) and this handler doesn't opt back into
//  selecting them, so there's no path for them to leak into this response.
// ─────────────────────────────────────────────────────────────────────────────

export const getCalendarStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const admin = await Admin.findById(req.admin!.adminId);
    if (!admin) {
      res.status(404).json({ success: false, message: 'Admin not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        isConnected: admin.googleCalendar.isConnected,
        calendarEmail: admin.googleCalendar.calendarEmail,
        tokenExpiry: admin.googleCalendar.tokenExpiry,
      },
    });
  } catch (err: any) {
    await logError('calendar.getCalendarStatus', err, { adminId: req.admin?.adminId });
    res.status(500).json({ success: false, message: 'Failed to fetch calendar status.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/calendar/settings  (Day 24, Session 1)
//  Related UC: UC-06 main flow — the raw MeetingSlot rules, for the
//  Scheduling Settings page (Day 24, Session 2) to display and edit.
//  Distinct from GET /api/calendar/slots (Day 23), which returns COMPUTED
//  bookable time slots, not the underlying rules that produced them.
// ─────────────────────────────────────────────────────────────────────────────

export const getMeetingSlotSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminId = req.admin!.adminId;

    // Same lazy-creation pattern as Day 23 — a fresh admin gets sensible
    // schema defaults on first access rather than a 404 before they've
    // ever saved anything.
    const meetingSlot = await MeetingSlot.findOneAndUpdate(
      { admin: adminId },
      {},
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({
      success: true,
      data: {
        availabilityWindows: meetingSlot.availabilityWindows,
        defaultMeetingDurationMinutes: meetingSlot.defaultMeetingDurationMinutes,
        bufferMinutes: meetingSlot.bufferMinutes,
        minimumNoticeHours: meetingSlot.minimumNoticeHours,
        maximumAdvanceDays: meetingSlot.maximumAdvanceDays,
        timezone: meetingSlot.timezone,
        preferences: meetingSlot.preferences,
      },
    });
  } catch (err: any) {
    await logError('calendar.getMeetingSlotSettings', err, { adminId: req.admin?.adminId });
    res.status(500).json({ success: false, message: 'Failed to fetch scheduling settings.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  PUT /api/calendar/settings  (Day 24, Session 1)
//  Related UC: UC-06 main flow steps 3-7 — "Admin sets meeting duration...
//  sets days and times available... clicks Save... System checks rules...
//  System saves availability rules to Database."
//
//  Validation itself lives in validateMeetingSlot.ts (runs before this
//  handler via the route's middleware chain) — by the time this function
//  runs, every field present in the body is already known to be
//  individually valid. This handler's only remaining job is the actual
//  partial update.
// ─────────────────────────────────────────────────────────────────────────────

const UPDATABLE_FIELDS = [
  'availabilityWindows',
  'defaultMeetingDurationMinutes',
  'bufferMinutes',
  'minimumNoticeHours',
  'maximumAdvanceDays',
  'timezone',
] as const;

export const updateMeetingSlotSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminId = req.admin!.adminId;

    const update: Record<string, any> = {};
    for (const field of UPDATABLE_FIELDS) {
      if (req.body[field] !== undefined) update[field] = req.body[field];
    }
    if (req.body.preferences !== undefined) {
      // Merge, don't replace — a partial preferences update (e.g. just
      // toggling one switch) shouldn't reset every other preference back
      // to its schema default.
      for (const [key, value] of Object.entries(req.body.preferences)) {
        update[`preferences.${key}`] = value;
      }
    }

    if (Object.keys(update).length === 0) {
      res.status(400).json({ success: false, message: 'No valid fields provided to update.' });
      return;
    }

    const meetingSlot = await MeetingSlot.findOneAndUpdate(
      { admin: adminId },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true, context: 'query' }
    );

    res.status(200).json({
      success: true,
      data: {
        availabilityWindows: meetingSlot.availabilityWindows,
        defaultMeetingDurationMinutes: meetingSlot.defaultMeetingDurationMinutes,
        bufferMinutes: meetingSlot.bufferMinutes,
        minimumNoticeHours: meetingSlot.minimumNoticeHours,
        maximumAdvanceDays: meetingSlot.maximumAdvanceDays,
        timezone: meetingSlot.timezone,
        preferences: meetingSlot.preferences,
      },
    });
  } catch (err: any) {
    // Note: findOneAndUpdate does NOT trigger the schema's pre('save')
    // hook (that only fires on .save()) — so the DB-level "window end must
    // be after start" check is never actually consulted here. runValidators
    // above only re-runs SCHEMA-level validators (type/enum/required/regex
    // match), not that custom hook. validateMeetingSlot.ts's middleware is
    // therefore the SOLE enforcement of that business rule for this
    // endpoint, not a defense-in-depth backup — worth remembering if this
    // logic ever moves elsewhere. A ValidationError caught here means a
    // schema-level constraint (not the start<end rule) was violated.
    if (err.name === 'ValidationError') {
      res.status(422).json({ success: false, message: err.message });
      return;
    }
    await logError('calendar.updateMeetingSlotSettings', err, { adminId: req.admin?.adminId });
    res.status(500).json({ success: false, message: 'Failed to update scheduling settings.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE /api/calendar/disconnect  (Day 26, Session 1)
//  Related UC: UC-06 — lets the admin revoke this app's access to their
//  Google Calendar from the Settings page. Requires an explicit
//  `{ confirm: true }` body — a destructive action reachable from a single
//  Settings-page button shouldn't fire on a stray/duplicate request; the
//  frontend's confirmation modal (Day 26, Session 3) is expected to be
//  what actually sets this, not just gate the click on its own.
//
//  Clears the stored tokens rather than merely flipping isConnected, so a
//  stale encrypted token can never accidentally get reused if isConnected
//  were ever set back to true by some other path.
// ─────────────────────────────────────────────────────────────────────────────

export const disconnectCalendar = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.body?.confirm !== true) {
      res.status(400).json({
        success: false,
        message: 'Disconnect requires confirmation — send { "confirm": true }.',
      });
      return;
    }

    // Select the token fields (select: false by default, per Admin.js) —
    // matches handleGoogleCallback's pattern above, even though we're only
    // overwriting them here, not reading their values.
    const admin = await Admin.findById(req.admin!.adminId).select('+googleCalendar.refreshToken');
    if (!admin) {
      res.status(404).json({ success: false, message: 'Admin not found.' });
      return;
    }

    admin.googleCalendar.isConnected = false;
    admin.googleCalendar.accessToken = null;
    admin.googleCalendar.refreshToken = null;
    admin.googleCalendar.tokenExpiry = null;
    admin.googleCalendar.calendarEmail = null;
    await admin.save();

    res.status(200).json({ success: true, message: 'Google Calendar disconnected.' });
  } catch (err: any) {
    await logError('calendar.disconnectCalendar', err, { adminId: req.admin?.adminId });
    res.status(500).json({ success: false, message: 'Failed to disconnect Google Calendar.' });
  }
};