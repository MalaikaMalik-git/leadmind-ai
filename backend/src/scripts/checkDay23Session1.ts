// backend/src/scripts/checkDay23Session1.ts
//
// LeadMind AI — Day 23, Session 1 verification (UC-13 slot computation)
// Run with: npm run test:day23:s1:check
//
// Requires: backend running (npm run dev) AND MongoDB connected.
//
// Part A — Pure algorithm re-verification: computeAvailableSlots() was
// already exhaustively tested in isolation while building this (7
// scenarios: basic week, inactive/undefined days, busy-period exclusion,
// buffer padding, minimum notice, maximum advance, non-divisible
// durations — all confirmed correct). This section re-runs a condensed
// version of that here so it's part of the repeatable check suite, not
// just a one-off manual verification.
//
// Part B — Live HTTP: GET /api/calendar/slots against the real running
// server. Tests the "not connected" guard (this endpoint needs a real
// Google connection to mean anything, which this sandboxed environment
// can't fully provide — see the note printed at that point) and, if
// already connected, the MeetingSlot lazy-creation and real busy-period
// exclusion via a seeded Meeting document.

import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import mongoose from 'mongoose';
const Admin = require('../models/Admin');
const Lead = require('../models/Lead');
const Meeting = require('../models/Meeting');
const MeetingSlot = require('../models/MeetingSlot');
import { signAccessToken } from '../utils/jwt';
import { computeAvailableSlots } from '../services/slotComputationService';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const MARKER = 'Day23 Session1 — Slots Test';

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

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  //  Part A — Pure algorithm re-verification (no DB/network needed)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Part A — computeAvailableSlots() core correctness');
  console.log('═══════════════════════════════════════════════════\n');

  const windows = [
    { day: 'Monday', startTime: '09:00', endTime: '17:00', isActive: true },
    { day: 'Tuesday', startTime: '09:00', endTime: '17:00', isActive: true },
    { day: 'Saturday', startTime: '10:00', endTime: '12:00', isActive: false },
  ];
  const fixedNow = new Date('2026-06-15T00:00:00.000Z'); // Monday, 5am Karachi

  const basic = computeAvailableSlots({
    availabilityWindows: windows, durationMinutes: 30, bufferMinutes: 0,
    minimumNoticeHours: 0, maximumAdvanceDays: 30, timezone: 'Asia/Karachi',
    rangeStart: new Date('2026-06-15T00:00:00.000Z'), rangeEnd: new Date('2026-06-16T00:00:00.000Z'),
    busyPeriods: [], now: fixedNow,
  });
  check('Basic Monday 9-17 with 30min slots produces exactly 16 slots', basic.length === 16, `got ${basic.length}`);
  check('First slot is exactly 9:00 AM Karachi (04:00 UTC)', basic[0]?.start.toISOString() === '2026-06-15T04:00:00.000Z');

  const withBusy = computeAvailableSlots({
    availabilityWindows: windows, durationMinutes: 30, bufferMinutes: 0,
    minimumNoticeHours: 0, maximumAdvanceDays: 30, timezone: 'Asia/Karachi',
    rangeStart: new Date('2026-06-15T00:00:00.000Z'), rangeEnd: new Date('2026-06-16T00:00:00.000Z'),
    busyPeriods: [{ start: new Date('2026-06-15T05:00:00.000Z'), end: new Date('2026-06-15T06:00:00.000Z') }],
    now: fixedNow,
  });
  check('A 1-hour busy period correctly removes exactly 2 slots (16 -> 14)', withBusy.length === 14, `got ${withBusy.length}`);

  const inactiveDay = computeAvailableSlots({
    availabilityWindows: windows, durationMinutes: 30, bufferMinutes: 0,
    minimumNoticeHours: 0, maximumAdvanceDays: 30, timezone: 'Asia/Karachi',
    rangeStart: new Date('2026-06-20T00:00:00.000Z'), rangeEnd: new Date('2026-06-21T00:00:00.000Z'), // Saturday
    busyPeriods: [], now: fixedNow,
  });
  check('An isActive:false window produces zero slots', inactiveDay.length === 0, `got ${inactiveDay.length}`);

  const notice = computeAvailableSlots({
    availabilityWindows: windows, durationMinutes: 30, bufferMinutes: 0,
    minimumNoticeHours: 6, maximumAdvanceDays: 30, timezone: 'Asia/Karachi',
    rangeStart: new Date('2026-06-15T00:00:00.000Z'), rangeEnd: new Date('2026-06-16T00:00:00.000Z'),
    busyPeriods: [], now: fixedNow, // 5am Karachi + 6h notice = nothing before 11am Karachi
  });
  check('minimumNoticeHours correctly excludes near-term slots', notice[0] !== undefined && notice[0].start.getTime() >= new Date('2026-06-15T06:00:00.000Z').getTime());

  // ═══════════════════════════════════════════════════════════════════════
  //  Part B — Live HTTP
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Part B — GET /api/calendar/slots (live)');
  console.log('═══════════════════════════════════════════════════\n');

  await mongoose.connect(process.env.MONGODB_URI!);
  const admin = await Admin.findOne({ email: process.env.SEED_ADMIN_EMAIL || 'admin@leadmind.ai' });
  if (!admin) {
    console.error('❌ No seeded admin found — run `npm run seed` first.');
    process.exit(1);
  }
  const token = signAccessToken({ adminId: String(admin._id), email: admin.email });
  const client = axios.create({ baseURL: BASE_URL, headers: { Authorization: `Bearer ${token}` }, validateStatus: () => true });

  const noAuthResp = await axios.get(`${BASE_URL}/api/calendar/slots`, { validateStatus: () => true });
  check('Requires auth (401 without a token)', noAuthResp.status === 401, `got ${noAuthResp.status}`);

  const resp = await client.get('/api/calendar/slots');
  console.log('Response status:', resp.status);
  console.log('Response body:', JSON.stringify(resp.data, null, 2).slice(0, 500));

  if (resp.status === 409) {
    console.log('\n  ℹ️  Got 409 (Calendar not connected) — expected if you have not completed a real');
    console.log('     Google OAuth connection yet via /dashboard/settings. This IS the correct');
    console.log('     behavior (the guard from Day 22 Session 2 firing correctly), not a failure.');
    console.log('     Connect a real Google account and re-run this script to test slot computation');
    console.log('     against your actual calendar.');
    check('Correctly returns 409 with a clear "not connected" message when Calendar is not linked', !!resp.data?.message);
  } else if (resp.status === 200) {
    check('Returns 200 when Calendar is connected', true);
    check('Response includes a slots array', Array.isArray(resp.data?.data?.slots));
    check('Response includes meetingDurationMinutes and timezone', !!resp.data?.data?.meetingDurationMinutes && !!resp.data?.data?.timezone);

    const meetingSlotDoc = await MeetingSlot.findOne({ admin: admin._id });
    check('A MeetingSlot document now exists for this admin (lazily created)', !!meetingSlotDoc);

    if (resp.data?.data?.slots?.length > 0) {
      const first = resp.data.data.slots[0];
      const start = new Date(first.start);
      const end = new Date(first.end);
      check('First slot start is before its end', start.getTime() < end.getTime());
      check('First slot is in the future (respects minimum notice)', start.getTime() > Date.now());
    }

    // ── Seed a real Meeting and confirm it's excluded from the next call ──
    const testLead = await Lead.create({ fullName: `${MARKER} Lead`, phone: '+15558880001', status: 'Qualified' });
    const conflictStart = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days out
    await Meeting.create({
      lead: testLead._id,
      scheduledAt: conflictStart,
      durationMinutes: meetingSlotDoc.defaultMeetingDurationMinutes,
      timezone: meetingSlotDoc.timezone,
      status: 'Scheduled',
      leadSnapshot: { fullName: testLead.fullName, phone: testLead.phone },
    });

    const respAfterBooking = await client.get('/api/calendar/slots', {
      params: {
        startDate: conflictStart.toISOString(),
        endDate: new Date(conflictStart.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      },
    });
    const conflictingSlot = (respAfterBooking.data?.data?.slots || []).find((s: any) => {
      const slotStart = new Date(s.start).getTime();
      const slotEnd = new Date(s.end).getTime();
      return slotStart < conflictStart.getTime() + meetingSlotDoc.defaultMeetingDurationMinutes * 60 * 1000 && slotEnd > conflictStart.getTime();
    });
    check('A slot overlapping an existing Meeting booking is correctly excluded', !conflictingSlot);

    await Meeting.deleteMany({ lead: testLead._id });
    await Lead.deleteOne({ _id: testLead._id });
  } else {
    check(`Unexpected status code`, false, `got ${resp.status}: ${JSON.stringify(resp.data)}`);
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