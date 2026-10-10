// backend/src/scripts/checkDay23Session2.ts
//
// LeadMind AI — Day 23, Session 2 verification (UC-13 booking)
// Run with: npm run test:day23:s2:check
//
// Requires: backend running (npm run dev) AND MongoDB connected.
//
// Part A — Input validation and guards (no Google connection needed):
// missing fields, invalid/past dates, lead ownership, auth.
//
// Part B — "One meeting per lead" enforcement: seeds an existing Scheduled
// meeting for a lead, confirms a second booking attempt is correctly
// rejected with 409 before ever reaching Google.
//
// Part C — Live booking flow: only runs meaningfully if the seeded admin
// has a real Google Calendar connection (Day 22). If not connected, this
// section reports what it found and explains why it can't test further —
// not a failure of this check.

import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import mongoose from 'mongoose';
const Admin = require('../models/Admin');
const Lead = require('../models/Lead');
const Meeting = require('../models/Meeting');
const MeetingSlot = require('../models/MeetingSlot');
import { signAccessToken } from '../utils/jwt';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const MARKER = 'Day23 Session2 — Booking Test';

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

async function cleanup() {
  const leads = await Lead.find({ fullName: { $regex: `^${MARKER}` } });
  const leadIds = leads.map((l: any) => l._id);
  await Meeting.deleteMany({ lead: { $in: leadIds } });
  await Lead.deleteMany({ _id: { $in: leadIds } });
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  await cleanup();

  const admin = await Admin.findOne({ email: process.env.SEED_ADMIN_EMAIL || 'admin@leadmind.ai' });
  if (!admin) {
    console.error('❌ No seeded admin found — run `npm run seed` first.');
    process.exit(1);
  }
  const token = signAccessToken({ adminId: String(admin._id), email: admin.email });
  const client = axios.create({ baseURL: BASE_URL, headers: { Authorization: `Bearer ${token}` }, validateStatus: () => true });

  const testLead = await Lead.create({ fullName: `${MARKER} Lead`, phone: '+15557770099', status: 'Qualified' });
  const futureTime = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

  // ═══════════════════════════════════════════════════════════════════════
  //  Part A — Input validation and guards
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Part A — Input validation and guards');
  console.log('═══════════════════════════════════════════════════\n');

  const noAuth = await axios.post(`${BASE_URL}/api/meetings/book`, { leadId: testLead._id, startTime: futureTime }, { validateStatus: () => true });
  check('No auth -> 401', noAuth.status === 401, `got ${noAuth.status}`);

  const missingFields = await client.post('/api/meetings/book', {});
  check('Missing leadId/startTime -> 400', missingFields.status === 400, `got ${missingFields.status}`);

  const invalidDate = await client.post('/api/meetings/book', { leadId: testLead._id, startTime: 'not-a-date' });
  check('Invalid startTime -> 400', invalidDate.status === 400, `got ${invalidDate.status}`);

  const pastDate = await client.post('/api/meetings/book', { leadId: testLead._id, startTime: new Date(Date.now() - 60000).toISOString() });
  check('Past startTime -> 400', pastDate.status === 400, `got ${pastDate.status}`);

  const fakeLeadId = new mongoose.Types.ObjectId();
  const notFoundLead = await client.post('/api/meetings/book', { leadId: fakeLeadId, startTime: futureTime });
  check('Nonexistent leadId -> 404', notFoundLead.status === 404, `got ${notFoundLead.status}`);

  // Cross-admin ownership check
  const otherAdmin = await Admin.create({ name: 'Day23 S2 Other Admin', email: 'day23-s2-other-admin@leadmind.ai', password: 'TestPassword123' });
  const Campaign = require('../models/Campaign');
  const otherCampaign = await Campaign.create({
    name: `${MARKER} Other Admin Campaign`, goal: 'Isolation test', tone: 'Professional',
    instructions: 'Test.', dailyCallLimit: 50, status: 'Completed', createdBy: otherAdmin._id,
  });
  const otherLead = await Lead.create({ fullName: `${MARKER} Other Admin Lead`, phone: '+15557770098', campaign: otherCampaign._id, status: 'Qualified' });
  const crossAdmin = await client.post('/api/meetings/book', { leadId: otherLead._id, startTime: futureTime });
  check("Cannot book a meeting for another admin's lead (404)", crossAdmin.status === 404, `got ${crossAdmin.status}`);
  await Lead.deleteOne({ _id: otherLead._id });
  await Campaign.deleteOne({ _id: otherCampaign._id });
  await Admin.deleteOne({ _id: otherAdmin._id });

  // ═══════════════════════════════════════════════════════════════════════
  //  Part B — "One meeting per lead" enforcement
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Part B — One meeting per lead enforcement');
  console.log('═══════════════════════════════════════════════════\n');

  const meetingSlot = await MeetingSlot.findOneAndUpdate({ admin: admin._id }, {}, { upsert: true, new: true, setDefaultsOnInsert: true });
  check('MeetingSlot.preferences.oneMeetingPerLead defaults to true', meetingSlot.preferences.oneMeetingPerLead === true);

  const existingMeeting = await Meeting.create({
    lead: testLead._id,
    scheduledAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    durationMinutes: meetingSlot.defaultMeetingDurationMinutes,
    timezone: meetingSlot.timezone,
    status: 'Scheduled',
    leadSnapshot: { fullName: testLead.fullName, phone: testLead.phone },
  });

  const duplicateAttempt = await client.post('/api/meetings/book', { leadId: testLead._id, startTime: futureTime });
  check(
    'Booking a second meeting for a lead that already has one is rejected (409, before ever reaching Google)',
    duplicateAttempt.status === 409 && duplicateAttempt.data?.code === 'ONE_MEETING_PER_LEAD',
    `got ${duplicateAttempt.status}: ${JSON.stringify(duplicateAttempt.data)}`
  );

  await Meeting.deleteOne({ _id: existingMeeting._id });

  // ═══════════════════════════════════════════════════════════════════════
  //  Part C — Live booking flow (needs a real Google connection)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Part C — Live booking flow');
  console.log('═══════════════════════════════════════════════════\n');

  const statusResp = await client.get('/api/calendar/status');
  if (!statusResp.data?.data?.isConnected) {
    console.log('  ℹ️  Google Calendar is not connected for this admin — cannot test a real booking.');
    console.log('     Connect via /dashboard/settings (Day 22), then re-run this script to test the');
    console.log('     full flow: real slot re-verification, real Google event creation, meeting link,');
    console.log('     and the Lead.status -> "Meeting Booked" update. This is expected, not a failure.');
  } else {
    // Pick a real available slot from the live slots endpoint rather than
    // guessing a time — guarantees this test books something that should
    // actually be valid.
    const slotsResp = await client.get('/api/calendar/slots');
    const firstSlot = slotsResp.data?.data?.slots?.[0];

    if (!firstSlot) {
      console.log('  ℹ️  Connected, but no available slots were returned — cannot test booking. Check your');
      console.log('     MeetingSlot availability windows.');
    } else {
      const bookResp = await client.post('/api/meetings/book', { leadId: testLead._id, startTime: firstSlot.start });
      console.log('  Booking response:', JSON.stringify(bookResp.data, null, 2));

      check('Booking a real available slot returns 201', bookResp.status === 201, `got ${bookResp.status}`);
      check('Response includes a meetingLink', !!bookResp.data?.data?.meetingLink);

      const leadAfter = await Lead.findById(testLead._id);
      check('Lead.status updated to "Meeting Booked"', leadAfter.status === 'Meeting Booked', `got "${leadAfter.status}"`);

      const meetingDoc = await Meeting.findById(bookResp.data?.data?.meetingId);
      check('Meeting.googleCalendar.syncStatus === "Synced"', meetingDoc?.googleCalendar?.syncStatus === 'Synced');
      check('Meeting.googleCalendar.eventId was stored', !!meetingDoc?.googleCalendar?.eventId);

      // Immediately try to book the SAME slot again — should now be
      // rejected by oneMeetingPerLead (or slot conflict either way).
      const secondLead = await Lead.create({ fullName: `${MARKER} Second Lead`, phone: '+15557770097', status: 'Qualified' });
      const conflictResp = await client.post('/api/meetings/book', { leadId: secondLead._id, startTime: firstSlot.start });
      check('Booking the SAME slot for a different lead is rejected (double-booking prevented)', conflictResp.status === 409, `got ${conflictResp.status}`);
      await Lead.deleteOne({ _id: secondLead._id });

      await Meeting.deleteOne({ _id: meetingDoc._id });
    }
  }

  await cleanup();

  console.log('\n───────────────────────────────────────────────────────────');
  console.log(`  Results: ${pass} passed, ${fail} failed`);
  console.log('───────────────────────────────────────────────────────────\n');

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('❌ Check failed:', err);
  process.exit(1);
});