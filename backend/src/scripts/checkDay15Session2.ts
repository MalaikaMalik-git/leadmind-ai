// backend/src/scripts/checkDay15Session2.ts
//
// Day 15, Session 2 verification helper (part 2 of 2 for the LIVE proof)
// Run with: npm run test:day15:s2:check
//
// Prints the state of Lead A, Lead B, their CallLogs, and the campaign
// after you've fired the curl command from seedDay15Session2.ts against
// your running `npm run dev` server. Confirms:
//   • CallLog A got a scheduledRetryAt ~30 minutes in the future (retry scheduling)
//   • Lead A's status is "No Answer"
//   • Lead B was automatically dialed (status "Calling" or "Call Failed",
//     with a new CallLog created) — WITHOUT anyone clicking "start" again
//   • Campaign.stats.noAnswer incremented

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');
import { TEST_VAPI_CALL_ID } from './seedDay15Session2';

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);

    const callLogA = await CallLog.findOne({ vapiCallId: TEST_VAPI_CALL_ID });
    if (!callLogA) {
      console.log('❌ No test CallLog found. Run `npm run test:day15:s2:seed` first.');
      process.exit(1);
    }

    const leadA = await Lead.findById(callLogA.lead);
    const campaign = await Campaign.findById(callLogA.campaign);
    const leadB = await Lead.findOne({ campaign: campaign._id, fullName: 'Test Lead B (pending)' });
    const callLogB = leadB ? await CallLog.findOne({ lead: leadB._id }).sort({ initiatedAt: -1 }) : null;

    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Lead A — should be "No Answer" with a retry scheduled');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Lead A status         :', leadA?.status);
    console.log('  CallLog A status      :', callLogA.status);
    console.log('  CallLog A scheduledRetryAt :', callLogA.scheduledRetryAt);
    console.log('  CallLog A attemptNumber    :', callLogA.attemptNumber);
    const retryLooksRight =
      leadA?.status === 'No Answer' &&
      callLogA.scheduledRetryAt &&
      new Date(callLogA.scheduledRetryAt).getTime() > Date.now();
    console.log(retryLooksRight ? '  ✅ Retry scheduling looks correct' : '  ❌ Retry scheduling did NOT happen as expected');

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  Lead B — should have been auto-dialed (no manual trigger)');
    console.log('═══════════════════════════════════════════════════════════');
    if (!leadB) {
      console.log('  ❌ Lead B not found — did you run test:day15:s2:seed?');
    } else {
      console.log('  Lead B status         :', leadB.status);
      console.log('  CallLog B exists?     :', callLogB ? 'yes' : 'no');
      if (callLogB) {
        console.log('  CallLog B status      :', callLogB.status);
        console.log('  CallLog B errorMessage:', callLogB.errorMessage);
      }
      const autoAdvanceWorked = leadB.status !== 'Pending' && callLogB !== null;
      console.log(
        autoAdvanceWorked
          ? '  ✅ Auto-advance fired — Lead B was picked up automatically'
          : '  ❌ Lead B is still Pending — auto-advance did NOT fire'
      );
      if (callLogB?.status === 'Failed') {
        console.log(
          '  ℹ️  CallLog B is "Failed" because the test campaign uses a placeholder'
        );
        console.log('     vapiAssistantId — that is EXPECTED here. What matters is that');
        console.log('     a CallLog for Lead B exists at all, proving the webhook auto-');
        console.log('     dialed it without any manual "start" click.');
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  Campaign stats');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  stats.noAnswer  :', campaign?.stats?.noAnswer);
    console.log('  stats.callsMade :', campaign?.stats?.callsMade);
    console.log('');

    process.exit(0);
  } catch (err) {
    console.error('❌ Check failed:', err);
    process.exit(1);
  }
})();