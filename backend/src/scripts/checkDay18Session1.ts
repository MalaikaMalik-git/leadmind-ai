// backend/src/scripts/checkDay18Session1.ts
//
// LeadMind AI — Day 18, Session 1 verification
// Run with: npm run test:day18:s1:check
//
// No MongoDB needed — this session's code path (assistant-request handling)
// is intentionally DB-free (see webhookController.handleAssistantRequest),
// so this script only needs the Express server running (`npm run dev`).
//
// Part 1 — Unit-level: isWithinBusinessHours / getBusinessHoursStatus tested
// directly with fixed timestamps, so both branches (business hours / outside
// hours) are exercised deterministically regardless of when you run this.
//
// Part 2 — Live HTTP: computes ground truth for the CURRENT real time using
// the same utility, then POSTs a simulated Vapi assistant-request event to
// the running server and asserts the response matches — proving the wiring
// (route -> middleware -> controller -> vapiService config builders) is
// correct end-to-end, not just the isolated business-hours math.

import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import { isWithinBusinessHours, getBusinessHoursStatus } from '../utils/businessHours';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;

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

function assistantRequestPayload(fromNumber = '+15559998888') {
  return {
    message: {
      type: 'assistant-request',
      call: {
        id: `day18-s1-test-${Date.now()}`,
        type: 'inboundPhoneCall',
        customer: { number: fromNumber },
      },
    },
  };
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Part 1 — Business hours utility (deterministic, fixed timestamps)');
  console.log('═══════════════════════════════════════════════════\n');

  const tz = process.env.BUSINESS_HOURS_TIMEZONE || 'Asia/Karachi';
  const start = process.env.BUSINESS_HOURS_START || '09:00';
  const end = process.env.BUSINESS_HOURS_END || '18:00';
  console.log(`  Configured window: ${start}-${end} (${tz})\n`);

  // Construct a UTC instant that corresponds to a known local time in the
  // configured timezone by round-tripping through Intl — avoids hardcoding
  // a UTC offset that would break if BUSINESS_HOURS_TIMEZONE is changed.
  function utcInstantForLocalTime(hhmm: string, tzArg: string): Date {
    const [h, m] = hhmm.split(':').map(Number);
    // Start from a UTC guess, then correct using the offset Intl reports.
    const guess = new Date(Date.UTC(2026, 0, 15, h, m, 0));
    const zoned = new Intl.DateTimeFormat('en-US', {
      timeZone: tzArg,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(guess);
    const zonedHour = Number(zoned.find((p) => p.type === 'hour')?.value ?? '0');
    const zonedMinute = Number(zoned.find((p) => p.type === 'minute')?.value ?? '0');
    const diffMinutes = h * 60 + m - (zonedHour * 60 + zonedMinute);
    return new Date(guess.getTime() + diffMinutes * 60 * 1000);
  }

  const midDay = utcInstantForLocalTime('12:00', tz); // safely inside a typical 09:00-18:00 window
  const midNight = utcInstantForLocalTime('02:00', tz); // safely outside it

  check(
    'isWithinBusinessHours(noon) === true (inside window, fixed timestamp)',
    isWithinBusinessHours(midDay) === true,
    `computed for ${midDay.toISOString()}`
  );
  check(
    'isWithinBusinessHours(2am) === false (outside window, fixed timestamp)',
    isWithinBusinessHours(midNight) === false,
    `computed for ${midNight.toISOString()}`
  );

  const midDayStatus = getBusinessHoursStatus(midDay);
  const midNightStatus = getBusinessHoursStatus(midNight);
  check('getBusinessHoursStatus(noon).withinBusinessHours === true', midDayStatus.withinBusinessHours === true);
  check('getBusinessHoursStatus(2am).withinBusinessHours === false', midNightStatus.withinBusinessHours === false);
  check(`getBusinessHoursStatus returns configured timezone "${tz}"`, midDayStatus.timezone === tz);

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Part 2 — Live HTTP: POST /api/webhooks/vapi (assistant-request)');
  console.log('═══════════════════════════════════════════════════\n');

  if (!VAPI_WEBHOOK_SECRET) {
    console.error('❌ VAPI_WEBHOOK_SECRET is not set in backend/.env — cannot test the live endpoint.');
    process.exit(1);
  }

  // Ground truth for the CURRENT real moment — whichever branch is
  // actually live right now when this script runs.
  const liveStatus = getBusinessHoursStatus();
  console.log(
    `  Ground truth right now: ${liveStatus.withinBusinessHours ? 'WITHIN' : 'OUTSIDE'} business hours ` +
      `(${liveStatus.currentTimeInZone} ${liveStatus.timezone})\n`
  );

  const client = axios.create({
    baseURL: BASE_URL,
    headers: { 'Content-Type': 'application/json', 'x-vapi-secret': VAPI_WEBHOOK_SECRET },
    validateStatus: () => true,
  });

  const startedAt = Date.now();
  let resp;
  try {
    resp = await client.post('/api/webhooks/vapi', assistantRequestPayload());
  } catch (err: any) {
    console.error(`❌ Could not reach ${BASE_URL} — is the backend running? (npm run dev)`);
    console.error(err.message);
    process.exit(1);
  }
  const elapsedMs = Date.now() - startedAt;

  console.log('Response:', JSON.stringify(resp.data, null, 2));
  console.log(`Response time: ${elapsedMs}ms\n`);

  check('POST /api/webhooks/vapi (assistant-request) returns 200', resp.status === 200, `got ${resp.status}`);
  check(
    `Response well within Vapi's 7.5s budget (< 5000ms)`,
    elapsedMs < 5000,
    `took ${elapsedMs}ms`
  );
  check('Response includes an "assistant" object', !!resp.data?.assistant);
  check('Assistant config includes a firstMessage', typeof resp.data?.assistant?.firstMessage === 'string');
  check('Assistant config includes a model.messages system prompt', Array.isArray(resp.data?.assistant?.model?.messages));

  if (liveStatus.withinBusinessHours) {
    check(
      'Returned the NORMAL inbound assistant (matches current live branch: within business hours)',
      resp.data?.assistant?.firstMessage?.includes('This is LeadMind AI'),
      `got firstMessage: "${resp.data?.assistant?.firstMessage}"`
    );
  } else {
    check(
      'Returned the OUTSIDE-HOURS assistant (matches current live branch: outside business hours)',
      resp.data?.assistant?.firstMessage?.includes('business hours are'),
      `got firstMessage: "${resp.data?.assistant?.firstMessage}"`
    );
  }

  // ── Auth enforcement — same middleware guards this event type too ────────
  const noAuthResp = await axios.post(`${BASE_URL}/api/webhooks/vapi`, assistantRequestPayload(), {
    validateStatus: () => true,
  });
  check('Rejects assistant-request with no x-vapi-secret (401)', noAuthResp.status === 401, `got ${noAuthResp.status}`);

  console.log('\n───────────────────────────────────────────────────────────');
  console.log(`  Results: ${pass} passed, ${fail} failed`);
  console.log('───────────────────────────────────────────────────────────\n');

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('❌ Check failed:', err);
  process.exit(1);
});