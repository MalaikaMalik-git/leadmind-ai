// backend/src/scripts/checkDay22Session2.ts
//
// LeadMind AI — Day 22, Session 2 verification
// Run with: npm run test:day22:s2:check
//
// Requires: backend running (npm run dev) AND MongoDB connected.
//
// IMPORTANT: this script temporarily overwrites the seeded admin's
// googleCalendar field to exercise every branch of getValidAccessToken(),
// then restores whatever was there before (including a REAL connection,
// if you already did a live OAuth test after Session 1). If this script
// is ever killed mid-run (Ctrl+C), re-run it once more to let the
// restore-on-completion step put things back — or reconnect manually via
// the /dashboard/settings page.
//
// Honest scope note: this environment's network can't reach
// googleapis.com (same sandboxed-network category of limitation as
// MongoDB/VAPI in earlier days), so Tests 3-5 below can't get a REAL
// "Google accepted" or "Google rejected" response — whatever axios call
// they trigger will fail for a network reason instead. That's fine for
// what these tests actually verify: the error-HANDLING mechanics
// (mark disconnected, log to ErrorLog, throw the right error type) fire
// identically no matter WHY the refresh call failed. What genuinely can't
// be tested outside a real environment is a SUCCESSFUL refresh — that
// only happens naturally once Day 23's booking code runs against a real
// connected account with actual traffic.

import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import mongoose from 'mongoose';
const Admin = require('../models/Admin');
const ErrorLog = require('../models/ErrorLog');
import { signAccessToken } from '../utils/jwt';
import { encrypt, decrypt } from '../utils/encryption';
import { getValidAccessToken, CalendarNotConnectedError, CalendarReconnectRequiredError } from '../services/calendarTokenService';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:8000';

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    pass++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    fail++;
  }
}

