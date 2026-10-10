// backend/src/scripts/checkDay26Session1.ts
//
// LeadMind AI — Day 26, Session 1 verification
// (Profile & Settings API + Audit Log subsystem + Calendar disconnect —
//  Session 1 merged with what was originally scoped as Session 2)
//
// Run with: npm run test:day26:s1:check
//
// Requires: backend running (npm run dev) AND MongoDB connected, AND the
// seeded admin's real password known (SEED_ADMIN_PASSWORD, defaults to
// seed.js's 'Admin@123456') — the password-change tests log in and change
// the password for real, then change it back, so this must match whatever
// the seeded admin's password actually is.

import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import mongoose from 'mongoose';
const Admin = require('../models/Admin');
const AuditLog = require('../models/AuditLog');
import { signAccessToken } from '../utils/jwt';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const SEED_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@leadmind.ai';
const SEED_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin@123456';

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
  const admin = await Admin.findOne({ email: SEED_EMAIL });
  if (!admin) {
    console.error('❌ No seeded admin found — run `npm run seed` first.');
    process.exit(1);
  }
  const token = signAccessToken({ adminId: String(admin._id), email: admin.email });
  const client = axios.create({ baseURL: BASE_URL, headers: { Authorization: `Bearer ${token}` }, validateStatus: () => true });

  // Snapshots to restore afterward — this script mutates real Admin fields.
  const originalProfile = { name: admin.name, avatar: admin.avatar };
  const originalSettings = { timezone: admin.timezone, notifications: { ...admin.notifications.toObject?.() ?? admin.notifications } };
  const originalCalendarDoc = await Admin.findById(admin._id).select(
    '+googleCalendar.accessToken +googleCalendar.refreshToken'
  );
  const originalCalendarSnapshot = originalCalendarDoc.googleCalendar.toObject
    ? originalCalendarDoc.googleCalendar.toObject()
    : originalCalendarDoc.googleCalendar;

  try {
    // ═══════════════════════════════════════════════════════════════════════
    //  Part A — Profile (GET/PATCH /api/auth/me)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  Part A — GET/PATCH /api/auth/me');
    console.log('═══════════════════════════════════════════════════\n');

    const noAuthMe = await axios.get(`${BASE_URL}/api/auth/me`, { validateStatus: () => true });
    check('GET /me requires auth (401 without a token)', noAuthMe.status === 401, `got ${noAuthMe.status}`);

    const getMe = await client.get('/api/auth/me');
    check('GET /me returns 200', getMe.status === 200, `got ${getMe.status}`);
    check('Response includes avatar field (toPublicProfile)', 'avatar' in (getMe.data?.admin ?? {}));
    check('Response includes timezone field', typeof getMe.data?.admin?.timezone === 'string');
    check('Response includes notifications object', typeof getMe.data?.admin?.notifications === 'object');

    const emptyPatch = await client.patch('/api/auth/me', {});
    check('PATCH /me with no fields rejected (422)', emptyPatch.status === 422, `got ${emptyPatch.status}`);

    const blankName = await client.patch('/api/auth/me', { name: '   ' });
    check('PATCH /me with blank name rejected (422)', blankName.status === 422, `got ${blankName.status}`);

    const validPatch = await client.patch('/api/auth/me', { name: 'Test Name Day26', avatar: 'https://example.com/a.png' });
    check('PATCH /me with valid fields accepted (200)', validPatch.status === 200, `got ${validPatch.status}`);
    check('name persisted in response', validPatch.data?.admin?.name === 'Test Name Day26');
    check('avatar persisted in response', validPatch.data?.admin?.avatar === 'https://example.com/a.png');

    const reGetMe = await client.get('/api/auth/me');
    check('GET /me after PATCH reflects persisted change (not just PATCH response)', reGetMe.data?.admin?.name === 'Test Name Day26');

    // ═══════════════════════════════════════════════════════════════════════
    //  Part B — Change Password (PATCH /api/auth/change-password)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  Part B — PATCH /api/auth/change-password');
    console.log('═══════════════════════════════════════════════════\n');

    const missingFields = await client.patch('/api/auth/change-password', {});
    check('Missing fields rejected (422)', missingFields.status === 422, `got ${missingFields.status}`);

    const tooShort = await client.patch('/api/auth/change-password', {
      currentPassword: SEED_PASSWORD,
      newPassword: 'short',
    });
    check('New password under 8 chars rejected (422)', tooShort.status === 422, `got ${tooShort.status}`);

    const samePassword = await client.patch('/api/auth/change-password', {
      currentPassword: SEED_PASSWORD,
      newPassword: SEED_PASSWORD,
    });
    check('New password same as current rejected (422)', samePassword.status === 422, `got ${samePassword.status}`);

    const wrongCurrent = await client.patch('/api/auth/change-password', {
      currentPassword: 'DefinitelyWrong123',
      newPassword: 'TempPassw0rd!',
    });
    check('Wrong current password rejected (401)', wrongCurrent.status === 401, `got ${wrongCurrent.status}`);

    const TEMP_PASSWORD = 'TempPassw0rd!Day26';
    const realChange = await client.patch('/api/auth/change-password', {
      currentPassword: SEED_PASSWORD,
      newPassword: TEMP_PASSWORD,
    });
    check('Real password change accepted (200)', realChange.status === 200, `got ${realChange.status}`);

    const loginWithNew = await axios.post(`${BASE_URL}/api/auth/login`, { email: SEED_EMAIL, password: TEMP_PASSWORD }, { validateStatus: () => true });
    check('Login with NEW password succeeds', loginWithNew.status === 200, `got ${loginWithNew.status}`);

    // Restore original password (using a fresh token, since change-password
    // clears refreshToken but the Bearer access token this script signed is
    // still independently valid until its own 15m expiry).
    const revertPassword = await client.patch('/api/auth/change-password', {
      currentPassword: TEMP_PASSWORD,
      newPassword: SEED_PASSWORD,
    });
    check('Password reverted back to original', revertPassword.status === 200, `got ${revertPassword.status}`);

    // ═══════════════════════════════════════════════════════════════════════
    //  Part C — Settings (GET/PATCH /api/auth/settings)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  Part C — GET/PATCH /api/auth/settings');
    console.log('═══════════════════════════════════════════════════\n');

    const getSettings = await client.get('/api/auth/settings');
    check('GET /settings returns 200', getSettings.status === 200, `got ${getSettings.status}`);
    check('Response includes timezone', typeof getSettings.data?.data?.timezone === 'string');
    check('Response includes notifications', typeof getSettings.data?.data?.notifications === 'object');

    const badTimezone = await client.patch('/api/auth/settings', { timezone: 'Fake/Zone' });
    check('Invalid timezone rejected (422)', badTimezone.status === 422, `got ${badTimezone.status}`);

    const badNotifKey = await client.patch('/api/auth/settings', { notifications: { notARealKey: true } });
    check('Unknown notification key rejected (422)', badNotifKey.status === 422, `got ${badNotifKey.status}`);

    const badNotifType = await client.patch('/api/auth/settings', { notifications: { qualifiedLeadAlert: 'yes' } });
    check('Non-boolean notification value rejected (422)', badNotifType.status === 422, `got ${badNotifType.status}`);

    const settingsUpdate1 = await client.patch('/api/auth/settings', {
      timezone: 'America/New_York',
      notifications: { qualifiedLeadAlert: false, meetingBookedAlert: true },
    });
    check('Valid settings update accepted (200)', settingsUpdate1.status === 200, `got ${settingsUpdate1.status}`);
    check('timezone updated', settingsUpdate1.data?.data?.timezone === 'America/New_York');
    check('qualifiedLeadAlert updated to false', settingsUpdate1.data?.data?.notifications?.qualifiedLeadAlert === false);

    const settingsUpdate2 = await client.patch('/api/auth/settings', {
      notifications: { campaignCompletedAlert: false },
    });
    check('Partial notifications update accepted', settingsUpdate2.status === 200, `got ${settingsUpdate2.status}`);
    check(
      'qualifiedLeadAlert from the PREVIOUS update was preserved (merge, not replace)',
      settingsUpdate2.data?.data?.notifications?.qualifiedLeadAlert === false
    );

    // ═══════════════════════════════════════════════════════════════════════
    //  Part D — Audit Log (GET /api/audit-log)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  Part D — GET /api/audit-log');
    console.log('═══════════════════════════════════════════════════\n');

    // The login calls in Part B (both real logins) should have written
    // admin.login entries already. Trigger one more explicitly here too.
    await axios.post(`${BASE_URL}/api/auth/login`, { email: SEED_EMAIL, password: SEED_PASSWORD }, { validateStatus: () => true });

    const noAuthLog = await axios.get(`${BASE_URL}/api/audit-log`, { validateStatus: () => true });
    check('GET /audit-log requires auth (401 without a token)', noAuthLog.status === 401, `got ${noAuthLog.status}`);

    const auditList = await client.get('/api/audit-log');
    check('GET /audit-log returns 200', auditList.status === 200, `got ${auditList.status}`);
    check('Response includes a data array', Array.isArray(auditList.data?.data));
    check('Response includes pagination metadata', typeof auditList.data?.pagination?.total === 'number');
    check('At least one admin.login entry exists', auditList.data?.data?.some((e: any) => e.action === 'admin.login'));

    const filteredLog = await client.get('/api/audit-log?action=admin.login&limit=5');
    check('Filtering by action=admin.login returns only login entries', filteredLog.data?.data?.every((e: any) => e.action === 'admin.login'));

    // ═══════════════════════════════════════════════════════════════════════
    //  Part E — Calendar Disconnect (DELETE /api/calendar/disconnect)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  Part E — DELETE /api/calendar/disconnect');
    console.log('═══════════════════════════════════════════════════\n');

    const noConfirm = await client.delete('/api/calendar/disconnect', { data: {} });
    check('Disconnect without confirm rejected (400)', noConfirm.status === 400, `got ${noConfirm.status}`);

    const withConfirm = await client.delete('/api/calendar/disconnect', { data: { confirm: true } });
    check('Disconnect with confirm accepted (200)', withConfirm.status === 200, `got ${withConfirm.status}`);

    const statusAfter = await client.get('/api/calendar/status');
    check('Calendar status shows isConnected: false after disconnect', statusAfter.data?.data?.isConnected === false);
    check('calendarEmail cleared after disconnect', statusAfter.data?.data?.calendarEmail === null);

    // ═══════════════════════════════════════════════════════════════════════
    //  Part F — Integrations (GET /api/auth/integrations)  (Day 26, Session 3)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  Part F — GET /api/auth/integrations');
    console.log('═══════════════════════════════════════════════════\n');

    const noAuthIntegrations = await axios.get(`${BASE_URL}/api/auth/integrations`, { validateStatus: () => true });
    check('Requires auth (401 without a token)', noAuthIntegrations.status === 401, `got ${noAuthIntegrations.status}`);

    const integrations = await client.get('/api/auth/integrations');
    check('GET /integrations returns 200', integrations.status === 200, `got ${integrations.status}`);
    check('Response includes vapiApiKey.configured (boolean)', typeof integrations.data?.data?.vapiApiKey?.configured === 'boolean');
    check('Response includes googleClientId.configured (boolean)', typeof integrations.data?.data?.googleClientId?.configured === 'boolean');
    check(
      'Masked value never equals the raw env value (VAPI)',
      integrations.data?.data?.vapiApiKey?.masked !== process.env.VAPI_API_KEY
    );
    check(
      'Masked value contains a mask character when configured',
      !integrations.data?.data?.vapiApiKey?.configured || String(integrations.data?.data?.vapiApiKey?.masked).includes('•')
    );
  } finally {
    // ── Restore original state ──────────────────────────────────────────
    await Admin.updateOne({ _id: admin._id }, { $set: { name: originalProfile.name, avatar: originalProfile.avatar } });
    await Admin.updateOne({ _id: admin._id }, {
      $set: {
        timezone: originalSettings.timezone,
        notifications: originalSettings.notifications,
        googleCalendar: originalCalendarSnapshot,
      },
    });
    // Test AuditLog entries created by this script are left in place —
    // deliberately: the audit log is meant to be an append-only record,
    // and these entries (real logins, a real campaign-less run) are
    // harmless. Delete manually if you want a clean collection:
    //   db.auditlogs.deleteMany({ actorEmail: "<seed email>" })
    console.log('\nℹ️  Restored original Admin profile/settings/googleCalendar state.');
    console.log('ℹ️  AuditLog entries from this run were left in place (append-only log).');
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
