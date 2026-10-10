// backend/src/scripts/checkDay21Session2.ts
//
// LeadMind AI — Day 21, Session 2 verification
// Run with: npm run test:day21:s2:check
//
// Requires: backend running (npm run dev) AND MongoDB connected.
//
// Part A — Direct logError() round-trip: works regardless of AI service
// state, proves the model/utility are correct end to end (Error instance
// handling, plain-string handling, context preservation, severity default).
//
// Part B — Real pipeline failure: fires a completed call through the real
// webhook and checks whether qualificationService/topicAnalysisService
// logged anything to ErrorLog. Only meaningful if your AI service is NOT
// reachable when you run this — if it is, the call just succeeds normally
// and this part reports that it was skipped (not a failure).

import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import mongoose from 'mongoose';
const Admin = require('../models/Admin');
const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');
const Transcript = require('../models/Transcript');
const ErrorLog = require('../models/ErrorLog');
import { logError } from '../utils/errorLog';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;
const MARKER = 'Day21 Session2 — Error Log Test';

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

async function cleanup() {
  await ErrorLog.deleteMany({ 'context.marker': MARKER });
  const campaigns = await Campaign.find({ name: { $regex: `^${MARKER}` } }).setOptions({ _includeDeleted: true });
  const campaignIds = campaigns.map((c: any) => c._id);
  const leads = await Lead.find({ $or: [{ campaign: { $in: campaignIds } }, { fullName: { $regex: `^${MARKER}` } }] });
  const leadIds = leads.map((l: any) => l._id);

  await Transcript.deleteMany({ lead: { $in: leadIds } });
  await CallLog.deleteMany({ lead: { $in: leadIds } });
  await Lead.deleteMany({ _id: { $in: leadIds } });
  await Campaign.deleteMany({ _id: { $in: campaignIds } });
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  await cleanup();

  const admin = await Admin.findOne({ email: process.env.SEED_ADMIN_EMAIL || 'admin@leadmind.ai' });
  if (!admin) {
    console.error('❌ No seeded admin found — run `npm run seed` first.');
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Part A — direct logError() round-trip
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Part A — Direct logError() round-trip');
  console.log('═══════════════════════════════════════════════════\n');

  const beforeCount = await ErrorLog.countDocuments({});
  await logError('checkScript.directTest', new Error('Deliberate test error from checkDay21Session2'), {
    marker: MARKER,
    exampleField: 'exampleValue',
  });
  const afterCount = await ErrorLog.countDocuments({});
  check('ErrorLog count increased by exactly 1 after a direct logError() call', afterCount === beforeCount + 1, `before=${beforeCount}, after=${afterCount}`);

  const entry = await ErrorLog.findOne({ 'context.marker': MARKER }).sort({ createdAt: -1 });
  check('Entry has the correct source', entry?.source === 'checkScript.directTest', `got "${entry?.source}"`);
  check('Entry has the correct message', entry?.message === 'Deliberate test error from checkDay21Session2', `got "${entry?.message}"`);
  check('Entry has a stack trace (real Error instance was passed)', typeof entry?.stack === 'string' && entry.stack.length > 0);
  check('Entry has the context object preserved', entry?.context?.exampleField === 'exampleValue');
  check('Entry defaults to severity "error"', entry?.severity === 'error');

  await logError('checkScript.stringErrorTest', 'a plain string reason, not an Error instance', { marker: MARKER });
  const stringEntry = await ErrorLog.findOne({ source: 'checkScript.stringErrorTest', 'context.marker': MARKER });
  check('logError() also handles a plain string (not just Error instances)', stringEntry?.message === 'a plain string reason, not an Error instance');
  check('No stack trace for a non-Error input (correctly left null/undefined)', !stringEntry?.stack);

  // ═══════════════════════════════════════════════════════════════════════
  //  Part B — Real pipeline failure via webhook
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Part B — Real qualification/topic-analysis failure via webhook');
  console.log('═══════════════════════════════════════════════════\n');
  console.log('  NOTE: this part only produces a meaningful result if your AI service');
  console.log('  (ai-service/, port 8001) is NOT reachable from the backend right now.');
  console.log('  If it IS running, this call will succeed normally and Part B will be');
  console.log('  skipped (not a failure) — stop it in another terminal and re-run this');
  console.log('  script if you want to see Part B exercised.\n');

  const campaign = await Campaign.create({
    name: `${MARKER} Campaign`, goal: 'Verify error logging', tone: 'Professional',
    instructions: 'Test campaign.', dailyCallLimit: 50, status: 'Running', createdBy: admin._id,
  });
  const lead = await Lead.create({ fullName: `${MARKER} Lead`, phone: '+15559991111', campaign: campaign._id, status: 'Pending' });
  const vapiCallId = `day21-s2-errorlog-${Date.now()}`;
  await CallLog.create({ lead: lead._id, campaign: campaign._id, callType: 'Outbound', status: 'Initiated', toNumber: lead.phone, vapiCallId, attemptNumber: 1 });

  const client = axios.create({ baseURL: BASE_URL, headers: { 'Content-Type': 'application/json', 'x-vapi-secret': VAPI_WEBHOOK_SECRET }, validateStatus: () => true });
  const resp = await client.post('/api/webhooks/vapi', {
    message: {
      type: 'end-of-call-report',
      call: { id: vapiCallId, type: 'outboundPhoneCall', customer: { number: lead.phone } },
      endedReason: 'customer-ended-call',
      durationSeconds: 45,
      artifact: {
        messages: [
          { role: 'assistant', message: 'Hi, is now a good time?' },
          { role: 'user', message: 'Sure, we need an app, $8000 budget, 6 weeks, I decide.' },
        ],
      },
    },
  });
  check('Webhook still returns 200 even if the AI service call fails (non-fatal, no crash)', resp.status === 200, `got ${resp.status}`);
  await new Promise((r) => setTimeout(r, 1500));

  const pipelineErrorLogs = await ErrorLog.find({
    source: { $in: ['qualificationService', 'topicAnalysisService'] },
    'context.leadId': String(lead._id),
  });

  if (pipelineErrorLogs.length > 0) {
    check('AI service failure(s) were logged to ErrorLog with correct source', true);
    pipelineErrorLogs.forEach((e: any) => console.log(`    -> source="${e.source}" message="${e.message}"`));
    check('Logged entries include the leadId in context', pipelineErrorLogs.every((e: any) => e.context?.leadId === String(lead._id)));
  } else {
    console.log('  ℹ️  No pipeline errors logged — your AI service is reachable and the call succeeded normally. Not a failure.');
  }

  await cleanup();

  console.log('\n───────────────────────────────────────────────────────────');
  console.log(`  Results: ${pass} passed, ${fail} failed`);
  console.log('───────────────────────────────────────────────────────────\n');

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('❌ Check failed:', err);
  process.exit(1);
});