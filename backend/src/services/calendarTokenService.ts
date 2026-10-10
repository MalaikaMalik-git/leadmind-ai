// backend/src/services/calendarTokenService.ts
//
// LeadMind AI - Calendar token lifecycle management (Day 22, Session 2)
// Related plan item: "Token refresh logic for long-running sessions."
//
// Google Calendar access tokens expire after about an hour. This backend
// runs continuously, and Day 23's meeting-booking code will need to call
// the Calendar API at arbitrary times, long after the original OAuth
// consent. getValidAccessToken() is the single function that code should
// ever call to get a token: it transparently refreshes when needed and
// keeps the DB in sync, so callers never have to think about expiry
// themselves.
//
// Kept separate from googleCalendarService.ts (Session 1) deliberately -
// that file is pure HTTP calls to Google with no DB/encryption
// involvement, testable in isolation. This file is the "business logic"
// layer wrapping it (token storage, refresh decisions, reconnect
// handling), mirroring the existing split between aiScoringService.ts
// (pure AI HTTP calls) and qualificationService.ts (persistence + business
// logic) from Day 16.

const Admin = require('../models/Admin');
import { refreshAccessToken } from './googleCalendarService';
import { encrypt, decrypt } from '../utils/encryption';
import { logError } from '../utils/errorLog';

// Refresh proactively if less than this much validity remains - avoids a
// token expiring mid-request (e.g. between reading it here and Google
// receiving the actual Calendar API call a moment later).
const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

export class CalendarNotConnectedError extends Error {
  constructor(message = 'Google Calendar is not connected for this admin.') {
    super(message);
    this.name = 'CalendarNotConnectedError';
  }
}

// UC-06 A1 - "Google Authorization Failure... Admin is prompted to
// reconnect Google account." Thrown whenever the stored refresh token
// turns out to be unusable (missing, corrupted, or rejected by Google -
// e.g. the admin revoked access from their Google account settings, or it
// expired from long disuse). isConnected is set to false as a side effect
// before this is thrown, so getCalendarStatus() immediately reflects the
// need to reconnect.

export class CalendarReconnectRequiredError extends Error {
  constructor(message = 'Google Calendar access was lost - please reconnect.') {
    super(message);
    this.name = 'CalendarReconnectRequiredError';
  }
}

export async function getValidAccessToken(adminId: string): Promise<string> {
  const admin = await Admin.findById(adminId).select('+googleCalendar.accessToken +googleCalendar.refreshToken');
  if (!admin) {
    throw new Error(`Admin ${adminId} not found`);
  }

  if (!admin.googleCalendar.isConnected) {
    throw new CalendarNotConnectedError();
  }

  const expiryMs = admin.googleCalendar.tokenExpiry ? new Date(admin.googleCalendar.tokenExpiry).getTime() : 0;
  const hasEnoughValidityLeft = expiryMs - Date.now() > REFRESH_BUFFER_MS;

  if (hasEnoughValidityLeft) {
    const accessToken = decrypt(admin.googleCalendar.accessToken);
    if (!accessToken) {
      // Shouldn't happen if isConnected is true, but a corrupted/missing
      // stored value is still safer to treat as "needs reconnect" than to
      // return null/undefined to a caller expecting a usable token string.
      throw new CalendarReconnectRequiredError('Stored access token is missing or unreadable.');
    }
    return accessToken;
  }

  // Expired, or expiring within the buffer window - refresh now.
  const refreshToken = decrypt(admin.googleCalendar.refreshToken);
  if (!refreshToken) {
    admin.googleCalendar.isConnected = false;
    await admin.save();
    throw new CalendarReconnectRequiredError('No refresh token on file - please reconnect Google Calendar.');
  }

  try {
    const refreshed = await refreshAccessToken(refreshToken);

    admin.googleCalendar.accessToken = encrypt(refreshed.access_token);
    admin.googleCalendar.tokenExpiry = new Date(Date.now() + refreshed.expires_in * 1000);
    await admin.save();

    return refreshed.access_token;
  } catch (err: any) {
    // Google rejects a refresh_token grant if it was revoked or has
    // expired from long disuse - the correct response per UC-06 A1 is to
    // mark disconnected and surface a clear "please reconnect" signal,
    // not to keep silently failing on every subsequent call.
    await logError('calendarTokenService.refreshFailed', err, { adminId });
    admin.googleCalendar.isConnected = false;
    await admin.save();
    throw new CalendarReconnectRequiredError();
  }
}