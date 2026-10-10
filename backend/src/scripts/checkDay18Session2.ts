// backend/src/scripts/checkDay18Session2.ts
//
// LeadMind AI — Day 18, Session 2 verification
// Run with: npm run test:day18:s2:check
//
// Requires: backend running (npm run dev) AND MongoDB connected. Unlike
// Session 1's check (DB-free), this session's code path writes to Mongo, so
// this script connects directly to assert on the resulting documents.
//
// This is deliberately NOT the full UC-10 branch matrix (early hangup,
// outside-hours, etc.) — that's Session 3. This script proves two things
// specifically:
//
//   Scenario A — Brand-new caller: simulates assistant-request -> status-
//   update -> end-of-call-report for a phone number with no existing Lead,
//   during business hours, with a real qualifying-style conversation.
//   Asserts a new Lead/CallLog/Transcript were created correctly and the
//   Day 16/17 AI pipeline ran (or gracefully no-op'd if the AI service isn't
//   running right now — see note below).
//
//   Scenario B — Returning lead, the actual bug this session fixed: seeds a
//   Lead that already belongs to a real test Campaign with non-zero stats,
//   then has that same phone number call in. Asserts the existing Lead is
//   reused (no duplicate), the CallLog inherits the campaign — AND, most
//   importantly, that Campaign.stats and the auto-advance/retry machinery
//   did NOT fire, proving the outbound-only guards actually hold.

import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import mongoose from 'mongoose';
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');
const Transcript = require('../models/Transcript');
const Campaign = require('../models/Campaign');
const Admin = require('../models/Admin');

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;

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

function client() {
  return axios.create({
    baseURL: BASE_URL,
    headers: { 'Content-Type': 'application/json', 'x-vapi-secret': VAPI_WEBHOOK_SECRET },
    validateStatus: () => true,
  });
}

async function simulateInboundCall(vapiCallId: string, fromNumber: string, toNumber: string, conversation: Array<{ role: 'assistant' | 'user'; message: string }>) {
  const c = client();

  // 1. assistant-request — also seeds the server's in-memory routing map
  const arResp = await c.post('/api/webhooks/vapi', {
    message: {
      type: 'assistant-request',
      call: { id: vapiCallId, type: 'inboundPhoneCall', customer: { number: fromNumber } },
      phoneNumber: { number: toNumber },
    },
  });

  // 2. status-update: ringing, then in-progress
  await c.post('/api/webhooks/vapi', {
    message: { type: 'status-update', status: 'ringing', call: { id: vapiCallId, type: 'inboundPhoneCall', customer: { number: fromNumber } }, phoneNumber: { number: toNumber } },
  });
  await c.post('/api/webhooks/vapi', {
    message: { type: 'status-update', status: 'in-progress', call: { id: vapiCallId, type: 'inboundPhoneCall', customer: { number: fromNumber } }, phoneNumber: { number: toNumber } },
  });

  // 3. end-of-call-report
  const eocrResp = await c.post('/api/webhooks/vapi', {
    message: {
      type: 'end-of-call-report',
      call: { id: vapiCallId, type: 'inboundPhoneCall', customer: { number: fromNumber } },
      phoneNumber: { number: toNumber },
      endedReason: 'customer-ended-call',
      durationSeconds: 45,
      artifact: { messages: conversation.map((m) => ({ role: m.role, message: m.message })) },
    },
  });

  return { arResp, eocrResp };
}

