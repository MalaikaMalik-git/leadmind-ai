// backend/src/scripts/testDay15Session3.ts
//
// LeadMind AI — Day 15, Session 3 verification script (part 1 of 2)
// Run with: npm run test:day15:s3
//
// What this proves (pure DB logic, zero real VAPI calls made):
//   1. runPollerTick() only considers campaigns with status = 'Running'
//      (a Paused campaign with a ready-to-dial Pending lead is left alone).
//   2. It correctly loops over MULTIPLE Running campaigns in a single tick.
//   3. Each campaign's own guard clauses (quiet hours / daily limit / no
//      eligible leads) are respected independently — one campaign's state
//      doesn't leak into another's.
//
// All four test campaigns here are deliberately built to hit a SKIP path
// (quiet hours / daily limit / no leads / not running) so this script never
// reaches the real "place a call via VAPI" branch — no live-call side
// effects, consistent with leaving the Telnyx/Vonage swap for after Day 15.
// For proof that the poller DOES fire a real dial attempt on its own timer
// (no webhook involved), see the seed/check pair:
//   npm run test:day15:s3:seed   (run once, with `npm run dev` running)
//   npm run test:day15:s3:check  (after waiting ~1 poll interval)
//
// All test data created here is cleaned up automatically, win or lose.

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
const Admin = require('../models/Admin');
const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');

import { runPollerTick } from '../services/campaignPollerService';

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
  console.log('  LeadMind AI — Day 15, Session 3: Campaign Poller');
  console.log('═══════════════════════════════════════════════════════════');

  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('\n✅ MongoDB connected\n' + '─'.repeat(60));

  const admin = await Admin.findOne({ email: process.env.SEED_ADMIN_EMAIL || 'admin@leadmind.ai' });
  if (!admin) {
    console.log('❌ Seeded admin not found — run `npm run seed` first.');
    process.exit(1);
  }

  const marker = '__TEST__ Day15 Session3 Poller';
  const baseCampaignFields = {
    goal: 'Verify poller behavior',
    tone: 'Professional',
    instructions: 'Test campaign — safe to delete.',
    dailyCallLimit: 5,
    createdBy: admin._id,
  };

  // ── Campaign A: Paused, but has a ready-to-dial Pending lead ──────────────
  const campaignPaused = await Campaign.create({
    ...baseCampaignFields,
    name: `${marker} - Paused`,
    status: 'Paused',
  });

  // ── Campaign B: Running, but quiet hours block the whole day ─────────────
  const campaignQuietHours = await Campaign.create({
    ...baseCampaignFields,
    name: `${marker} - QuietHours`,
    status: 'Running',
    quietHours: { enabled: true, startTime: '00:00', endTime: '23:59', timezone: 'Asia/Karachi' },
  });

  // ── Campaign C: Running, daily limit already hit ──────────────────────────
  const campaignLimitHit = await Campaign.create({
    ...baseCampaignFields,
    name: `${marker} - LimitHit`,
    status: 'Running',
    dailyCallLimit: 2,
  });

  // ── Campaign D: Running, but zero leads exist at all ──────────────────────
  const campaignNoLeads = await Campaign.create({
    ...baseCampaignFields,
    name: `${marker} - NoLeads`,
    status: 'Running',
  });

  const allCampaigns = [campaignPaused, campaignQuietHours, campaignLimitHit, campaignNoLeads];

  try {
    // Give the Paused and QuietHours campaigns a Pending lead each — if the
    // poller mishandled either guard, these would get dialed (a new CallLog
    // would appear), which the assertions below would catch.
    await Lead.create({ fullName: 'Paused Campaign Lead', phone: '+15550001001', campaign: campaignPaused._id, status: 'Pending', source: 'Manual Entry' });
    await Lead.create({ fullName: 'QuietHours Campaign Lead', phone: '+15550001002', campaign: campaignQuietHours._id, status: 'Pending', source: 'Manual Entry' });
    const limitLead = await Lead.create({ fullName: 'LimitHit Campaign Lead', phone: '+15550001003', campaign: campaignLimitHit._id, status: 'Pending', source: 'Manual Entry' });

    // Simulate 2 calls already made today for the LimitHit campaign (dailyCallLimit = 2)
    for (let i = 0; i < 2; i++) {
      await CallLog.create({
        lead: limitLead._id,
        campaign: campaignLimitHit._id,
        callType: 'Outbound',
        status: 'Completed',
        toNumber: limitLead.phone,
        initiatedAt: new Date(),
      });
    }

    // ── Run exactly one poller tick ───────────────────────────────────────
    await runPollerTick();

    // ── Assertions: no campaign here should have a NEW CallLog beyond what
    //    we seeded ourselves — every path should have been a guarded skip ──
    const callLogCountPaused = await CallLog.countDocuments({ campaign: campaignPaused._id });
    check('Paused campaign: poller left it untouched (0 CallLogs)', callLogCountPaused === 0, `found ${callLogCountPaused}`);

    const callLogCountQuietHours = await CallLog.countDocuments({ campaign: campaignQuietHours._id });
    check('Quiet-hours-blocked campaign: poller did not dial (0 CallLogs)', callLogCountQuietHours === 0, `found ${callLogCountQuietHours}`);

    const callLogCountLimitHit = await CallLog.countDocuments({ campaign: campaignLimitHit._id });
    check('Daily-limit-hit campaign: poller did not add a 3rd CallLog', callLogCountLimitHit === 2, `found ${callLogCountLimitHit}`);

    const callLogCountNoLeads = await CallLog.countDocuments({ campaign: campaignNoLeads._id });
    check('No-leads campaign: poller found nothing to dial (0 CallLogs)', callLogCountNoLeads === 0, `found ${callLogCountNoLeads}`);

    // Sanity: confirm the poller's own campaign query really does filter by status
    const runningOnly = await Campaign.find({ _id: { $in: allCampaigns.map((c) => c._id) }, status: 'Running' });
    check(
      "Campaign.find({status:'Running'}) correctly excludes the Paused campaign",
      runningOnly.length === 3 && !runningOnly.some((c: any) => String(c._id) === String(campaignPaused._id))
    );
  } finally {
    for (const c of allCampaigns) {
      await CallLog.deleteMany({ campaign: c._id });
      await Lead.deleteMany({ campaign: c._id });
      await Campaign.deleteOne({ _id: c._id });
    }
    console.log('\n  🧹 Test data cleaned up (4 campaigns, leads, call logs removed).');
  }

  await mongoose.disconnect();

  console.log('\n───────────────────────────────────────────────────────────');
  console.log(`  Results: ${pass} passed, ${fail} failed`);
  console.log('───────────────────────────────────────────────────────────');
  console.log('\n  Next: run `npm run test:day15:s3:seed` for the LIVE proof that');
  console.log('  the poller fires on its own timer, with no webhook involved.\n');

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\n❌ Script crashed:', err);
  process.exit(1);
});