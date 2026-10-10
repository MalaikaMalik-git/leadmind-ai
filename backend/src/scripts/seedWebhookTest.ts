// backend/src/scripts/seedWebhookTest.ts
//
// Day 14 — Session 3 verification helper (part 1 of 2)
// Run with: npm run test:webhook:seed
//
// Creates one throwaway Lead + CallLog with a known vapiCallId so you can
// fire simulated webhook events at it with curl, then check the results
// with `npm run test:webhook:check`.

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');

export const TEST_VAPI_CALL_ID = 'test-vapi-call-001';

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('✅ MongoDB connected\n');

    // Clean up any previous test run first
    const oldCallLog = await CallLog.findOne({ vapiCallId: TEST_VAPI_CALL_ID });
    if (oldCallLog) {
      await Lead.deleteOne({ _id: oldCallLog.lead });
      await CallLog.deleteOne({ _id: oldCallLog._id });
      console.log('🧹 Removed previous test data\n');
    }

    const lead = await Lead.create({
      fullName: 'Webhook Test Lead',
      phone: '+10000000000',
      source: 'Manual Entry',
      status: 'Calling',
    });

    const callLog = await CallLog.create({
      lead: lead._id,
      campaign: null,
      callType: 'Outbound',
      status: 'Initiated',
      toNumber: '+10000000000',
      vapiCallId: TEST_VAPI_CALL_ID,
      vapiAssistantId: 'test-assistant-id',
    });

    console.log('✅ Test Lead created:', lead._id.toString());
    console.log('✅ Test CallLog created:', callLog._id.toString());
    console.log('✅ vapiCallId to use in webhook payloads:', TEST_VAPI_CALL_ID);
    console.log('\nNow run the curl commands from the chat to simulate VAPI webhook events,');
    console.log('then run: npm run test:webhook:check\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  }
})();