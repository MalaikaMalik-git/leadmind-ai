// backend/src/scripts/checkDay24Session1.ts
//
// LeadMind AI — Day 24, Session 1 verification (UC-06 settings API)
// Run with: npm run test:day24:s1:check
//
// Requires: backend running (npm run dev) AND MongoDB connected.

import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import mongoose from 'mongoose';
const Admin = require('../models/Admin');
const MeetingSlot = require('../models/MeetingSlot');
import { signAccessToken } from '../utils/jwt';

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

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const admin = await Admin.findOne({ email: process.env.SEED_ADMIN_EMAIL || 'admin@leadmind.ai' });
  if (!admin) {
    console.error('❌ No seeded admin found — run `npm run seed` first.');
    process.exit(1);
  }
  const token = signAccessToken({ adminId: String(admin._id), email: admin.email });
  const client = axios.create({ baseURL: BASE_URL, headers: { Authorization: `Bearer ${token}` }, validateStatus: () => true });

  // Snapshot to restore afterward — this script mutates the real
  // MeetingSlot document.
  const originalDoc = await MeetingSlot.findOne({ admin: admin._id });
  const originalSnapshot = originalDoc ? originalDoc.toObject() : null;

  try {
    // ═══════════════════════════════════════════════════════════════════════
    //  Part A — GET (lazy creation + auth)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  Part A — GET /api/calendar/settings');
    console.log('═══════════════════════════════════════════════════\n');

    const noAuth = await axios.get(`${BASE_URL}/api/calendar/settings`, { validateStatus: () => true });
    check('Requires auth (401 without a token)', noAuth.status === 401, `got ${noAuth.status}`);

    const getResp = await client.get('/api/calendar/settings');
    check('Returns 200', getResp.status === 200, `got ${getResp.status}`);
    check('Response includes availabilityWindows', Array.isArray(getResp.data?.data?.availabilityWindows));
    check('Response includes preferences with oneMeetingPerLead', typeof getResp.data?.data?.preferences?.oneMeetingPerLead === 'boolean');
    check('Response includes timezone', typeof getResp.data?.data?.timezone === 'string');

    // ═══════════════════════════════════════════════════════════════════════
    //  Part B — PUT validation, via real HTTP (re-confirms what was already
    //  unit-tested against the middleware directly — this proves it's
    //  actually WIRED into the route correctly, not just correct in isolation)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  Part B — PUT /api/calendar/settings validation (live)');
    console.log('═══════════════════════════════════════════════════\n');

    const badDuration = await client.put('/api/calendar/settings', { defaultMeetingDurationMinutes: 9999 });
    check('Invalid duration rejected via real HTTP (422)', badDuration.status === 422, `got ${badDuration.status}`);
    check('Error response includes field-level errors array', Array.isArray(badDuration.data?.errors) && badDuration.data.errors.length > 0);

    const overlapping = await client.put('/api/calendar/settings', {
      availabilityWindows: [
        { day: 'Monday', startTime: '09:00', endTime: '13:00', isActive: true },
        { day: 'Monday', startTime: '12:00', endTime: '17:00', isActive: true },
      ],
    });
    check('Overlapping windows rejected via real HTTP (422)', overlapping.status === 422, `got ${overlapping.status}`);

    const badTimezone = await client.put('/api/calendar/settings', { timezone: 'Fake/Zone' });
    check('Invalid timezone rejected via real HTTP (422)', badTimezone.status === 422, `got ${badTimezone.status}`);

    // ═══════════════════════════════════════════════════════════════════════
    //  Part C — PUT actually persists, and preferences MERGE not REPLACE
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  Part C — PUT persists correctly; preferences merge (not replace)');
    console.log('═══════════════════════════════════════════════════\n');

    const fullUpdate = await client.put('/api/calendar/settings', {
      defaultMeetingDurationMinutes: 45,
      bufferMinutes: 10,
      timezone: 'America/New_York',
      preferences: { oneMeetingPerLead: false, sendConfirmationEmail: true },
    });
    check('Full update accepted (200)', fullUpdate.status === 200, `got ${fullUpdate.status}`);
    check('defaultMeetingDurationMinutes updated', fullUpdate.data?.data?.defaultMeetingDurationMinutes === 45);
    check('timezone updated', fullUpdate.data?.data?.timezone === 'America/New_York');
    check('preferences.oneMeetingPerLead updated to false', fullUpdate.data?.data?.preferences?.oneMeetingPerLead === false);
    check('preferences.sendConfirmationEmail updated to true', fullUpdate.data?.data?.preferences?.sendConfirmationEmail === true);
    check('preferences.autoConfirm was untouched by this partial update (still present, not wiped)', typeof fullUpdate.data?.data?.preferences?.autoConfirm === 'boolean');

    const partialUpdate = await client.put('/api/calendar/settings', {
      preferences: { allowCancel: false },
    });
    check('Partial preferences update accepted', partialUpdate.status === 200, `got ${partialUpdate.status}`);
    check('allowCancel updated to false', partialUpdate.data?.data?.preferences?.allowCancel === false);
    check(
      'oneMeetingPerLead from the PREVIOUS update (false) was preserved, not reset to schema default (true) — proves merge, not replace',
      partialUpdate.data?.data?.preferences?.oneMeetingPerLead === false
    );

    const reGet = await client.get('/api/calendar/settings');
    check(
      'GET after PUT reflects the persisted changes (not just the PUT response)',
      reGet.data?.data?.defaultMeetingDurationMinutes === 45 && reGet.data?.data?.timezone === 'America/New_York'
    );
  } finally {
    // ── Restore original state ──────────────────────────────────────────
    if (originalSnapshot) {
      const { _id, __v, createdAt, updatedAt, ...restorable } = originalSnapshot;
      await MeetingSlot.updateOne({ admin: admin._id }, { $set: restorable });
    } else {
      await MeetingSlot.deleteOne({ admin: admin._id });
    }
    console.log('\nℹ️  Restored original MeetingSlot state.');
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