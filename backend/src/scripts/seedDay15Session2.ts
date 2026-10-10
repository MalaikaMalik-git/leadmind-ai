// backend/src/scripts/seedDay15Session2.ts
//
// Day 15, Session 2 verification helper (part 1 of 2 for the LIVE proof)
// Run with: npm run test:day15:s2:seed
//
// Creates a test campaign with:
//   • Lead A — already "on a call" (mirrors what placeOutboundCallForLead
//     does right before dialing), with a known vapiCallId so you can fire a
//     simulated end-of-call-report at it.
//   • Lead B — status Pending, sitting in the queue.
//
// After you fire the printed curl command at your running `npm run dev`
// server, the webhook handler should:
//   1. Mark Lead A "No Answer" and schedule a retry ~30 min out.
//   2. Auto-advance and attempt to dial Lead B immediately (Session 2).
//
// Lead B's phone number is fake and the campaign's vapiAssistantId is a
// placeholder, so VAPI WILL reject that second call attempt — that's
// expected and fine here. We're proving the auto-advance TRIGGER fires,
// not placing a real successful call (the live-call verification is
// intentionally on hold until after Day 15, per the Vonage swap plan).

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
const Admin = require('../models/Admin');
const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');

export const TEST_VAPI_CALL_ID = 'test-vapi-call-day15-s2';
const CAMPAIGN_MARKER = '__TEST__ Day15 Session2 Live Webhook Proof';

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('✅ MongoDB connected\n');

    const admin = await Admin.findOne({ email: process.env.SEED_ADMIN_EMAIL || 'admin@leadmind.ai' });
    if (!admin) {
      console.log('❌ Seeded admin not found — run `npm run seed` first.');
      process.exit(1);
    }

    // ── Clean up any previous run ─────────────────────────────────────────
    const oldCampaign = await Campaign.findOne({ name: CAMPAIGN_MARKER });
    if (oldCampaign) {
      await CallLog.deleteMany({ campaign: oldCampaign._id });
      await Lead.deleteMany({ campaign: oldCampaign._id });
      await Campaign.deleteOne({ _id: oldCampaign._id });
      console.log('🧹 Removed previous test data\n');
    }

    // ── Create the test campaign — Running, with a placeholder assistant ───
    const campaign = await Campaign.create({
      name: CAMPAIGN_MARKER,
      goal: 'Verify webhook auto-advance',
      tone: 'Professional',
      instructions: 'Test campaign — safe to delete.',
      dailyCallLimit: 10,
      status: 'Running',
      vapiAssistantId: 'test-assistant-id', // placeholder — VAPI will reject Lead B's call, which is expected
      createdBy: admin._id,
    });

    // ── Lead A: already "in a call" — mirrors placeOutboundCallForLead's state ──
    const leadA = await Lead.create({
      fullName: 'Test Lead A (in-call)',
      phone: '+10000000001',
      campaign: campaign._id,
      status: 'Calling',
      source: 'Manual Entry',
    });

    const callLogA = await CallLog.create({
      lead: leadA._id,
      campaign: campaign._id,
      callType: 'Outbound',
      status: 'Initiated',
      toNumber: leadA.phone,
      vapiCallId: TEST_VAPI_CALL_ID,
      vapiAssistantId: 'test-assistant-id',
      attemptNumber: 1,
    });

    // ── Lead B: waiting in the queue — should get auto-dialed once A ends ──
    const leadB = await Lead.create({
      fullName: 'Test Lead B (pending)',
      phone: '+10000000002',
      campaign: campaign._id,
      status: 'Pending',
      source: 'Manual Entry',
    });

    console.log('✅ Campaign created:', campaign._id.toString());
    console.log('✅ Lead A (in-call) created:', leadA._id.toString());
    console.log('✅ CallLog A created:', callLogA._id.toString());
    console.log('✅ Lead B (pending) created:', leadB._id.toString());
    console.log('\nNow, with `npm run dev` running in another terminal, fire this curl command');
    console.log('to simulate VAPI reporting that Lead A\'s call ended with no answer:\n');

    console.log(`curl -i -X POST http://localhost:8000/api/webhooks/vapi \\
  -H "Content-Type: application/json" \\
  -H "x-vapi-secret: ${process.env.VAPI_WEBHOOK_SECRET || '<your VAPI_WEBHOOK_SECRET>'}" \\
  -d '{
    "message": {
      "type": "end-of-call-report",
      "call": { "id": "${TEST_VAPI_CALL_ID}" },
      "endedReason": "customer-did-not-answer",
      "durationSeconds": 0,
      "artifact": { "messages": [] }
    }
  }'
`);

    console.log('Then run: npm run test:day15:s2:check\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  }
})();