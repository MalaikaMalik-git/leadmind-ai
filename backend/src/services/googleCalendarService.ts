// backend/src/services/googleCalendarService.ts
//
// LeadMind AI — Google Calendar OAuth2 integration (Day 22, Session 1)
// Related UC: UC-06 (Configure Meeting Scheduling — Google account linking
// specifically; availability rules and slot computation are Day 23/24)
//
// Deliberately uses raw axios calls to Google's OAuth endpoints rather than
// the `googleapis` npm package — matches vapiService.ts's established
// pattern of talking to VAPI directly over HTTP instead of pulling in a
// vendor SDK. Keeps the dependency footprint the same as the rest of this
// codebase and makes exactly what's being sent/received explicit.
//
// ── The redirect-auth problem, and how this is designed around it ─────────
// The 30-day plan describes "GET /api/calendar/auth → redirect to Google
// consent." A literal browser navigation to that URL can't carry a Bearer
// token (browsers don't attach custom headers to top-level navigations),
// but every other route in this app is protected via
// `Authorization: Bearer <token>`. Rather than accept a live access token
// as a URL query parameter (which would land in browser history, proxy
// logs, and server access logs — a real, avoidable exposure of a bearer
// credential), this flow is split in two:
//   1. GET /api/calendar/auth — a normal Bearer-protected JSON endpoint.
//      Returns the Google consent URL; the FRONTEND performs the actual
//      navigation (`window.location.href = url`).
//   2. GET /api/calendar/callback — genuinely unauthenticated (Google's
//      redirect can't carry our Bearer token either), but safe because the
//      `state` parameter is a short-lived, signed, single-purpose token
//      (see signOAuthState/verifyOAuthState below) that both proves the
//      request is a legitimate continuation of step 1 AND carries which
//      admin initiated it — Google just echoes `state` back verbatim, it
//      doesn't need to understand it.

import axios from 'axios';
import jwt from 'jsonwebtoken';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

// Full calendar access (not just calendar.events) — Day 23's slot
// computation needs to READ existing events to determine free/busy time,
// not just write new ones, so requesting the broader scope now avoids
// having to send the admin through consent a second time later.
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

