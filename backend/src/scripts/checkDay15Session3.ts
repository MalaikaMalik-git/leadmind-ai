// backend/src/scripts/checkDay15Session3.ts
//
// Day 15, Session 3 verification helper (part 2 of 2 for the LIVE proof)
// Run with: npm run test:day15:s3:check
//
// Confirms that, after waiting for at least one poll tick, the stalled
// retry lead from seedDay15Session3.ts got a NEW CallLog automatically —
// proving the poller (not a webhook, not a manual click) closed the loop.

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');

const CAMPAIGN_MARKER = '__TEST__ Day15 Session3 Poller Live Proof';

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);

    const campaign = await Campaign.findOne({ name: CAMPAIGN_MARKER });
    if (!campaign) {
      console.log('❌ No test campaign found. Run `npm run test:day15:s3:seed` first.');
      process.exit(1);
    }

    const lead = await Lead.findOne({ campaign: campaign._id, fullName: 'Stalled Retry Lead' });
    const callLogs = await CallLog.find({ campaign: campaign._id }).sort({ initiatedAt: 1 });

    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Stalled retry lead — did the poller wake it up on its own?');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Lead status        :', lead?.status);
    console.log('  Total CallLogs      :', callLogs.length, '(should be 2: original attempt + poller-triggered retry)');

    callLogs.forEach((cl: any, i: number) => {
      console.log(`\n  CallLog ${i + 1}:`);
      console.log('    attemptNumber   :', cl.attemptNumber);
      console.log('    status          :', cl.status);
      console.log('    isRetry         :', cl.isRetry);
      console.log('    initiatedAt     :', cl.initiatedAt);
    });

    const pollerWokeItUp = callLogs.length >= 2 && callLogs[1].attemptNumber === 2 && callLogs[1].isRetry === true;

    console.log('\n───────────────────────────────────────────────────────────');
    if (pollerWokeItUp) {
      console.log('  ✅ The poller redialed this lead entirely on its own timer.');
      console.log('     No curl command, no other in-flight call, no manual click —');
      console.log('     just the 60-second (or however configured) interval doing its job.');
      if (callLogs[1].status === 'Failed') {
        console.log('\n  ℹ️  CallLog 2 shows "Failed" because this test campaign uses a');
        console.log('     placeholder vapiAssistantId — expected, same as Session 2.');
        console.log('     What matters is that the retry attempt was MADE at all.');
      }
    } else {
      console.log('  ❌ Only one CallLog found — the poller has not fired yet.');
      console.log('     Make sure `npm run dev` is running with CAMPAIGN_POLL_INTERVAL_MS');
      console.log('     set to something short (e.g. 5000), and wait a bit longer.');
    }
    console.log('───────────────────────────────────────────────────────────\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Check failed:', err);
    process.exit(1);
  }
})();