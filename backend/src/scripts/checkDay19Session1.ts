// backend/src/scripts/checkDay19Session1.ts
//
// LeadMind AI — Day 19, Session 1 verification (UC-08)
// Run with: npm run test:day19:s1:check
//
// Requires: backend running (npm run dev) AND MongoDB connected.
//
// Self-contained — creates its own test data (idempotent, marker-based
// cleanup at both start and end) rather than depending on leftover data
// from earlier days' check scripts:
//   - 1 Lead with an OUTBOUND transcript tied to a real test Campaign
//     (exercises the "campaign" metadata field in the response)
//   - The same Lead with an INBOUND transcript, campaign: null (exercises
//     the null-campaign path — this is the common case per Day 18)
//   - A SECOND admin + campaign + lead + transcript, to prove
//     findOwnedLead's ownership check actually blocks cross-admin access
//     on both new endpoints, not just the pre-existing Day 13 ones.

import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import mongoose from 'mongoose';
const Admin = require('../models/Admin');
const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
const Transcript = require('../models/Transcript');
import { signAccessToken } from '../utils/jwt';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const MARKER = 'Day19 Session1 — Transcript Endpoint Test';

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
  const campaigns = await Campaign.find({ name: { $regex: `^${MARKER}` } }).setOptions({ _includeDeleted: true });
  const campaignIds = campaigns.map((c: any) => c._id);
  const leads = await Lead.find({ $or: [{ campaign: { $in: campaignIds } }, { fullName: { $regex: `^${MARKER}` } }] });
  const leadIds = leads.map((l: any) => l._id);

  await Transcript.deleteMany({ lead: { $in: leadIds } });
  await Lead.deleteMany({ _id: { $in: leadIds } });
  await Campaign.deleteMany({ _id: { $in: campaignIds } });
  await Admin.deleteMany({ email: { $regex: `^day19-s1-other-admin` } });
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  await cleanup();

  const admin = await Admin.findOne({ email: process.env.SEED_ADMIN_EMAIL || 'admin@leadmind.ai' });
  if (!admin) {
    console.error('❌ No seeded admin found — run `npm run seed` first.');
    process.exit(1);
  }
  const token = signAccessToken({ adminId: admin._id.toString(), email: admin.email });

  const client = axios.create({
    baseURL: BASE_URL,
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: () => true,
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  Setup — 1 lead, 2 transcripts (outbound w/ campaign, inbound w/o)
  // ═══════════════════════════════════════════════════════════════════════
  const campaign = await Campaign.create({
    name: `${MARKER} Campaign`,
    goal: 'Verify transcript endpoints',
    tone: 'Professional',
    instructions: 'Test campaign — not used for real calling.',
    dailyCallLimit: 50,
    status: 'Completed',
    createdBy: admin._id,
  });

  const lead = await Lead.create({
    fullName: `${MARKER} Lead`,
    phone: '+15556660001',
    campaign: campaign._id,
    status: 'Qualified',
  });

  const outboundTranscript = await Transcript.create({
    lead: lead._id,
    campaign: campaign._id,
    callType: 'Outbound',
    callDate: new Date(),
    durationSeconds: 185,
    finalStatus: 'Qualified',
    messages: [
      { speaker: 'AI', text: 'Hi, this is LeadMind AI calling about your project inquiry.' },
      { speaker: 'Lead', text: 'Oh hi, yes we need a web app built.' },
      { speaker: 'AI', text: 'Great — what budget and timeline did you have in mind?' },
      { speaker: 'Lead', text: 'Around $15,000, done in 2 months. I make the final call here.' },
    ],
    qualificationScore: 85,
    scoreBreakdown: { budgetConfirmed: true, timelineDefined: true, scopeClear: true, isDecisionMaker: true },
    qualificationReason: 'All qualification criteria met.',
    detectedTopics: ['Web App'],
    vapiCallId: 'day19-s1-test-outbound-call',
  });

  const inboundTranscript = await Transcript.create({
    lead: lead._id,
    campaign: null,
    callType: 'Inbound',
    callDate: new Date(),
    durationSeconds: 20,
    finalStatus: 'Abandoned',
    messages: [{ speaker: 'AI', text: 'Hi, thanks for calling!' }],
    isPartial: true,
    vapiCallId: 'day19-s1-test-inbound-call',
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  Part 1 — GET /api/leads/:id/transcripts
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Part 1 — GET /api/leads/:id/transcripts');
  console.log('═══════════════════════════════════════════════════\n');

  const listResp = await client.get(`/api/leads/${lead._id}/transcripts`);
  console.log('Response:', JSON.stringify(listResp.data, null, 2));

  check('Returns 200', listResp.status === 200, `got ${listResp.status}`);
  check('Returns exactly 2 transcripts for this lead', listResp.data?.data?.length === 2, `got ${listResp.data?.data?.length}`);

  const listedOutbound = listResp.data?.data?.find((t: any) => t._id === String(outboundTranscript._id));
  check('Outbound transcript summary present', !!listedOutbound);
  if (listedOutbound) {
    check('  messageCount === 4 (not full messages array)', listedOutbound.messageCount === 4, `got ${listedOutbound.messageCount}`);
    check('  messages array is NOT included in the list response (kept light)', listedOutbound.messages === undefined);
    check('  finalStatus === "Qualified"', listedOutbound.finalStatus === 'Qualified');
    check('  qualificationScore === 85', listedOutbound.qualificationScore === 85);
  }

  const listedInbound = listResp.data?.data?.find((t: any) => t._id === String(inboundTranscript._id));
  check('Inbound transcript summary present', !!listedInbound);
  if (listedInbound) {
    check('  isPartial === true', listedInbound.isPartial === true);
    check('  messageCount === 1', listedInbound.messageCount === 1, `got ${listedInbound.messageCount}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Part 2 — GET /api/transcripts/:id (outbound, has a campaign)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Part 2 — GET /api/transcripts/:id (outbound, with campaign)');
  console.log('═══════════════════════════════════════════════════\n');

  const outResp = await client.get(`/api/transcripts/${outboundTranscript._id}`);
  console.log('Response:', JSON.stringify(outResp.data, null, 2));

  check('Returns 200', outResp.status === 200, `got ${outResp.status}`);
  const outData = outResp.data?.data;
  check('lead.fullName is populated', outData?.lead?.fullName === lead.fullName, `got "${outData?.lead?.fullName}"`);
  check(`campaign.name === "${campaign.name}"`, outData?.campaign?.name === campaign.name, `got "${outData?.campaign?.name}"`);
  check('Full messages array included (4 messages, in order)', Array.isArray(outData?.messages) && outData.messages.length === 4);
  check(
    'Messages preserve order (AI, Lead, AI, Lead)',
    outData?.messages?.map((m: any) => m.speaker).join(',') === 'AI,Lead,AI,Lead',
    `got ${outData?.messages?.map((m: any) => m.speaker).join(',')}`
  );
  check('durationFormatted virtual is present and correct ("03:05" for 185s)', outData?.durationFormatted === '03:05', `got "${outData?.durationFormatted}"`);
  check('scoreBreakdown included', outData?.scoreBreakdown?.budgetConfirmed === true);
  check('detectedTopics included', JSON.stringify(outData?.detectedTopics) === JSON.stringify(['Web App']));

  // ═══════════════════════════════════════════════════════════════════════
  //  Part 3 — GET /api/transcripts/:id (inbound, campaign: null)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Part 3 — GET /api/transcripts/:id (inbound, no campaign)');
  console.log('═══════════════════════════════════════════════════\n');

  const inResp = await client.get(`/api/transcripts/${inboundTranscript._id}`);
  check('Returns 200', inResp.status === 200, `got ${inResp.status}`);
  check('campaign is null in the response', inResp.data?.data?.campaign === null, `got ${JSON.stringify(inResp.data?.data?.campaign)}`);
  check('finalStatus === "Abandoned"', inResp.data?.data?.finalStatus === 'Abandoned');
  check('isPartial === true', inResp.data?.data?.isPartial === true);

  // ═══════════════════════════════════════════════════════════════════════
  //  Part 4 — Not found + ownership enforcement
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Part 4 — 404 handling and cross-admin ownership check');
  console.log('═══════════════════════════════════════════════════\n');

  const fakeId = new mongoose.Types.ObjectId();
  const notFoundResp = await client.get(`/api/transcripts/${fakeId}`);
  check('Nonexistent transcript ID returns 404', notFoundResp.status === 404, `got ${notFoundResp.status}`);

  const malformedResp = await client.get(`/api/transcripts/not-a-valid-object-id`);
  check('Malformed transcript ID returns 404 (not a 500 crash)', malformedResp.status === 404, `got ${malformedResp.status}`);

  const noAuthResp = await axios.get(`${BASE_URL}/api/transcripts/${outboundTranscript._id}`, { validateStatus: () => true });
  check('No JWT returns 401', noAuthResp.status === 401, `got ${noAuthResp.status}`);

  // Second admin + their own campaign/lead/transcript — proves the FIRST
  // admin's token cannot read the SECOND admin's transcript.
  const otherAdmin = await Admin.create({
    name: 'Day19 S1 Other Admin',
    email: 'day19-s1-other-admin@leadmind.ai',
    password: 'TestPassword123',
  });
  const otherCampaign = await Campaign.create({
    name: `${MARKER} Other Admin Campaign`,
    goal: 'Ownership isolation test',
    tone: 'Professional',
    instructions: 'Test campaign — not used for real calling.',
    dailyCallLimit: 50,
    status: 'Completed',
    createdBy: otherAdmin._id,
  });
  const otherLead = await Lead.create({
    fullName: `${MARKER} Other Admin Lead`,
    phone: '+15556660002',
    campaign: otherCampaign._id,
    status: 'Qualified',
  });
  const otherTranscript = await Transcript.create({
    lead: otherLead._id,
    campaign: otherCampaign._id,
    callType: 'Outbound',
    callDate: new Date(),
    durationSeconds: 100,
    finalStatus: 'Qualified',
    messages: [{ speaker: 'AI', text: 'Hello' }],
  });

  const crossAdminResp = await client.get(`/api/transcripts/${otherTranscript._id}`);
  check(
    "First admin's token cannot read second admin's transcript (404, not leaked)",
    crossAdminResp.status === 404,
    `got ${crossAdminResp.status}`
  );

  const crossAdminListResp = await client.get(`/api/leads/${otherLead._id}/transcripts`);
  check(
    "First admin's token cannot list second admin's lead's transcripts (404)",
    crossAdminListResp.status === 404,
    `got ${crossAdminListResp.status}`
  );

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