const OAUTH_STATE_PURPOSE = 'google_calendar_oauth';

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set in backend/.env — see Day 22 Session 1 setup instructions.`);
  }
  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
//  OAuth state token — short-lived, purpose-scoped, reuses JWT_ACCESS_SECRET
//  to avoid requiring yet another secret in .env. The explicit `purpose`
//  claim means a real access token (payload: {adminId, email}, no
//  `purpose` field) can never be mistaken for a valid state value even
//  though both are signed with the same secret.
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_RETURN_TO = '/dashboard/settings';

interface OAuthStatePayload {
  adminId: string;
  purpose: typeof OAUTH_STATE_PURPOSE;
  returnTo?: string;
}

// returnTo is appended to FRONTEND_URL in the callback redirect, so only
// accept same-site absolute paths ("/dashboard/..."). Anything else
// (full URLs, "//evil.com", missing) falls back to the default.
export function sanitizeReturnTo(returnTo?: string): string {
  if (
    typeof returnTo === 'string' &&
    returnTo.startsWith('/') &&
    !returnTo.startsWith('//') &&
    !returnTo.includes('\\') &&
    !/[\r\n]/.test(returnTo)
  ) {
    return returnTo;
  }
  return DEFAULT_RETURN_TO;
}

export function signOAuthState(adminId: string, returnTo?: string): string {
  const secret = getRequiredEnv('JWT_ACCESS_SECRET');
  const payload: OAuthStatePayload = {
    adminId,
    purpose: OAUTH_STATE_PURPOSE,
    returnTo: sanitizeReturnTo(returnTo),
  };
  return jwt.sign(payload, secret, { expiresIn: '10m' });
}

export function verifyOAuthState(state: string): { adminId: string; returnTo: string } {
  const secret = getRequiredEnv('JWT_ACCESS_SECRET');
  const decoded = jwt.verify(state, secret) as OAuthStatePayload;

  if (decoded.purpose !== OAUTH_STATE_PURPOSE) {
    throw new Error('Invalid OAuth state token (wrong purpose claim).');
  }

  return { adminId: decoded.adminId, returnTo: sanitizeReturnTo(decoded.returnTo) };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Building the consent URL
// ─────────────────────────────────────────────────────────────────────────────

export function buildGoogleAuthUrl(adminId: string, returnTo?: string): string {
  const clientId = getRequiredEnv('GOOGLE_CLIENT_ID');
  const redirectUri = getRequiredEnv('GOOGLE_REDIRECT_URI');
  const state = signOAuthState(adminId, returnTo);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline', // required to receive a refresh_token
    prompt: 'consent',      // forces Google to re-issue a refresh_token even on reconnect
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Exchanging the authorization code for tokens
// ─────────────────────────────────────────────────────────────────────────────

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string; // only present on the FIRST consent (or with prompt=consent), not on every exchange
  expires_in: number;     // seconds
  scope: string;
  token_type: string;
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  const clientId = getRequiredEnv('GOOGLE_CLIENT_ID');
  const clientSecret = getRequiredEnv('GOOGLE_CLIENT_SECRET');
  const redirectUri = getRequiredEnv('GOOGLE_REDIRECT_URI');

  const response = await axios.post(
    GOOGLE_TOKEN_URL,
    new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  return response.data;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Refreshing an expired access token (fully wired/tested in Session 2)
// ─────────────────────────────────────────────────────────────────────────────

export interface GoogleRefreshResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleRefreshResponse> {
  const clientId = getRequiredEnv('GOOGLE_CLIENT_ID');
  const clientSecret = getRequiredEnv('GOOGLE_CLIENT_SECRET');

  const response = await axios.post(
    GOOGLE_TOKEN_URL,
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  return response.data;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Identifying which Google account was connected
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchGoogleUserEmail(accessToken: string): Promise<string> {
  const response = await axios.get(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.data.email;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Reading busy periods (Day 23, Session 1) — UC-13 slot computation
// ─────────────────────────────────────────────────────────────────────────────

const GOOGLE_FREEBUSY_URL = 'https://www.googleapis.com/calendar/v3/freeBusy';

export interface GoogleBusyPeriod {
  start: string; // ISO 8601
  end: string;   // ISO 8601
}

/**
 * Queries Google's freeBusy API for the admin's primary calendar between
 * timeMin and timeMax. Returns the raw busy periods Google reports —
 * slotComputationService.ts is responsible for turning these into
 * Date objects and applying buffer padding, not this function.
 */
export async function queryFreeBusy(
  accessToken: string,
  timeMin: Date,
  timeMax: Date,
  calendarId: string = 'primary'
): Promise<GoogleBusyPeriod[]> {
  const response = await axios.post(
    GOOGLE_FREEBUSY_URL,
    {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: calendarId }],
    },
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
  );

  const busy = response.data?.calendars?.[calendarId]?.busy;
  return Array.isArray(busy) ? busy : [];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Creating a calendar event (Day 23, Session 2) — UC-13 step 8
//  "System schedules event via Google Calendar API."
// ─────────────────────────────────────────────────────────────────────────────

const GOOGLE_EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export interface CreateEventParams {
  summary: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  attendeeEmail?: string | null;
  /**
   * 'all'  — Google emails its own calendar invitation to the attendee (default).
   * 'none' — attendee is added silently; the caller sends its own email
   *          (emailService.ts) so the lead never gets two invitations.
   */
  sendUpdates?: 'all' | 'none';
}

export interface CreateEventResult {
  eventId: string;
  meetingLink: string | null;
  rawEventData: any;
}

export async function createCalendarEvent(accessToken: string, params: CreateEventParams): Promise<CreateEventResult> {
  const body: Record<string, any> = {
    summary: params.summary,
    description: params.description || undefined,
    start: { dateTime: params.startTime.toISOString(), timeZone: params.timezone },
    end: { dateTime: params.endTime.toISOString(), timeZone: params.timezone },
    // Requests a real Google Meet link be generated automatically —
    // Meeting.googleCalendar.meetingLink (Day 21-era schema) expects one.
    conferenceData: {
      createRequest: {
        requestId: `leadmind-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
  };

  if (params.attendeeEmail) {
    body.attendees = [{ email: params.attendeeEmail }];
  }

  const response = await axios.post(GOOGLE_EVENTS_URL, body, {
    // conferenceDataVersion: required for conferenceData (the Meet link) to be honored.
    // sendUpdates=all: makes Google EMAIL the calendar invitation (with the Meet
    // link) to every attendee. Without it the guest is added silently and
    // receives nothing. When our own SMTP email is used instead, the caller
    // passes sendUpdates='none' so the lead gets exactly one email.
    params: {
      conferenceDataVersion: 1,
      ...(params.attendeeEmail ? { sendUpdates: params.sendUpdates ?? 'all' } : {}),
    },
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });

  const eventData = response.data;
  const meetingLink =
    eventData?.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri ||
    eventData?.hangoutLink ||
    null;

  return { eventId: eventData.id, meetingLink, rawEventData: eventData };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Google occasionally returns the new event before the Meet link has been
//  generated (conferenceData.createRequest.status = "pending"). This re-reads
//  the event a few times so the link can still be put in the email.
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchEventMeetingLink(accessToken: string, eventId: string, attempts = 3, delayMs = 1000): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    const response = await axios.get(`${GOOGLE_EVENTS_URL}/${encodeURIComponent(eventId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const link =
      response.data?.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri ||
      response.data?.hangoutLink ||
      null;
    if (link) return link;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Fallback notification — used when our own SMTP email could not be sent.
//  Patching the event with sendUpdates=all makes Google email the attendee its
//  native invitation, so the lead still receives the meeting link.
// ─────────────────────────────────────────────────────────────────────────────

export async function sendGoogleInvitation(accessToken: string, eventId: string, meetingLink: string | null): Promise<void> {
  await axios.patch(
    `${GOOGLE_EVENTS_URL}/${encodeURIComponent(eventId)}`,
    { description: `Scheduled via LeadMind AI.${meetingLink ? `\n\nJoin: ${meetingLink}` : ''}` },
    {
      params: { sendUpdates: 'all', conferenceDataVersion: 1 },
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Deleting an event (used by the test-data cleanup script).
//  sendUpdates defaults to 'none' so removing test meetings never emails leads.
//  404/410 mean "already gone", which is the outcome we wanted.
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string,
  sendUpdates: 'all' | 'none' = 'none'
): Promise<'deleted' | 'already_gone'> {
  try {
    await axios.delete(`${GOOGLE_EVENTS_URL}/${encodeURIComponent(eventId)}`, {
      params: { sendUpdates },
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return 'deleted';
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 404 || status === 410) return 'already_gone';
    throw err;
  }
}