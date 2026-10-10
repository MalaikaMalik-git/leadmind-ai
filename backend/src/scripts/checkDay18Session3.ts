// backend/src/scripts/checkDay18Session3.ts
//
// LeadMind AI — Day 18, Session 3 verification (UC-10 full branch matrix)
// Run with:
//   npm run test:day18:s3:business-hours   (server running with normal .env)
//   npm run test:day18:s3:outside-hours    (server running with an
//                                            outside-hours BUSINESS_HOURS_*
//                                            window — see instructions
//                                            printed by this script)
//
// Sessions 1 and 2 already proved: business-hours routing works, a normal
// completed call runs the full AI pipeline, and a returning lead in a
// campaign doesn't trigger outbound machinery. What's still unverified:
//
//   Business-hours mode:
//     Scenario 1 — Early hangup during a NORMAL call -> Abandoned, AI
//     pipeline skipped (isPartial short-circuits before qualification).
//
//   Outside-hours mode:
//     Scenario 2 — Early hangup during an OUTSIDE-HOURS courtesy call ->
//     still Abandoned, NOT "Callback Requested". Proves isPartial is
//     checked before the outside-hours branch, not after.
//     Scenario 3 — A complete outside-hours courtesy exchange -> "Callback
//     Requested", AI pipeline skipped entirely (no score, no topics).
//
// This script connects to MongoDB directly to assert on the resulting
// documents, same pattern as Day 17/18 Session 2's check scripts.

import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import mongoose from 'mongoose';
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');
const Transcript = require('../models/Transcript');

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

async function fireAssistantRequest(vapiCallId: string, fromNumber: string) {
  const c = client();
  return c.post('/api/webhooks/vapi', {
    message: {
      type: 'assistant-request',
      call: { id: vapiCallId, type: 'inboundPhoneCall', customer: { number: fromNumber } },
    },
  });
}

async function fireEndOfCallReport(
  vapiCallId: string,
  fromNumber: string,
  toNumber: string,
  durationSeconds: number,
  conversation: Array<{ role: 'assistant' | 'user'; message: string }>
) {
  const c = client();
  return c.post('/api/webhooks/vapi', {
    message: {
      type: 'end-of-call-report',
      call: { id: vapiCallId, type: 'inboundPhoneCall', customer: { number: fromNumber } },
      phoneNumber: { number: toNumber },
      endedReason: 'customer-ended-call',
      durationSeconds,
      artifact: { messages: conversation.map((m) => ({ role: m.role, message: m.message })) },
    },
  });
}

async function cleanupPhone(phone: string, vapiCallId: string) {
  await Lead.deleteMany({ phone });
  await CallLog.deleteMany({ vapiCallId });
  await Transcript.deleteMany({ vapiCallId });
}

async function assertOutcome(vapiCallId: string, opts: { expectFinalStatus: string; expectPartial: boolean; expectAiSkipped: boolean }) {
  await new Promise((r) => setTimeout(r, 1200));

  const callLog = await CallLog.findOne({ vapiCallId });
  check(`[${vapiCallId}] CallLog was created`, !!callLog);
  if (!callLog) return;

  const transcript = callLog.transcript ? await Transcript.findById(callLog.transcript) : null;
  check(`[${vapiCallId}] Transcript was created`, !!transcript);
  if (!transcript) return;

  check(
    `[${vapiCallId}] Transcript.finalStatus === "${opts.expectFinalStatus}"`,
    transcript.finalStatus === opts.expectFinalStatus,
    `got "${transcript.finalStatus}"`
  );
  check(
    `[${vapiCallId}] Transcript.isPartial === ${opts.expectPartial}`,
    transcript.isPartial === opts.expectPartial,
    `got ${transcript.isPartial}`
  );

  if (opts.expectAiSkipped) {
    check(
      `[${vapiCallId}] AI qualification was skipped (qualificationScore is null)`,
      transcript.qualificationScore === null || transcript.qualificationScore === undefined,
      `got ${transcript.qualificationScore}`
    );
    check(
      `[${vapiCallId}] AI topic analysis was skipped (detectedTopics is empty)`,
      Array.isArray(transcript.detectedTopics) && transcript.detectedTopics.length === 0,
      `got ${JSON.stringify(transcript.detectedTopics)}`
    );
  }

  const lead = await Lead.findById(callLog.lead);
  check(
    `[${vapiCallId}] Lead.status === "${opts.expectFinalStatus}"`,
    lead?.status === opts.expectFinalStatus,
    `got "${lead?.status}"`
  );
}

