// backend/src/scripts/testDay15Session1.ts
//
// LeadMind AI — Day 15, Session 1 verification script
// Run with: npm run test:day15:s1
//
// What this checks:
//   1. isWithinQuietHours / getQuietHoursStatus — pure logic, several
//      time/timezone scenarios, no DB needed.
//   2. getNextEligibleLead — picks the oldest Pending lead first (FIFO).
//   3. countCallsMadeToday — counts only today's CallLog attempts.
//   4. dialNextEligibleLead's four guard clauses:
//        campaign_not_running / quiet_hours / daily_limit_reached / no_eligible_leads
//
// What this deliberately does NOT do:
//   It never reaches the real "place a call via VAPI" branch. The Day 14
//   Telnyx/Pakistan-calling restriction is still open and will be resolved
//   with Vonage AFTER Day 15 is complete — this script only proves the
//   orchestration logic around that call is correct. All test data created
//   here (campaign + leads + call logs) is deleted again at the end,
//   win or lose.

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
const Admin = require('../models/Admin');
const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');

import { isWithinQuietHours, getQuietHoursStatus, QuietHoursConfig } from '../utils/quietHours';
import {
  getNextEligibleLead,
  countCallsMadeToday,
  dialNextEligibleLead,
} from '../services/campaignOrchestratorService';

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

// ─────────────────────────────────────────────────────────────────────────────
//  Section 1 — Quiet hours pure-logic tests (no DB)
// ─────────────────────────────────────────────────────────────────────────────

