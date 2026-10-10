// backend/src/scripts/checkDay16Session3.ts
//
// LeadMind AI — Day 16, Session 3 verification (part 3 of 3)
// Run with: npm run test:day16:s3:check
//
// Prints + asserts the state of both test leads seeded by
// seedDay16Session3.ts, after you've fired the two curl commands from chat:
//   1. Happy path  — AI service running  -> expect Qualified, real score
//   2. AI-down edge case -> expect "Needs Human Follow-up", null score,
//      and confirms the webhook did NOT crash (non-blocking fallback, UC-12 A2)

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');
const Transcript = require('../models/Transcript');
import { HAPPY_PATH_CALL_ID, AI_DOWN_CALL_ID, TEST_CAMPAIGN_MARKER } from './seedDay16Session3';

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

async function printAndCheckCase(
  vapiCallId: string,
  label: string,
  expected: { finalStatus: string; scoreIsNull: boolean }
) {
  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`  ${label}  (vapiCallId=${vapiCallId})`);
  console.log(`═══════════════════════════════════════════════════`);

  const callLog = await CallLog.findOne({ vapiCallId });
  if (!callLog) {
    check(`${label}: CallLog exists`, false, 'run `npm run test:day16:s3:seed` and fire the curl command first');
    return;
  }

  const lead = await Lead.findById(callLog.lead);
  const transcript = callLog.transcript ? await Transcript.findById(callLog.transcript) : null;

  console.log('  CallLog.status              :', callLog.status);
  console.log('  CallLog.qualificationScore  :', callLog.qualificationScore);
  console.log('  CallLog.finalLeadStatus     :', callLog.finalLeadStatus);
  console.log('  Lead.status                 :', lead?.status);
  console.log('  Lead.qualificationScore     :', lead?.qualificationScore);
  console.log('  Lead.isQualified            :', lead?.isQualified);
  console.log('  Lead.scoreBreakdown         :', JSON.stringify(lead?.scoreBreakdown));
  console.log('  Transcript.finalStatus      :', transcript?.finalStatus);
  console.log('  Transcript.qualificationScore:', transcript?.qualificationScore);

  if (!transcript) {
    check(`${label}: Transcript exists`, false, 'end-of-call-report may not have been fired yet');
    return;
  }

  check(
    `${label}: Transcript.finalStatus === "${expected.finalStatus}"`,
    transcript.finalStatus === expected.finalStatus,
    `got "${transcript.finalStatus}"`
  );
  check(
    `${label}: Lead.status === "${expected.finalStatus}"`,
    lead?.status === expected.finalStatus,
    `got "${lead?.status}"`
  );

  if (expected.scoreIsNull) {
    check(
      `${label}: qualificationScore is null (scoring did not run)`,
      lead?.qualificationScore == null && callLog.qualificationScore == null
    );
  } else {
    check(`${label}: qualificationScore is a number`, typeof lead?.qualificationScore === 'number');
    check(`${label}: Lead.isQualified === true`, lead?.isQualified === true);
  }
}

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);

    await printAndCheckCase(HAPPY_PATH_CALL_ID, 'Happy Path (AI service UP)', {
      finalStatus: 'Qualified',
      scoreIsNull: false,
    });

    await printAndCheckCase(AI_DOWN_CALL_ID, 'AI-Down Edge Case', {
      finalStatus: 'Needs Human Follow-up',
      scoreIsNull: true,
    });

    console.log(`\n═══════════════════════════════════════════════════`);
    console.log('  Campaign stats');
    console.log(`═══════════════════════════════════════════════════`);
    const campaign = await Campaign.findOne({ name: TEST_CAMPAIGN_MARKER }).sort({ createdAt: -1 });
    console.log('  stats.qualified    :', campaign?.stats?.qualified);
    console.log('  stats.notQualified :', campaign?.stats?.notQualified);

    check(
      'Campaign.stats.qualified incremented exactly once (happy path only)',
      campaign?.stats?.qualified === 1,
      `got ${campaign?.stats?.qualified}`
    );
    check(
      'Campaign.stats.notQualified untouched by the AI-down edge case',
      campaign?.stats?.notQualified === 0,
      `got ${campaign?.stats?.notQualified}`
    );

    console.log('\n───────────────────────────────────────────────────────────');
    console.log(`  Results: ${pass} passed, ${fail} failed`);
    console.log('───────────────────────────────────────────────────────────\n');

    process.exit(fail > 0 ? 1 : 0);
  } catch (err) {
    console.error('❌ Check failed:', err);
    process.exit(1);
  }
})();