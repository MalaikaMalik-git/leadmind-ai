// backend/src/scripts/checkWebhookTest.ts
//
// Day 14 — Session 3 verification helper (part 2 of 2)
// Run with: npm run test:webhook:check
//
// Prints the current state of the test CallLog/Lead/Transcript created by
// seedWebhookTest.ts, so you can confirm the webhook handler actually
// updated them after you fire the simulated curl events.

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');
const Transcript = require('../models/Transcript');
import { TEST_VAPI_CALL_ID } from './seedWebhookTest';

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);

    const callLog = await CallLog.findOne({ vapiCallId: TEST_VAPI_CALL_ID });

    if (!callLog) {
      console.log('❌ No test CallLog found. Run `npm run test:webhook:seed` first.');
      process.exit(1);
    }

    const lead = await Lead.findById(callLog.lead);
    const transcript = callLog.transcript ? await Transcript.findById(callLog.transcript) : null;

    console.log('═══════════════════════════════════════════════════');
    console.log('  CallLog');
    console.log('═══════════════════════════════════════════════════');
    console.log('  status          :', callLog.status);
    console.log('  answeredAt      :', callLog.answeredAt);
    console.log('  endedAt         :', callLog.endedAt);
    console.log('  durationSeconds :', callLog.durationSeconds);
    console.log('  finalLeadStatus :', callLog.finalLeadStatus);
    console.log('  transcript id   :', callLog.transcript);

    console.log('\n═══════════════════════════════════════════════════');
    console.log('  Lead');
    console.log('═══════════════════════════════════════════════════');
    console.log('  status            :', lead?.status);
    console.log('  lastCalledAt      :', lead?.lastCalledAt);
    console.log('  totalCallAttempts :', lead?.totalCallAttempts);

    console.log('\n═══════════════════════════════════════════════════');
    console.log('  Transcript');
    console.log('═══════════════════════════════════════════════════');
    if (transcript) {
      console.log('  finalStatus     :', transcript.finalStatus);
      console.log('  durationSeconds :', transcript.durationSeconds);
      console.log('  messages        :', JSON.stringify(transcript.messages, null, 2));
    } else {
      console.log('  (none yet — fire the end-of-call-report curl command)');
    }
    console.log('');

    process.exit(0);
  } catch (err) {
    console.error('❌ Check failed:', err);
    process.exit(1);
  }
})();