async function main() {
  if (!VAPI_WEBHOOK_SECRET) {
    console.error('❌ VAPI_WEBHOOK_SECRET is not set in backend/.env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI!);
  const admin = await Admin.findOne({ email: process.env.SEED_ADMIN_EMAIL || 'admin@leadmind.ai' });
  if (!admin) {
    console.error('❌ No seeded admin found — run `npm run seed` first.');
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Scenario A — brand-new caller
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Scenario A — Brand-new inbound caller');
  console.log('═══════════════════════════════════════════════════\n');

  const newCallerPhone = `+1555${Date.now().toString().slice(-7)}`;
  const vapiCallIdA = `day18-s2-scenario-a-${Date.now()}`;

  await Lead.deleteMany({ phone: newCallerPhone }); // idempotent re-run safety

  const { eocrResp: eocrA } = await simulateInboundCall(vapiCallIdA, newCallerPhone, '+14153903418', [
    { role: 'assistant', message: 'Hi, thanks for calling! This is LeadMind AI. How can I help you today?' },
    { role: 'user', message: 'Hi, we need a mobile app built for our delivery business.' },
    { role: 'assistant', message: 'Got it — what kind of budget and timeline are you thinking?' },
    { role: 'user', message: 'Around $20,000, and we would like it done in about 3 months. I am the founder so I make the final call.' },
  ]);

  check('end-of-call-report accepted (200)', eocrA.status === 200, `got ${eocrA.status}`);

  // Give the async handler a brief moment to finish its DB writes and the
  // (possibly slow) AI service calls before we query.
  await new Promise((r) => setTimeout(r, 1500));

  const newLead = await Lead.findOne({ phone: newCallerPhone });
  check('A new Lead was created for the unknown caller', !!newLead);
  if (newLead) {
    check(`Lead.source === 'Inbound Call'`, newLead.source === 'Inbound Call', `got "${newLead.source}"`);
    check('Lead.campaign is null (no campaign context for a new inbound caller)', newLead.campaign === null || newLead.campaign === undefined);
  }

  const callLogA = await CallLog.findOne({ vapiCallId: vapiCallIdA });
  check('A CallLog was created', !!callLogA);
  if (callLogA) {
    check(`CallLog.callType === 'Inbound'`, callLogA.callType === 'Inbound', `got "${callLogA.callType}"`);
    check('CallLog.campaign is null', callLogA.campaign === null || callLogA.campaign === undefined);
    check(`CallLog.fromNumber === "${newCallerPhone}"`, callLogA.fromNumber === newCallerPhone);
  }

  const transcriptA = callLogA?.transcript ? await Transcript.findById(callLogA.transcript) : null;
  check('A Transcript was created', !!transcriptA);
  if (transcriptA) {
    check(
      'Transcript.finalStatus is a real outcome, not Callback Requested or Abandoned (normal business-hours call)',
      !['Callback Requested', 'Abandoned'].includes(transcriptA.finalStatus),
      `got "${transcriptA.finalStatus}" (Qualified/Not Qualified/Needs Human Follow-up are all valid here — the last one just means the AI service wasn't reachable when this ran)`
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Scenario B — returning lead already in a campaign (the guard fix)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Scenario B — Returning lead already in a Running campaign');
  console.log('  (proves the outbound-only guards actually hold)');
  console.log('═══════════════════════════════════════════════════\n');

  const marker = 'Day18 Session2 — Guard Test Campaign';
  await Campaign.deleteMany({ name: marker }).setOptions({ _includeDeleted: true });
  const returningPhone = `+1555${(Date.now() + 1).toString().slice(-7)}`;
  await Lead.deleteMany({ phone: returningPhone });

  const testCampaign = await Campaign.create({
    name: marker,
    goal: 'Guard-fix verification for Day 18 Session 2',
    tone: 'Professional',
    instructions: 'Test campaign — not used for real calling.',
    dailyCallLimit: 50,
    status: 'Running',
    createdBy: admin._id,
  });
  const existingLead = await Lead.create({
    fullName: 'Returning Test Lead',
    phone: returningPhone,
    campaign: testCampaign._id,
    status: 'Not Qualified', // simulates a lead who was already dialed once before
  });

  const statsBefore = { ...testCampaign.toObject().stats };
  console.log('  Campaign.stats before the inbound call:', JSON.stringify(statsBefore));

  const vapiCallIdB = `day18-s2-scenario-b-${Date.now()}`;
  const { eocrResp: eocrB } = await simulateInboundCall(vapiCallIdB, returningPhone, '+14153903418', [
    { role: 'assistant', message: 'Hi, thanks for calling! This is LeadMind AI. How can I help you today?' },
    { role: 'user', message: 'Hey, just following up on our earlier conversation about the project.' },
  ]);
  check('end-of-call-report accepted (200)', eocrB.status === 200, `got ${eocrB.status}`);

  await new Promise((r) => setTimeout(r, 1500));

  const leadCountForPhone = await Lead.countDocuments({ phone: returningPhone });
  check('No duplicate Lead was created — exactly 1 Lead for this phone number', leadCountForPhone === 1, `found ${leadCountForPhone}`);

  const reusedLead = await Lead.findOne({ phone: returningPhone });
  check(
    'The SAME Lead document was reused (matched by phone, not recreated)',
    reusedLead && String(reusedLead._id) === String(existingLead._id)
  );

  const callLogB = await CallLog.findOne({ vapiCallId: vapiCallIdB });
  check('A CallLog was created for the returning caller', !!callLogB);
  if (callLogB) {
    check(
      `CallLog.campaign inherited from the existing Lead (${testCampaign._id})`,
      String(callLogB.campaign) === String(testCampaign._id),
      `got ${callLogB.campaign}`
    );
  }

  const campaignAfter = await Campaign.findById(testCampaign._id);
  check(
    'Campaign.stats.callsAnswered did NOT increment (outbound-only guard held)',
    campaignAfter.stats.callsAnswered === statsBefore.callsAnswered,
    `before=${statsBefore.callsAnswered}, after=${campaignAfter.stats.callsAnswered}`
  );
  check(
    'Campaign.stats.qualified/notQualified untouched by this inbound call\'s outcome',
    campaignAfter.stats.qualified === statsBefore.qualified && campaignAfter.stats.notQualified === statsBefore.notQualified,
    `before=${JSON.stringify(statsBefore)}, after=${JSON.stringify(campaignAfter.stats)}`
  );
  check(
    'Campaign.status is still "Running" (auto-advance/auto-complete did not fire)',
    campaignAfter.status === 'Running',
    `got "${campaignAfter.status}"`
  );

  // ── cleanup ────────────────────────────────────────────────────────────
  await Lead.deleteMany({ phone: { $in: [newCallerPhone, returningPhone] } });
  await CallLog.deleteMany({ vapiCallId: { $in: [vapiCallIdA, vapiCallIdB] } });
  await Transcript.deleteMany({ vapiCallId: { $in: [vapiCallIdA, vapiCallIdB] } });
  await Campaign.deleteOne({ _id: testCampaign._id });

  console.log('\n───────────────────────────────────────────────────────────');
  console.log(`  Results: ${pass} passed, ${fail} failed`);
  console.log('───────────────────────────────────────────────────────────\n');

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('❌ Check failed:', err);
  process.exit(1);
});