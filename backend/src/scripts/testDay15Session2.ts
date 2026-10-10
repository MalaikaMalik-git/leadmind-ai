// backend/src/scripts/testDay15Session2.ts
//
// LeadMind AI — Day 15, Session 2 verification script (part 1 of 2)
// Run with: npm run test:day15:s2
//
// This covers the pure service-layer logic that doesn't need a running
// server or a real VAPI call: retry-due detection and queue-exhaustion
// detection. For proof that the WEBHOOK actually triggers retry scheduling
// and auto-advance end-to-end, see the seed/check pair:
//   npm run test:day15:s2:seed   (run once)
//   <fire the curl command it prints, against your running `npm run dev`>
//   npm run test:day15:s2:check  (confirm the results)
//
// All test data created here is cleaned up automatically, win or lose.

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
const Admin = require('../models/Admin');
const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');

import { getNextRetryDueLead, isQueueExhausted } from '../services/campaignOrchestratorService';

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
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  LeadMind AI — Day 15, Session 2: Retry & Auto-Advance Logic');
  console.log('═══════════════════════════════════════════════════════════');

  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('\n✅ MongoDB connected\n' + '─'.repeat(60));

  const admin = await Admin.findOne({ email: process.env.SEED_ADMIN_EMAIL || 'admin@leadmind.ai' });
  if (!admin) {
    console.log('❌ Seeded admin not found — run `npm run seed` first.');
    process.exit(1);
  }

  const campaign = await Campaign.create({
    name: '__TEST__ Day15 Session2 Retry Logic',
    goal: 'Verify retry-due detection',
    tone: 'Professional',
    instructions: 'Test campaign — safe to delete.',
    dailyCallLimit: 10,
    status: 'Running',
    createdBy: admin._id,
  });

  try {
    const lead = await Lead.create({
      fullName: 'Test Retry Lead',
      phone: '+15550009999',
      campaign: campaign._id,
      status: 'No Answer', // terminal-looking, but a retry is still owed
      source: 'Manual Entry',
    });

    // ── Test A: a due retry (scheduledRetryAt in the past) should be found ──
    const dueCallLog = await CallLog.create({
      lead: lead._id,
      campaign: campaign._id,
      callType: 'Outbound',
      status: 'No Answer',
      toNumber: lead.phone,
      attemptNumber: 1,
      scheduledRetryAt: new Date(Date.now() - 60 * 1000), // 1 minute ago — due
    });

    const retryDue = await getNextRetryDueLead(String(campaign._id));
    check(
      'getNextRetryDueLead finds the lead once its retry window has passed',
      retryDue !== null && String(retryDue.lead._id) === String(lead._id) && retryDue.attemptNumber === 2,
      JSON.stringify(retryDue && { leadId: retryDue.lead._id, attemptNumber: retryDue.attemptNumber })
    );

    // ── Test B: queue is NOT exhausted while a retry is still owed ──────────
    const exhaustedWhileOwed = await isQueueExhausted(String(campaign._id));
    check('isQueueExhausted is false while a retry is still owed', exhaustedWhileOwed === false);

    // ── Test C: a FUTURE retry (not due yet) should NOT be picked up ─────────
    dueCallLog.scheduledRetryAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min from now
    await dueCallLog.save();
    const retryNotYetDue = await getNextRetryDueLead(String(campaign._id));
    check('getNextRetryDueLead ignores a retry scheduled for the future', retryNotYetDue === null);

    // Queue should still not be exhausted — the retry is owed, just not yet.
    const exhaustedWithFutureRetry = await isQueueExhausted(String(campaign._id));
    check('isQueueExhausted is still false with a future-scheduled retry', exhaustedWithFutureRetry === false);

    // ── Test D: self-cleaning — once a NEWER CallLog exists for the lead, ───
    //    the old scheduledRetryAt should no longer surface as "due" or "owed" ──
    await CallLog.create({
      lead: lead._id,
      campaign: campaign._id,
      callType: 'Outbound',
      status: 'Completed', // the retry was actually placed and this time it connected
      toNumber: lead.phone,
      attemptNumber: 2,
      isRetry: true,
      previousCallLog: dueCallLog._id,
      initiatedAt: new Date(Date.now() + 1000), // definitely newer
    });
    await Lead.updateOne({ _id: lead._id }, { $set: { status: 'Needs Human Follow-up' } });

    const retryAfterNewAttempt = await getNextRetryDueLead(String(campaign._id));
    check('getNextRetryDueLead returns null once a newer attempt exists (self-cleaning)', retryAfterNewAttempt === null);

    const exhaustedAfterNewAttempt = await isQueueExhausted(String(campaign._id));
    check('isQueueExhausted is true once no Pending leads and no retry is owed', exhaustedAfterNewAttempt === true);
  } finally {
    await CallLog.deleteMany({ campaign: campaign._id });
    await Lead.deleteMany({ campaign: campaign._id });
    await Campaign.deleteOne({ _id: campaign._id });
    console.log('\n  🧹 Test data cleaned up.');
  }

  await mongoose.disconnect();

  console.log('\n───────────────────────────────────────────────────────────');
  console.log(`  Results: ${pass} passed, ${fail} failed`);
  console.log('───────────────────────────────────────────────────────────');
  console.log('\n  Next: run `npm run test:day15:s2:seed` for the live webhook');
  console.log('  auto-advance proof (requires `npm run dev` running separately).\n');

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\n❌ Script crashed:', err);
  process.exit(1);
});