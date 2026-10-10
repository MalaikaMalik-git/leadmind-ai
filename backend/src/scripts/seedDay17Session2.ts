// backend/src/scripts/seedDay17Session2.ts
//
// LeadMind AI — Day 17, Session 2 seed script
// Run with: npm run test:day17:s2:seed
//
// Creates a self-contained, idempotent test dataset for the three new
// analytics endpoints:
//   • 1 test Campaign (marker: TEST_CAMPAIGN_MARKER — safe to re-run, old
//     data under this marker is wiped first)
//   • 4 test Leads
//   • 4 CallLogs:
//       - 3 already "Completed" with real durations, for deterministic
//         aggregation testing (avg call duration, conversion rate)
//       - 1 left "Initiated" with vapiCallId=WEBHOOK_TEST_CALL_ID — fire the
//         curl command printed at the end of this script to drive it
//         through the REAL webhook pipeline and prove the Day 17, Session 2
//         wiring (analyzeAndPersistTopics) actually runs end-to-end
//   • 3 Transcripts (for the 3 completed CallLogs) with detectedTopics
//     pre-set, simulating what the AI service would have returned
//   • 1 Meeting, to give conversion-rate something other than zero

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
const Admin = require('../models/Admin');
const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');
const Transcript = require('../models/Transcript');
const Meeting = require('../models/Meeting');

export const TEST_CAMPAIGN_MARKER = 'Day17 Session2 — Analytics Test Campaign';
export const WEBHOOK_TEST_CALL_ID = 'day17-s2-webhook-test-call-001';

