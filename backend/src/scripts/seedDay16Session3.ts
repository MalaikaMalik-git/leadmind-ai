// backend/src/scripts/seedDay16Session3.ts
//
// LeadMind AI — Day 16, Session 3 verification (part 1 of 3)
// Run with: npm run test:day16:s3:seed
//
// Seeds one throwaway test Campaign with two Leads + two CallLogs (each
// with a known vapiCallId):
//   1. HAPPY_PATH_CALL_ID  — fire this while the AI service IS running,
//      to prove real end-to-end scoring through the actual webhook route.
//   2. AI_DOWN_CALL_ID     — fire this while the AI service is STOPPED,
//      to prove the non-blocking failure fallback works (UC-12 A2).
//
// This exercises the real webhook route (POST /api/webhooks/vapi) over
// HTTP, not an in-process function call — `npm run dev` must be running
// in another terminal before you fire the curl commands from chat.
//
// After firing both curl commands, run: npm run test:day16:s3:check

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
const Admin = require('../models/Admin');
const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');

export const HAPPY_PATH_CALL_ID = 'test-day16-happy-001';
export const AI_DOWN_CALL_ID = 'test-day16-aidown-001';
export const TEST_CAMPAIGN_MARKER = '__TEST__ Day16 Session3 Qualification';

// IMPORTANT: checkDay16Session3.ts imports the constants above from this
// file. In Node/TS, importing a file executes the ENTIRE file — so without
// this guard, every run of `npm run test:day16:s3:check` would silently
// re-trigger this whole seeding block as a side effect of that import,
// wiping and recreating the test campaign while check was still reading it.
// This guard ensures the seed logic only runs when this file is executed
// directly (`ts-node src/scripts/seedDay16Session3.ts`), never on import.
if (require.main === module) {
  (async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI!);
      console.log('✅ MongoDB connected\n');

      const admin = await Admin.findOne({ email: process.env.SEED_ADMIN_EMAIL || 'admin@leadmind.ai' });
      if (!admin) {
        console.log('❌ Seeded admin not found — run `npm run seed` first.');
        process.exit(1);
      }

      // Clean up ANY previous runs of this test — deleteMany, not findOne+delete,
      // since earlier interrupted runs (e.g. a DB connection drop mid-seed) can
      // leave more than one leftover campaign with this same marker name. If we
      // only removed one, a stale duplicate could still be sitting in the DB and
      // the check script could end up reading from the wrong one.
      const oldCampaigns = await Campaign.find({ name: TEST_CAMPAIGN_MARKER });
      if (oldCampaigns.length > 0) {
        const oldIds = oldCampaigns.map((c: any) => c._id);
        await CallLog.deleteMany({ campaign: { $in: oldIds } });
        await Lead.deleteMany({ campaign: { $in: oldIds } });
        await Campaign.deleteMany({ _id: { $in: oldIds } });
        console.log(`🧹 Removed ${oldCampaigns.length} previous test campaign(s) and their leads/call logs\n`);
      }

      const campaign = await Campaign.create({
        name: TEST_CAMPAIGN_MARKER,
        goal: 'Verify Day 16 qualification wiring',
        tone: 'Professional',
        instructions: 'Test campaign — safe to delete.',
        dailyCallLimit: 5,
        createdBy: admin._id,
        status: 'Running',
      });

      const leadHappy = await Lead.create({
        fullName: 'Day16 Happy Path Lead',
        phone: '+10000000001',
        campaign: campaign._id,
        source: 'Manual Entry',
        status: 'Calling',
      });

      const leadAiDown = await Lead.create({
        fullName: 'Day16 AI-Down Edge Case Lead',
        phone: '+10000000002',
        campaign: campaign._id,
        source: 'Manual Entry',
        status: 'Calling',
      });

      await CallLog.create({
        lead: leadHappy._id,
        campaign: campaign._id,
        callType: 'Outbound',
        status: 'Initiated',
        toNumber: leadHappy.phone,
        vapiCallId: HAPPY_PATH_CALL_ID,
        vapiAssistantId: 'test-assistant-id',
      });

      await CallLog.create({
        lead: leadAiDown._id,
        campaign: campaign._id,
        callType: 'Outbound',
        status: 'Initiated',
        toNumber: leadAiDown.phone,
        vapiCallId: AI_DOWN_CALL_ID,
        vapiAssistantId: 'test-assistant-id',
      });

      console.log('✅ Test Campaign created :', campaign._id.toString());
      console.log('✅ Happy-path Lead       :', leadHappy._id.toString());
      console.log('✅ AI-down edge Lead     :', leadAiDown._id.toString());
      console.log('\nvapiCallId for happy-path curl :', HAPPY_PATH_CALL_ID);
      console.log('vapiCallId for AI-down curl    :', AI_DOWN_CALL_ID);
      console.log('\nNow run the two curl commands from chat —');
      console.log('  1) happy-path one, with the AI service RUNNING');
      console.log('  2) AI-down one, with the AI service STOPPED');
      console.log('then run: npm run test:day16:s3:check\n');

      process.exit(0);
    } catch (err) {
      console.error('❌ Seed failed:', err);
      process.exit(1);
    }
  })();
}