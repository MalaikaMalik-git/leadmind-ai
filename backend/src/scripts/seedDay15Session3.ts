// backend/src/scripts/seedDay15Session3.ts
//
// Day 15, Session 3 verification helper (part 1 of 2 for the LIVE proof)
// Run with: npm run test:day15:s3:seed
//
// Creates a "stalled queue" scenario: one Running campaign, one lead whose
// last call attempt didn't connect and whose retry window has ALREADY
// passed — and, critically, NO other in-flight call anywhere. Under
// Session 2 alone (webhook-only auto-advance), this lead would simply sit
// there forever, since nothing would ever end a call to trigger the next
// dial. The poller (Session 3) is what wakes it back up on its own timer.
//
// Unlike Session 2's seed script, there is no curl command to fire here —
// that's the point. Just start the server and wait.

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
const Admin = require('../models/Admin');
const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');

const CAMPAIGN_MARKER = '__TEST__ Day15 Session3 Poller Live Proof';

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

    const campaign = await Campaign.create({
      name: CAMPAIGN_MARKER,
      goal: 'Verify poller wakes up a stalled retry',
      tone: 'Professional',
      instructions: 'Test campaign — safe to delete.',
      dailyCallLimit: 10,
      status: 'Running',
      vapiAssistantId: 'test-assistant-id', // placeholder — the retry redial WILL be rejected by VAPI, which is expected
      createdBy: admin._id,
    });

    const lead = await Lead.create({
      fullName: 'Stalled Retry Lead',
      phone: '+10000009999',
      campaign: campaign._id,
      status: 'No Answer',
      source: 'Manual Entry',
    });

    const callLog = await CallLog.create({
      lead: lead._id,
      campaign: campaign._id,
      callType: 'Outbound',
      status: 'No Answer',
      toNumber: lead.phone,
      attemptNumber: 1,
      scheduledRetryAt: new Date(Date.now() - 10 * 1000), // 10 seconds ago — already due
    });

    console.log('✅ Campaign created:', campaign._id.toString());
    console.log('✅ Lead created (retry already due, nothing else in flight):', lead._id.toString());
    console.log('✅ CallLog created:', callLog._id.toString());
    console.log('\nNo curl command this time — that is the point of Session 3.');
    console.log('In another terminal, start the server with a short poll interval:\n');
    console.log('  CAMPAIGN_POLL_INTERVAL_MS=5000 npm run dev\n');
    console.log('Wait about 10-15 seconds (at least one poll tick), then run:');
    console.log('  npm run test:day15:s3:check\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  }
})();