async function runBusinessHoursMode() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  MODE: business-hours');
  console.log('  Scenario 1 — Early hangup during a NORMAL inbound call');
  console.log('═══════════════════════════════════════════════════\n');

  const phone = `+1555${Date.now().toString().slice(-7)}`;
  const vapiCallId = `day18-s3-scenario1-${Date.now()}`;
  await cleanupPhone(phone, vapiCallId);

  const arResp = await fireAssistantRequest(vapiCallId, phone);
  check('assistant-request returns the NORMAL assistant (business hours)', arResp.data?.assistant?.firstMessage?.includes('This is LeadMind AI'), `got: "${arResp.data?.assistant?.firstMessage}"`);

  // Hangs up almost immediately — under the isPartial threshold
  // (durationSeconds < 10 && messages.length < 2).
  const eocrResp = await fireEndOfCallReport(vapiCallId, phone, '+14153903418', 3, [
    { role: 'assistant', message: 'Hi, thanks for calling!' },
  ]);
  check('end-of-call-report accepted (200)', eocrResp.status === 200, `got ${eocrResp.status}`);

  await assertOutcome(vapiCallId, { expectFinalStatus: 'Abandoned', expectPartial: true, expectAiSkipped: true });

  await cleanupPhone(phone, vapiCallId);
}

async function runOutsideHoursMode() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  MODE: outside-hours');
  console.log('  Scenario 2 — Early hangup during an OUTSIDE-HOURS call');
  console.log('  (must resolve to Abandoned, NOT Callback Requested)');
  console.log('═══════════════════════════════════════════════════\n');

  const phone2 = `+1555${Date.now().toString().slice(-7)}`;
  const vapiCallId2 = `day18-s3-scenario2-${Date.now()}`;
  await cleanupPhone(phone2, vapiCallId2);

  const arResp2 = await fireAssistantRequest(vapiCallId2, phone2);
  check(
    'assistant-request returns the OUTSIDE-HOURS assistant',
    arResp2.data?.assistant?.firstMessage?.includes('business hours are'),
    `got: "${arResp2.data?.assistant?.firstMessage}" — is the server actually running with an outside-hours BUSINESS_HOURS_* window right now?`
  );

  const eocrResp2 = await fireEndOfCallReport(vapiCallId2, phone2, '+14153903418', 2, []);
  check('end-of-call-report accepted (200)', eocrResp2.status === 200, `got ${eocrResp2.status}`);

  await assertOutcome(vapiCallId2, { expectFinalStatus: 'Abandoned', expectPartial: true, expectAiSkipped: true });

  await cleanupPhone(phone2, vapiCallId2);

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Scenario 3 — Complete outside-hours courtesy exchange');
  console.log('═══════════════════════════════════════════════════\n');

  const phone3 = `+1555${(Date.now() + 1).toString().slice(-7)}`;
  const vapiCallId3 = `day18-s3-scenario3-${Date.now()}`;
  await cleanupPhone(phone3, vapiCallId3);

  const arResp3 = await fireAssistantRequest(vapiCallId3, phone3);
  check(
    'assistant-request returns the OUTSIDE-HOURS assistant',
    arResp3.data?.assistant?.firstMessage?.includes('business hours are')
  );

  const eocrResp3 = await fireEndOfCallReport(vapiCallId3, phone3, '+14153903418', 22, [
    { role: 'assistant', message: "Hi, thanks for calling LeadMind AI. Our team's business hours are 09:00 to 18:00, and we're currently closed. Would you like us to call you back?" },
    { role: 'user', message: 'Yes please, this number works.' },
  ]);
  check('end-of-call-report accepted (200)', eocrResp3.status === 200, `got ${eocrResp3.status}`);

  await assertOutcome(vapiCallId3, { expectFinalStatus: 'Callback Requested', expectPartial: false, expectAiSkipped: true });

  await cleanupPhone(phone3, vapiCallId3);
}

async function main() {
  const mode = process.argv[2];
  if (mode !== 'business-hours' && mode !== 'outside-hours') {
    console.error('❌ Usage: ts-node checkDay18Session3.ts <business-hours|outside-hours>');
    console.error('   Run via: npm run test:day18:s3:business-hours');
    console.error('        or: npm run test:day18:s3:outside-hours');
    process.exit(1);
  }

  if (!VAPI_WEBHOOK_SECRET) {
    console.error('❌ VAPI_WEBHOOK_SECRET is not set in backend/.env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI!);

  if (mode === 'business-hours') {
    await runBusinessHoursMode();
  } else {
    await runOutsideHoursMode();
  }

  console.log('\n───────────────────────────────────────────────────────────');
  console.log(`  Results: ${pass} passed, ${fail} failed`);
  console.log('───────────────────────────────────────────────────────────\n');

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('❌ Check failed:', err);
  process.exit(1);
});