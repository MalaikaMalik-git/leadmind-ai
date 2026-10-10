// backend/src/scripts/checkDay20Session1.ts
//
// LeadMind AI — Day 20, Session 1 verification (UC-08 unified call log)
// Run with: npm run test:day20:s1:check
//
// Requires: backend running (npm run dev) AND MongoDB connected.
//
// Seeds a deliberately mixed dataset to prove the things that actually
// matter for this endpoint:
//   - An Outbound CallLog tied to this admin's own campaign
//   - An Inbound CallLog with campaign: null (must still appear — this is
//     exactly the case getLeads() silently drops, which getCalls() was
//     built to avoid repeating)
//   - A CallLog belonging to a SECOND admin's campaign (must NOT appear)
//   - Filtering by callType, status, campaignId, and date range
//   - Pagination math (total/totalPages/hasNext/hasPrev)
//   - Sorting by durationSeconds

import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import mongoose from 'mongoose';
const Admin = require('../models/Admin');
const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');
import { signAccessToken } from '../utils/jwt';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const MARKER = 'Day20 Session1 — Calls Endpoint Test';

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

  await CallLog.deleteMany({ lead: { $in: leadIds } });
  await Lead.deleteMany({ _id: { $in: leadIds } });
  await Campaign.deleteMany({ _id: { $in: campaignIds } });
  await Admin.deleteMany({ email: { $regex: `^day20-s1-other-admin` } });
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
  const client = axios.create({ baseURL: BASE_URL, headers: { Authorization: `Bearer ${token}` }, validateStatus: () => true });

  // ═══════════════════════════════════════════════════════════════════════
  //  Setup
  // ═══════════════════════════════════════════════════════════════════════
  const campaign = await Campaign.create({
    name: `${MARKER} Campaign`, goal: 'Verify unified call log', tone: 'Professional',
    instructions: 'Test campaign.', dailyCallLimit: 50, status: 'Completed', createdBy: admin._id,
  });
  const lead1 = await Lead.create({ fullName: `${MARKER} Lead 1`, phone: '+15557770001', campaign: campaign._id, status: 'Qualified' });
  const lead2 = await Lead.create({ fullName: `${MARKER} Lead 2`, phone: '+15557770002', campaign: null, status: 'Callback Requested' });

  const outboundCall = await CallLog.create({
    lead: lead1._id, campaign: campaign._id, callType: 'Outbound', status: 'Completed',
    toNumber: lead1.phone, durationSeconds: 240, initiatedAt: new Date('2026-06-01T10:00:00Z'), answeredAt: new Date(),
  });
  const inboundCall = await CallLog.create({
    lead: lead2._id, campaign: null, callType: 'Inbound', status: 'Abandoned',
    fromNumber: lead2.phone, toNumber: '+14153903418', durationSeconds: 8, initiatedAt: new Date('2026-06-02T10:00:00Z'),
  });
  const liveCall = await CallLog.create({
    lead: lead1._id, campaign: campaign._id, callType: 'Outbound', status: 'Ringing',
    toNumber: lead1.phone, durationSeconds: 0, initiatedAt: new Date(),
  });

  // Second admin's own call — must be invisible to the first admin.
  const otherAdmin = await Admin.create({ name: 'Day20 S1 Other Admin', email: 'day20-s1-other-admin@leadmind.ai', password: 'TestPassword123' });
  const otherCampaign = await Campaign.create({
    name: `${MARKER} Other Admin Campaign`, goal: 'Isolation test', tone: 'Professional',
    instructions: 'Test campaign.', dailyCallLimit: 50, status: 'Completed', createdBy: otherAdmin._id,
  });
  const otherLead = await Lead.create({ fullName: `${MARKER} Other Lead`, phone: '+15557770003', campaign: otherCampaign._id, status: 'Qualified' });
  const otherCall = await CallLog.create({
    lead: otherLead._id, campaign: otherCampaign._id, callType: 'Outbound', status: 'Completed',
    toNumber: otherLead.phone, durationSeconds: 100, initiatedAt: new Date(),
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  Part 1 — unscoped list: sees own outbound + inbound, NOT other admin's
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Part 1 — GET /api/calls (no filters)');
  console.log('═══════════════════════════════════════════════════\n');

  const listResp = await client.get('/api/calls', { params: { limit: 100 } });
  check('Returns 200', listResp.status === 200, `got ${listResp.status}`);

  const ids = (listResp.data?.data || []).map((c: any) => c._id);
  check('Includes the OUTBOUND call (owned campaign)', ids.includes(String(outboundCall._id)));
  check(
    'Includes the INBOUND call with campaign:null (the exact case getLeads() drops — this endpoint must not repeat that bug)',
    ids.includes(String(inboundCall._id))
  );
  check("Does NOT include the second admin's call", !ids.includes(String(otherCall._id)));

  const inboundRow = (listResp.data?.data || []).find((c: any) => c._id === String(inboundCall._id));
  check('Inbound row has campaign: null in the response', inboundRow?.campaign === null, `got ${JSON.stringify(inboundRow?.campaign)}`);
  check('Inbound row has lead populated (fullName)', inboundRow?.lead?.fullName === lead2.fullName);

  const outboundRow = (listResp.data?.data || []).find((c: any) => c._id === String(outboundCall._id));
  check(`Outbound row has campaign.name === "${campaign.name}"`, outboundRow?.campaign?.name === campaign.name);
  check('Outbound row has durationFormatted virtual ("04:00" for 240s)', outboundRow?.durationFormatted === '04:00', `got "${outboundRow?.durationFormatted}"`);

  // ═══════════════════════════════════════════════════════════════════════
  //  Part 2 — filters
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Part 2 — Filters');
  console.log('═══════════════════════════════════════════════════\n');

  const byType = await client.get('/api/calls', { params: { callType: 'Inbound', limit: 100 } });
  const byTypeIds = (byType.data?.data || []).map((c: any) => c._id);
  check('callType=Inbound excludes the outbound call', !byTypeIds.includes(String(outboundCall._id)));
  check('callType=Inbound includes the inbound call', byTypeIds.includes(String(inboundCall._id)));

  const byStatus = await client.get('/api/calls', { params: { status: 'Ringing', limit: 100 } });
  const byStatusIds = (byStatus.data?.data || []).map((c: any) => c._id);
  check('status=Ringing returns only the live call', byStatusIds.length === 1 && byStatusIds[0] === String(liveCall._id), `got ${JSON.stringify(byStatusIds)}`);

  const byCampaign = await client.get('/api/calls', { params: { campaign: String(campaign._id), limit: 100 } });
  const byCampaignIds = (byCampaign.data?.data || []).map((c: any) => c._id);
  check('campaign filter excludes the inbound (campaign:null) call', !byCampaignIds.includes(String(inboundCall._id)));
  check('campaign filter includes the outbound call', byCampaignIds.includes(String(outboundCall._id)));

  const byDate = await client.get('/api/calls', { params: { startDate: '2026-06-01T00:00:00Z', endDate: '2026-06-01T23:59:59Z', limit: 100 } });
  const byDateIds = (byDate.data?.data || []).map((c: any) => c._id);
  check('Date range filter includes only the June 1 call', byDateIds.includes(String(outboundCall._id)) && !byDateIds.includes(String(inboundCall._id)));

  const otherAdminCampaignAttempt = await client.get('/api/calls', { params: { campaign: String(otherCampaign._id) } });
  check("Filtering by a campaign the admin doesn't own returns 404", otherAdminCampaignAttempt.status === 404, `got ${otherAdminCampaignAttempt.status}`);

  // ═══════════════════════════════════════════════════════════════════════
  //  Part 3 — pagination + sorting
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Part 3 — Pagination and sorting');
  console.log('═══════════════════════════════════════════════════\n');

  const page1 = await client.get('/api/calls', { params: { limit: 2, page: 1 } });
  check('pagination.limit === 2', page1.data?.pagination?.limit === 2);
  check('Returns at most 2 rows for limit=2', (page1.data?.data || []).length <= 2);
  check('pagination.total is at least 3 (our 3 own calls)', page1.data?.pagination?.total >= 3, `got ${page1.data?.pagination?.total}`);
  check('pagination.hasNext is true when more rows exist', page1.data?.pagination?.hasNext === true);

  const sortedAsc = await client.get('/api/calls', { params: { sortBy: 'durationSeconds', sortOrder: 'asc', limit: 100 } });
  const durations = (sortedAsc.data?.data || []).map((c: any) => c.durationSeconds);
  const isSorted = durations.every((d: number, i: number) => i === 0 || durations[i - 1] <= d);
  check('sortBy=durationSeconds&sortOrder=asc returns ascending order', isSorted, `got ${JSON.stringify(durations)}`);

  // ═══════════════════════════════════════════════════════════════════════
  //  Part 4 — auth
  // ═══════════════════════════════════════════════════════════════════════
  const noAuth = await axios.get(`${BASE_URL}/api/calls`, { validateStatus: () => true });
  check('No JWT returns 401', noAuth.status === 401, `got ${noAuth.status}`);

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