// Guarded: checkDay17Session2.ts imports TEST_CAMPAIGN_MARKER and
// WEBHOOK_TEST_CALL_ID from this file. Without this guard, that import
// would silently re-execute run() in the background on every check-script
// run — re-wiping and re-seeding data mid-check, and eventually killing the
// whole process via the process.exit() calls below. (See project memory:
// "IIFE at module level causes silent re-seeding.")
async function run() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('✅ MongoDB connected\n');

  const admin = await Admin.findOne({ email: process.env.SEED_ADMIN_EMAIL || 'admin@leadmind.ai' });
  if (!admin) {
    console.error('❌ No seeded admin found — run `npm run seed` first.');
    process.exit(1);
  }

  // ── Wipe previous Day 17 Session 2 test data (idempotent re-seed) ────────
  const previous = await Campaign.findOne({ name: TEST_CAMPAIGN_MARKER }).setOptions({ _includeDeleted: true });
  if (previous) {
    const leadIds = (await Lead.find({ campaign: previous._id }).select('_id')).map((l: any) => l._id);
    await Transcript.deleteMany({ campaign: previous._id });
    await CallLog.deleteMany({ campaign: previous._id });
    await Meeting.deleteMany({ campaign: previous._id });
    await Lead.deleteMany({ _id: { $in: leadIds } });
    await Campaign.deleteOne({ _id: previous._id });
    console.log('🧹 Cleared previous Day 17 Session 2 test data\n');
  }

  // ── Campaign ───────────────────────────────────────────────────────────────
  const campaign = await Campaign.create({
    name: TEST_CAMPAIGN_MARKER,
    goal: 'Verify UC-09 analytics aggregation endpoints (Day 17, Session 2)',
    tone: 'Professional',
    instructions: 'Test campaign — not used for real calling.',
    dailyCallLimit: 50,
    status: 'Completed',
    createdBy: admin._id,
  });
  console.log(`📁 Campaign created: ${campaign._id}`);

  // ── Leads ──────────────────────────────────────────────────────────────────
  const [lead1, lead2, lead3, lead4] = await Lead.create([
    { fullName: 'Analytics Test Lead 1', phone: '+15550001001', campaign: campaign._id, status: 'Qualified' },
    { fullName: 'Analytics Test Lead 2', phone: '+15550001002', campaign: campaign._id, status: 'Qualified' },
    { fullName: 'Analytics Test Lead 3', phone: '+15550001003', campaign: campaign._id, status: 'Not Qualified' },
    { fullName: 'Analytics Test Lead 4', phone: '+15550001004', campaign: campaign._id, status: 'Pending' },
  ]);
  console.log(`👤 4 leads created`);

  const now = new Date();

  // ── CallLogs 1-3: already Completed, for deterministic aggregation ────────
  const callLog1 = await CallLog.create({
    lead: lead1._id, campaign: campaign._id, callType: 'Outbound', status: 'Completed',
    toNumber: lead1.phone, durationSeconds: 180,
    initiatedAt: now, answeredAt: now, endedAt: now,
  });
  const callLog2 = await CallLog.create({
    lead: lead2._id, campaign: campaign._id, callType: 'Outbound', status: 'Completed',
    toNumber: lead2.phone, durationSeconds: 240,
    initiatedAt: now, answeredAt: now, endedAt: now,
  });
  const callLog3 = await CallLog.create({
    lead: lead3._id, campaign: campaign._id, callType: 'Outbound', status: 'Completed',
    toNumber: lead3.phone, durationSeconds: 60,
    initiatedAt: now, answeredAt: now, endedAt: now,
  });
  console.log(`📞 3 completed CallLogs created (durations: 180s, 240s, 60s)`);

  // ── CallLog 4: left pending — completed live via the webhook curl below ───
  const callLog4 = await CallLog.create({
    lead: lead4._id, campaign: campaign._id, callType: 'Outbound', status: 'Initiated',
    toNumber: lead4.phone, vapiCallId: WEBHOOK_TEST_CALL_ID, initiatedAt: now,
  });
  console.log(`📞 1 pending CallLog created for live webhook test (vapiCallId=${WEBHOOK_TEST_CALL_ID})`);

  // ── Transcripts for CallLogs 1-3, with detectedTopics pre-set ─────────────
  const transcript1 = await Transcript.create({
    lead: lead1._id, campaign: campaign._id, callLog: callLog1._id,
    callType: 'Outbound', callDate: now, durationSeconds: 180, finalStatus: 'Qualified',
    messages: [
      { speaker: 'Lead', text: 'We need a mobile app for our delivery riders.' },
      { speaker: 'AI', text: 'Got it, a mobile app — noted.' },
    ],
    detectedTopics: ['Mobile App'],
  });
  const transcript2 = await Transcript.create({
    lead: lead2._id, campaign: campaign._id, callLog: callLog2._id,
    callType: 'Outbound', callDate: now, durationSeconds: 240, finalStatus: 'Qualified',
    messages: [
      { speaker: 'Lead', text: 'We want a CRM system, and maybe a companion mobile app later.' },
    ],
    detectedTopics: ['Mobile App', 'CRM'],
  });
  const transcript3 = await Transcript.create({
    lead: lead3._id, campaign: campaign._id, callLog: callLog3._id,
    callType: 'Outbound', callDate: now, durationSeconds: 60, finalStatus: 'Not Qualified',
    messages: [
      { speaker: 'Lead', text: 'Just exploring an online store idea, an e-commerce marketplace.' },
    ],
    detectedTopics: ['E-commerce'],
  });

  await CallLog.updateOne({ _id: callLog1._id }, { $set: { transcript: transcript1._id, finalLeadStatus: 'Qualified' } });
  await CallLog.updateOne({ _id: callLog2._id }, { $set: { transcript: transcript2._id, finalLeadStatus: 'Qualified' } });
  await CallLog.updateOne({ _id: callLog3._id }, { $set: { transcript: transcript3._id, finalLeadStatus: 'Not Qualified' } });
  console.log(`💬 3 transcripts created with detectedTopics: [Mobile App], [Mobile App, CRM], [E-commerce]`);

  // ── Meeting — gives conversion-rate a non-zero numerator ──────────────────
  const meeting = await Meeting.create({
    lead: lead1._id,
    campaign: campaign._id,
    transcript: transcript1._id,
    scheduledAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    durationMinutes: 30,
    timezone: 'Asia/Karachi',
    status: 'Scheduled',
    leadSnapshot: { fullName: lead1.fullName, phone: lead1.phone },
  });
  console.log(`📅 1 Meeting created\n`);

  console.log('═══════════════════════════════════════════════════');
  console.log('  Seed complete');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Campaign ID : ${campaign._id}`);
  console.log(`  Meeting ID  : ${meeting._id}\n`);

  console.log('Next steps:');
  console.log('  1. Run the check script now for the deterministic aggregation checks:');
  console.log('       npm run test:day17:s2:check\n');
  console.log('  2. (Optional but recommended) Prove the live webhook wiring by firing');
  console.log('     this curl command, THEN re-running the check script — it will report');
  console.log('     that detectedTopics was populated by the real AI service call:\n');
  console.log(`curl -i -X POST http://localhost:${process.env.PORT || 8000}/api/webhooks/vapi \\
  -H "Content-Type: application/json" \\
  -H "x-vapi-secret: ${process.env.VAPI_WEBHOOK_SECRET || '<your VAPI_WEBHOOK_SECRET>'}" \\
  -d '{
    "message": {
      "type": "end-of-call-report",
      "call": { "id": "${WEBHOOK_TEST_CALL_ID}" },
      "endedReason": "customer-ended-call",
      "durationSeconds": 95,
      "artifact": {
        "messages": [
          { "role": "assistant", "message": "What are you looking to build?" },
          { "role": "user", "message": "We want an ERP system to manage inventory, and possibly a CRM down the line." }
        ]
      }
    }
  }'`);
  console.log('\n');

  process.exit(0);
}

if (require.main === module) {
  run().catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  });
}