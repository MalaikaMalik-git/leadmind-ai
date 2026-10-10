// backend/src/scripts/checkDay21Session1.ts
//
// LeadMind AI — Day 21, Session 1 verification
// Run with: npm run test:day21:s1:check
//
// Requires: backend running (npm run dev), MongoDB connected, AND
// npm run migrate:calllog-index already run once against this database.
//
// Part A — Index behavior (direct DB, no HTTP): proves the actual bug/fix
// this session is built around — multiple CallLogs with no vapiCallId yet
// (the normal outbound pre-dial state) can coexist, while two CallLogs
// sharing the same REAL vapiCallId are correctly rejected.
//
// Part B — Idempotency (HTTP): fires the exact same end-of-call-report
// payload twice for one call and proves the second delivery does NOT
// create a second Transcript, does NOT double-increment Campaign.stats,
// and is detected as a duplicate rather than silently reprocessed.
//
// Part C — Genuine concurrency: fires TWO requests for a brand-new inbound
// call's first event AT THE SAME TIME (Promise.all, not sequential) and
// proves exactly one Lead and one CallLog resulted — not a simulated
// race, an actual one.

import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import mongoose from 'mongoose';
const Admin = require('../models/Admin');
const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');
const Transcript = require('../models/Transcript');
import { signAccessToken } from '../utils/jwt';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;
const MARKER = 'Day21 Session1 — Race Condition Test';

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
  const campaigns = await Campaign.find({ name: { $regex: `^${MARKER}` } }).setOptions({ _includeDeleted: true });
  const campaignIds = campaigns.map((c: any) => c._id);
  const leads = await Lead.find({ $or: [{ campaign: { $in: campaignIds } }, { fullName: { $regex: `^${MARKER}` } }, { phone: { $regex: '^\\+1555999' } }] });
  const leadIds = leads.map((l: any) => l._id);

  await Transcript.deleteMany({ lead: { $in: leadIds } });
  await CallLog.deleteMany({ lead: { $in: leadIds } });
  await Lead.deleteMany({ _id: { $in: leadIds } });
  await Campaign.deleteMany({ _id: { $in: campaignIds } });
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  await cleanup();

  const admin = await Admin.findOne({ email: process.env.SEED_ADMIN_EMAIL || 'admin@leadmind.ai' });
  if (!admin) {
    console.error('❌ No seeded admin found — run `npm run seed` first.');
    process.exit(1);
  }
  const token = signAccessToken({ adminId: admin._id.toString(), email: admin.email });
  const client = axios.create({ baseURL: BASE_URL, headers: { 'Content-Type': 'application/json', 'x-vapi-secret': VAPI_WEBHOOK_SECRET }, validateStatus: () => true });

  // ═══════════════════════════════════════════════════════════════════════
  //  Part A — Index behavior (direct DB)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Part A — vapiCallId index: nulls OK, real duplicates rejected');
  console.log('═══════════════════════════════════════════════════\n');

  const dummyLead = await Lead.create({ fullName: `${MARKER} Dummy Lead`, phone: '+15559990099', status: 'Pending' });

  let multipleNullsOk = true;
  try {
    await CallLog.create({ lead: dummyLead._id, callType: 'Outbound', status: 'Initiated', toNumber: dummyLead.phone });
    await CallLog.create({ lead: dummyLead._id, callType: 'Outbound', status: 'Initiated', toNumber: dummyLead.phone });
    await CallLog.create({ lead: dummyLead._id, callType: 'Outbound', status: 'Initiated', toNumber: dummyLead.phone });
  } catch (err: any) {
    multipleNullsOk = false;
    console.log('  (error was:', err.message.slice(0, 150), ')');
  }
  check(
    'THREE CallLogs with no vapiCallId yet (the normal pre-dial state) can coexist — this is the exact scenario that would have broken outbound calling with a plain sparse index',
    multipleNullsOk
  );

  const realId = `day21-s1-real-id-${Date.now()}`;
  await CallLog.create({ lead: dummyLead._id, callType: 'Outbound', status: 'Completed', toNumber: dummyLead.phone, vapiCallId: realId });

  let duplicateRealIdRejected = false;
  try {
    await CallLog.create({ lead: dummyLead._id, callType: 'Outbound', status: 'Completed', toNumber: dummyLead.phone, vapiCallId: realId });
  } catch (err: any) {
    duplicateRealIdRejected = err.code === 11000;
  }
  check('A duplicate REAL vapiCallId is correctly rejected at the DB level (unique constraint works)', duplicateRealIdRejected);

  // ═══════════════════════════════════════════════════════════════════════
  //  Part B — Idempotency: same end-of-call-report delivered twice
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Part B — Duplicate end-of-call-report is NOT reprocessed');
  console.log('═══════════════════════════════════════════════════\n');

  const campaign = await Campaign.create({
    name: `${MARKER} Campaign`, goal: 'Verify idempotency', tone: 'Professional',
    instructions: 'Test campaign.', dailyCallLimit: 50, status: 'Running', createdBy: admin._id,
  });
  const lead = await Lead.create({ fullName: `${MARKER} Lead`, phone: '+15559990001', campaign: campaign._id, status: 'Pending' });
  const vapiCallId = `day21-s1-idempotency-${Date.now()}`;
  await CallLog.create({ lead: lead._id, campaign: campaign._id, callType: 'Outbound', status: 'Initiated', toNumber: lead.phone, vapiCallId, attemptNumber: 1 });

  const statsBefore = { ...(await Campaign.findById(campaign._id)).toObject().stats };

  const eocrPayload = {
    message: {
      type: 'end-of-call-report',
      call: { id: vapiCallId, type: 'outboundPhoneCall', customer: { number: lead.phone } },
      endedReason: 'customer-ended-call',
      durationSeconds: 60,
      artifact: {
        messages: [
          { role: 'assistant', message: 'Hi, is this a good time to talk about your project?' },
          { role: 'user', message: 'Sure, we need a web app, budget is 10000, timeline 2 months, I decide.' },
        ],
      },
    },
  };

  const first = await client.post('/api/webhooks/vapi', eocrPayload);
  check('First delivery accepted (200)', first.status === 200, `got ${first.status}`);
  await new Promise((r) => setTimeout(r, 1500));

  const transcriptsAfterFirst = await Transcript.countDocuments({ vapiCallId });
  check('Exactly 1 Transcript exists after the first delivery', transcriptsAfterFirst === 1, `got ${transcriptsAfterFirst}`);

  const callLogAfterFirst = await CallLog.findOne({ vapiCallId });
  check('CallLog.endOfCallProcessedAt is set after the first delivery', !!callLogAfterFirst.endOfCallProcessedAt);
  const processedAtFirst = callLogAfterFirst.endOfCallProcessedAt?.getTime();

  // ── Fire the EXACT SAME event again ───────────────────────────────────
  const second = await client.post('/api/webhooks/vapi', eocrPayload);
  check('Second (duplicate) delivery still returns 200 (Vapi should not see an error)', second.status === 200, `got ${second.status}`);
  await new Promise((r) => setTimeout(r, 1500));

  const transcriptsAfterSecond = await Transcript.countDocuments({ vapiCallId });
  check(
    'STILL exactly 1 Transcript after the duplicate delivery — this is the actual bug fix',
    transcriptsAfterSecond === 1,
    `got ${transcriptsAfterSecond} (if this is 2, the idempotency guard did not work)`
  );

  const callLogAfterSecond = await CallLog.findOne({ vapiCallId });
  check(
    'endOfCallProcessedAt timestamp is UNCHANGED (proves the second delivery never re-claimed it)',
    callLogAfterSecond.endOfCallProcessedAt?.getTime() === processedAtFirst
  );

  const campaignAfter = await Campaign.findById(campaign._id);
  const qualifiedDelta = campaignAfter.stats.qualified - statsBefore.qualified;
  const notQualifiedDelta = campaignAfter.stats.notQualified - statsBefore.notQualified;
  check(
    'Campaign.stats.qualified/notQualified incremented by exactly 1 total, not 2 (no double-counting from the duplicate)',
    qualifiedDelta + notQualifiedDelta === 1,
    `qualified delta=${qualifiedDelta}, notQualified delta=${notQualifiedDelta}`
  );

  // ═══════════════════════════════════════════════════════════════════════
  //  Part C — Genuine concurrency: two simultaneous first-events for one
  //  brand-new inbound call
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Part C — Real concurrent race: brand-new inbound call, two');
  console.log('  simultaneous events (not simulated — actually parallel)');
  console.log('═══════════════════════════════════════════════════\n');

  const raceCallId = `day21-s1-race-${Date.now()}`;
  const racePhone = '+15559990002';

  const raceEvent = {
    message: {
      type: 'status-update',
      status: 'ringing',
      call: { id: raceCallId, type: 'inboundPhoneCall', customer: { number: racePhone } },
      phoneNumber: { number: '+14153903418' },
    },
  };

  // Fired with Promise.all — genuinely concurrent from this process's
  // perspective, both requests in flight before either resolves.
  const [raceResp1, raceResp2] = await Promise.all([
    client.post('/api/webhooks/vapi', raceEvent),
    client.post('/api/webhooks/vapi', raceEvent),
  ]);

  check('Both concurrent requests returned 200 (neither crashed)', raceResp1.status === 200 && raceResp2.status === 200, `got ${raceResp1.status}, ${raceResp2.status}`);

  await new Promise((r) => setTimeout(r, 1500));

  const raceCallLogCount = await CallLog.countDocuments({ vapiCallId: raceCallId });
  check('Exactly 1 CallLog exists for the raced call (not 2)', raceCallLogCount === 1, `got ${raceCallLogCount}`);

  const raceLeadCount = await Lead.countDocuments({ phone: racePhone });
  check(
    'Exactly 1 Lead exists for the racing phone number (a KNOWN, narrower limitation flagged in Session 1 notes — usually holds in practice, see webhookController.ts comments for why a full fix is deferred)',
    raceLeadCount === 1,
    `got ${raceLeadCount}`
  );

  await cleanup();
  await Lead.deleteMany({ phone: racePhone });
  await CallLog.deleteMany({ vapiCallId: raceCallId });

  console.log('\n───────────────────────────────────────────────────────────');
  console.log(`  Results: ${pass} passed, ${fail} failed`);
  console.log('───────────────────────────────────────────────────────────\n');

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('❌ Check failed:', err);
  process.exit(1);
});