function testQuietHoursLogic() {
  console.log('\n🧪 Section 1 — Quiet Hours Logic (pure functions, no DB)\n' + '─'.repeat(60));

  const overnightConfig: QuietHoursConfig = {
    enabled: true,
    startTime: '22:00',
    endTime: '08:00',
    timezone: 'Asia/Karachi',
  };

  // Asia/Karachi is UTC+5, no DST — safe to compute fixed offsets.
  const at23_30PKT = new Date('2026-07-29T18:30:00Z');   // 23:30 PKT -> inside 22:00-08:00
  const at12_00PKT = new Date('2026-07-29T07:00:00Z');   // 12:00 PKT -> outside window
  const at03_00PKT = new Date('2026-07-29T22:00:00Z');   // 03:00 PKT (next day) -> inside window

  check('Overnight window: 23:30 PKT is blocked', isWithinQuietHours(overnightConfig, at23_30PKT) === true);
  check('Overnight window: 12:00 PKT is NOT blocked', isWithinQuietHours(overnightConfig, at12_00PKT) === false);
  check('Overnight window: 03:00 PKT (past midnight) is blocked', isWithinQuietHours(overnightConfig, at03_00PKT) === true);

  const sameDayConfig: QuietHoursConfig = {
    enabled: true,
    startTime: '13:00',
    endTime: '18:00',
    timezone: 'Asia/Karachi',
  };
  const at15_00PKT = new Date('2026-07-29T10:00:00Z'); // 15:00 PKT -> inside
  const at19_00PKT = new Date('2026-07-29T14:00:00Z'); // 19:00 PKT -> outside

  check('Same-day window: 15:00 PKT is blocked', isWithinQuietHours(sameDayConfig, at15_00PKT) === true);
  check('Same-day window: 19:00 PKT is NOT blocked', isWithinQuietHours(sameDayConfig, at19_00PKT) === false);

  const disabledConfig: QuietHoursConfig = {
    enabled: false,
    startTime: '22:00',
    endTime: '08:00',
    timezone: 'Asia/Karachi',
  };
  check('Disabled quiet hours never block', isWithinQuietHours(disabledConfig, at23_30PKT) === false);

  const status = getQuietHoursStatus(overnightConfig, at23_30PKT);
  check(
    'getQuietHoursStatus reports blocked=true with a readable reason',
    status.blocked === true && status.reason.includes('Paused due to Quiet Hours'),
    JSON.stringify(status)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Section 2 — DB-backed orchestrator tests
// ─────────────────────────────────────────────────────────────────────────────

async function testOrchestratorWithDb() {
  console.log('\n🧪 Section 2 — Orchestrator (live DB, test data cleaned up after)\n' + '─'.repeat(60));

  const admin = await Admin.findOne({ email: process.env.SEED_ADMIN_EMAIL || 'admin@leadmind.ai' });
  if (!admin) {
    console.log('  ❌ Seeded admin not found — run `npm run seed` first.');
    fail++;
    return;
  }

  // ── Create an isolated test campaign ────────────────────────────────────
  const campaign = await Campaign.create({
    name: '__TEST__ Day15 Session1 Orchestrator',
    goal: 'Verify orchestrator logic',
    tone: 'Professional',
    instructions: 'Test campaign — safe to delete.',
    dailyCallLimit: 5,
    status: 'Draft',
    createdBy: admin._id,
  });

  try {
    // ── Test A: no eligible leads yet → should skip with 'no_eligible_leads' ──
    campaign.status = 'Running';
    await campaign.save();
    const noLeadsResult = await dialNextEligibleLead(String(campaign._id));
    check(
      "dialNextEligibleLead skips with reason 'no_eligible_leads' when queue is empty",
      noLeadsResult.dialed === false && noLeadsResult.reason === 'no_eligible_leads',
      JSON.stringify(noLeadsResult)
    );

    // ── Create 3 Pending leads, oldest first ──────────────────────────────
    const leadA = await Lead.create({ fullName: 'Test Lead A', phone: '+15550000001', campaign: campaign._id, status: 'Pending', source: 'Manual Entry' });
    await new Promise((r) => setTimeout(r, 10));
    const leadB = await Lead.create({ fullName: 'Test Lead B', phone: '+15550000002', campaign: campaign._id, status: 'Pending', source: 'Manual Entry' });
    await new Promise((r) => setTimeout(r, 10));
    await Lead.create({ fullName: 'Test Lead C', phone: '+15550000003', campaign: campaign._id, status: 'Pending', source: 'Manual Entry' });

    // ── Test B: FIFO ordering ─────────────────────────────────────────────
    const nextLead = await getNextEligibleLead(String(campaign._id));
    check(
      'getNextEligibleLead returns the oldest Pending lead (FIFO)',
      String(nextLead?._id) === String(leadA._id),
      `expected ${leadA._id}, got ${nextLead?._id}`
    );

    // ── Test C: countCallsMadeToday starts at 0 ───────────────────────────
    const callsBefore = await countCallsMadeToday(String(campaign._id));
    check('countCallsMadeToday is 0 before any calls', callsBefore === 0, `got ${callsBefore}`);

    // ── Test D: campaign_not_running guard ────────────────────────────────
    campaign.status = 'Paused';
    await campaign.save();
    const pausedResult = await dialNextEligibleLead(String(campaign._id));
    check(
      "dialNextEligibleLead skips with reason 'campaign_not_running' when Paused",
      pausedResult.dialed === false && pausedResult.reason === 'campaign_not_running',
      JSON.stringify(pausedResult)
    );
    campaign.status = 'Running';
    await campaign.save();

    // ── Test E: quiet_hours guard ──────────────────────────────────────────
    campaign.quietHours = { enabled: true, startTime: '00:00', endTime: '23:59', timezone: 'Asia/Karachi' };
    await campaign.save();
    const quietResult = await dialNextEligibleLead(String(campaign._id));
    check(
      "dialNextEligibleLead skips with reason 'quiet_hours' when inside quiet window",
      quietResult.dialed === false && quietResult.reason === 'quiet_hours',
      JSON.stringify(quietResult)
    );
    campaign.quietHours = { enabled: false, startTime: '22:00', endTime: '08:00', timezone: 'Asia/Karachi' };
    await campaign.save();

    // ── Test F: daily_limit_reached guard ──────────────────────────────────
    // Simulate 5 calls already made today (dailyCallLimit is 5).
    for (let i = 0; i < 5; i++) {
      await CallLog.create({
        lead: leadA._id,
        campaign: campaign._id,
        callType: 'Outbound',
        status: 'Completed',
        toNumber: leadA.phone,
        initiatedAt: new Date(),
      });
    }
    const limitResult = await dialNextEligibleLead(String(campaign._id));
    check(
      "dialNextEligibleLead skips with reason 'daily_limit_reached' once dailyCallLimit is hit",
      limitResult.dialed === false && limitResult.reason === 'daily_limit_reached',
      JSON.stringify(limitResult)
    );

    const callsAfter = await countCallsMadeToday(String(campaign._id));
    check('countCallsMadeToday correctly counts the 5 simulated calls', callsAfter === 5, `got ${callsAfter}`);
  } finally {
    // ── Cleanup — always runs, even if a check above failed ────────────────
    await CallLog.deleteMany({ campaign: campaign._id });
    await Lead.deleteMany({ campaign: campaign._id });
    await Campaign.deleteOne({ _id: campaign._id });
    console.log('\n  🧹 Test data cleaned up (campaign, leads, call logs removed).');
  }
}

// ─────────────────────────────────────────────────────────────────────────────

(async () => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  LeadMind AI — Day 15, Session 1: Orchestrator Foundation');
  console.log('═══════════════════════════════════════════════════════════');

  testQuietHoursLogic();

  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('\n✅ MongoDB connected');

  await testOrchestratorWithDb();

  await mongoose.disconnect();

  console.log('\n───────────────────────────────────────────────────────────');
  console.log(`  Results: ${pass} passed, ${fail} failed`);
  console.log('───────────────────────────────────────────────────────────\n');

  process.exit(fail > 0 ? 1 : 0);
})().catch((err) => {
  console.error('\n❌ Script crashed:', err);
  process.exit(1);
});