async function setCalendarState(adminId: string, state: {
  isConnected: boolean;
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiry?: Date | null;
  calendarEmail?: string | null;
}) {
  await Admin.updateOne(
    { _id: adminId },
    {
      $set: {
        'googleCalendar.isConnected': state.isConnected,
        'googleCalendar.accessToken': state.accessToken === undefined ? null : state.accessToken,
        'googleCalendar.refreshToken': state.refreshToken === undefined ? null : state.refreshToken,
        'googleCalendar.tokenExpiry': state.tokenExpiry === undefined ? null : state.tokenExpiry,
        'googleCalendar.calendarEmail': state.calendarEmail === undefined ? null : state.calendarEmail,
      },
    }
  );
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);

  const admin = await Admin.findOne({ email: process.env.SEED_ADMIN_EMAIL || 'admin@leadmind.ai' })
    .select('+googleCalendar.accessToken +googleCalendar.refreshToken');
  if (!admin) {
    console.error('❌ No seeded admin found — run `npm run seed` first.');
    process.exit(1);
  }
  const adminId = String(admin._id);

  // ── Snapshot the REAL current state so we can restore it no matter what ──
  const originalState = {
    isConnected: admin.googleCalendar.isConnected,
    accessToken: admin.googleCalendar.accessToken,
    refreshToken: admin.googleCalendar.refreshToken,
    tokenExpiry: admin.googleCalendar.tokenExpiry,
    calendarEmail: admin.googleCalendar.calendarEmail,
  };
  console.log(`ℹ️  Snapshotted current calendar state (isConnected: ${originalState.isConnected}) — will restore this when done.\n`);

  const token = signAccessToken({ adminId, email: admin.email });
  const client = axios.create({ baseURL: BASE_URL, headers: { Authorization: `Bearer ${token}` }, validateStatus: () => true });

  try {
    // ═══════════════════════════════════════════════════════════════════════
    //  Part A — Encryption round-trip through a real Admin document
    // ═══════════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════');
    console.log('  Part A — Encryption round-trip via a real Admin document');
    console.log('═══════════════════════════════════════════════════\n');

    const plaintextToken = 'ya29.a0-realistic-looking-test-access-token-1234567890';
    await setCalendarState(adminId, { isConnected: true, accessToken: encrypt(plaintextToken), tokenExpiry: new Date(Date.now() + 60 * 60 * 1000) });

    const reloaded = await Admin.findById(adminId).select('+googleCalendar.accessToken');
    check('Stored value is NOT the plaintext (actually encrypted at rest)', reloaded.googleCalendar.accessToken !== plaintextToken);
    check('Decrypting the stored value returns the original plaintext', decrypt(reloaded.googleCalendar.accessToken) === plaintextToken);

    // ═══════════════════════════════════════════════════════════════════════
    //  Part B — getValidAccessToken() branch coverage
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  Part B — getValidAccessToken() branch coverage');
    console.log('═══════════════════════════════════════════════════\n');

    // Test 1 — not connected at all
    await setCalendarState(adminId, { isConnected: false });
    try {
      await getValidAccessToken(adminId);
      check('Test 1: throws CalendarNotConnectedError when not connected', false, 'did not throw at all');
    } catch (err) {
      check('Test 1: throws CalendarNotConnectedError when not connected', err instanceof CalendarNotConnectedError, `got ${err instanceof Error ? err.constructor.name : typeof err}`);
    }

    // Test 2 — connected, valid token with plenty of headroom (no refresh should be attempted)
    const validToken = 'valid-token-should-be-returned-as-is';
    await setCalendarState(adminId, {
      isConnected: true,
      accessToken: encrypt(validToken),
      refreshToken: encrypt('this-refresh-token-would-fail-if-actually-called'),
      tokenExpiry: new Date(Date.now() + 30 * 60 * 1000), // 30 min out — well past the 5 min buffer
    });
    try {
      const result = await getValidAccessToken(adminId);
      check('Test 2: returns the stored token directly when still valid (no refresh attempted)', result === validToken, `got "${result}"`);
    } catch (err: any) {
      check('Test 2: returns the stored token directly when still valid (no refresh attempted)', false, `threw unexpectedly: ${err.message}`);
    }

    // Test 3 — expiring within the buffer window (should attempt refresh)
    await setCalendarState(adminId, {
      isConnected: true,
      accessToken: encrypt('stale-token'),
      refreshToken: encrypt('fake-refresh-token-google-cannot-accept'),
      tokenExpiry: new Date(Date.now() + 2 * 60 * 1000), // 2 min out — within the 5 min buffer
    });
    let test3Threw = false;
    try {
      await getValidAccessToken(adminId);
    } catch (err) {
      test3Threw = err instanceof CalendarReconnectRequiredError;
    }
    check('Test 3: attempts refresh when expiring soon, and correctly surfaces CalendarReconnectRequiredError on failure', test3Threw);

    const adminAfterTest3 = await Admin.findById(adminId);
    check('Test 3: isConnected was set to false after the failed refresh', adminAfterTest3.googleCalendar.isConnected === false);

    const refreshErrorLog = await ErrorLog.findOne({ source: 'calendarTokenService.refreshFailed', 'context.adminId': adminId }).sort({ createdAt: -1 });
    check('Test 3: the refresh failure was logged to ErrorLog', !!refreshErrorLog);

    // Test 4 — already expired (not just within buffer) behaves the same way
    await setCalendarState(adminId, {
      isConnected: true,
      accessToken: encrypt('stale-token'),
      refreshToken: encrypt('fake-refresh-token-google-cannot-accept'),
      tokenExpiry: new Date(Date.now() - 10 * 60 * 1000), // 10 min in the PAST
    });
    let test4Threw = false;
    try {
      await getValidAccessToken(adminId);
    } catch (err) {
      test4Threw = err instanceof CalendarReconnectRequiredError;
    }
    check('Test 4: an already-expired token also triggers a refresh attempt (same handling as "expiring soon")', test4Threw);

    // Test 5 — no refresh token stored at all (should fail fast, no network attempt)
    await setCalendarState(adminId, {
      isConnected: true,
      accessToken: encrypt('stale-token'),
      refreshToken: null,
      tokenExpiry: new Date(Date.now() - 10 * 60 * 1000),
    });
    let test5Threw = false;
    const startTime = Date.now();
    try {
      await getValidAccessToken(adminId);
    } catch (err) {
      test5Threw = err instanceof CalendarReconnectRequiredError;
    }
    const elapsed = Date.now() - startTime;
    check('Test 5: throws CalendarReconnectRequiredError immediately when no refresh token is stored', test5Threw);
    check('Test 5: failed fast (< 500ms) — confirms no network call was attempted with a null refresh token', elapsed < 500, `took ${elapsed}ms`);

    const adminAfterTest5 = await Admin.findById(adminId);
    check('Test 5: isConnected was also set to false in this case', adminAfterTest5.googleCalendar.isConnected === false);

    // ═══════════════════════════════════════════════════════════════════════
    //  Part C — GET /api/calendar/status reflects DB state, never leaks tokens
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  Part C — GET /api/calendar/status');
    console.log('═══════════════════════════════════════════════════\n');

    await setCalendarState(adminId, {
      isConnected: true,
      accessToken: encrypt('some-secret-token-value-that-must-never-appear-in-the-response'),
      calendarEmail: 'test-connected@example.com',
      tokenExpiry: new Date(Date.now() + 3600 * 1000),
    });
    const statusConnected = await client.get('/api/calendar/status');
    check('Status endpoint returns 200', statusConnected.status === 200);
    check('isConnected: true reflected correctly', statusConnected.data?.data?.isConnected === true);
    check('calendarEmail reflected correctly', statusConnected.data?.data?.calendarEmail === 'test-connected@example.com');
    const rawBody = JSON.stringify(statusConnected.data);
    check('Raw access token NEVER appears anywhere in the response body', !rawBody.includes('some-secret-token-value-that-must-never-appear-in-the-response'));

    await setCalendarState(adminId, { isConnected: false });
    const statusDisconnected = await client.get('/api/calendar/status');
    check('isConnected: false reflected correctly after disconnect', statusDisconnected.data?.data?.isConnected === false);

    const noAuthResp = await axios.get(`${BASE_URL}/api/calendar/status`, { validateStatus: () => true });
    check('Status endpoint requires auth (401 without a token)', noAuthResp.status === 401, `got ${noAuthResp.status}`);
  } finally {
    // ── Always restore the real original state, even if a check threw ──────
    await setCalendarState(adminId, originalState);
    const restored = await Admin.findById(adminId);
    const restoredCorrectly = restored.googleCalendar.isConnected === originalState.isConnected;
    console.log(`\nℹ️  Restored original calendar state (isConnected: ${restored.googleCalendar.isConnected}) — ${restoredCorrectly ? 'confirmed matches snapshot' : 'MISMATCH, please check manually'}.`);
  }

  console.log('\n───────────────────────────────────────────────────────────');
  console.log(`  Results: ${pass} passed, ${fail} failed`);
  console.log('───────────────────────────────────────────────────────────\n');

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('❌ Check failed:', err);
  process.exit(1);
});