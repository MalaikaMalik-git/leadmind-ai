// backend/src/scripts/checkDay17Session2.ts
//
// LeadMind AI — Day 17, Session 2 verification (part 2 of 2)
// Run with: npm run test:day17:s2:check
//
// Section A (always runs, deterministic): independently computes the
// expected topic/duration/conversion numbers straight from MongoDB using
// the same filters the controller uses, then hits the three live HTTP
// endpoints and asserts the API's response matches that ground truth
// exactly. This proves the aggregation math is correct regardless of when
// you run this relative to the seed script or the optional webhook curl.
//
// Section B (informational, only if you fired the curl command from the
// seed script's output): confirms the Day 17, Session 2 webhookController
// wiring actually called the real AI service and populated
// Transcript.detectedTopics through the live end-to-end pipeline, not just
// via directly-seeded data.

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import axios from 'axios';
const Admin = require('../models/Admin');
const Campaign = require('../models/Campaign');
const CallLog = require('../models/CallLog');
const Transcript = require('../models/Transcript');
const Meeting = require('../models/Meeting');
import { signAccessToken } from '../utils/jwt';
import { TEST_CAMPAIGN_MARKER, WEBHOOK_TEST_CALL_ID } from './seedDay17Session2';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:8000';

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

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);

    const admin = await Admin.findOne({ email: process.env.SEED_ADMIN_EMAIL || 'admin@leadmind.ai' });
    if (!admin) {
      console.error('❌ No seeded admin found — run `npm run seed` first.');
      process.exit(1);
    }
    const token = signAccessToken({ adminId: admin._id.toString(), email: admin.email });

    const campaign = await Campaign.findOne({ name: TEST_CAMPAIGN_MARKER });
    if (!campaign) {
      console.error('❌ Test campaign not found — run `npm run test:day17:s2:seed` first.');
      process.exit(1);
    }
    const campaignId = campaign._id.toString();

    const client = axios.create({
      baseURL: BASE_URL,
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: () => true,
    });

    // ═══════════════════════════════════════════════════════════════════════
    //  Section A — deterministic aggregation checks
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  Section A — Analytics endpoints vs. ground truth from MongoDB');
    console.log('═══════════════════════════════════════════════════\n');

    // ── 1. Topics ──────────────────────────────────────────────────────────
    const expectedTopicAgg = await Transcript.aggregate([
      { $match: { campaign: campaign._id, detectedTopics: { $exists: true, $ne: [] } } },
      { $unwind: '$detectedTopics' },
      { $group: { _id: '$detectedTopics', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const expectedTopics = expectedTopicAgg.map((r: any) => ({ topic: r._id, count: r.count }));

    const topicsResp = await client.get('/api/analytics/topics', { params: { campaignId } });
    console.log('GET /api/analytics/topics ->', JSON.stringify(topicsResp.data?.data?.topics));

    check('GET /api/analytics/topics returns 200', topicsResp.status === 200, `got ${topicsResp.status}`);
    check(
      'topics matches ground truth from MongoDB',
      JSON.stringify(topicsResp.data?.data?.topics) === JSON.stringify(expectedTopics),
      `expected ${JSON.stringify(expectedTopics)}, got ${JSON.stringify(topicsResp.data?.data?.topics)}`
    );
    check(
      'topics includes "Mobile App" with count 2 (from seed transcripts 1 & 2)',
      expectedTopics.some((t: any) => t.topic === 'Mobile App' && t.count === 2) &&
        topicsResp.data?.data?.topics?.some((t: any) => t.topic === 'Mobile App' && t.count === 2)
    );

    // ── 2. Average call duration ──────────────────────────────────────────
    const [expectedDurationAgg] = await CallLog.aggregate([
      { $match: { campaign: campaign._id, status: 'Completed' } },
      { $group: { _id: null, averageDurationSeconds: { $avg: '$durationSeconds' }, totalCallsIncluded: { $sum: 1 } } },
    ]);
    const expectedAvgDuration = expectedDurationAgg ? Math.round(expectedDurationAgg.averageDurationSeconds) : 0;
    const expectedCallsIncluded = expectedDurationAgg ? expectedDurationAgg.totalCallsIncluded : 0;

    const durationResp = await client.get('/api/analytics/call-duration', { params: { campaignId } });
    console.log('\nGET /api/analytics/call-duration ->', JSON.stringify(durationResp.data?.data));

    check('GET /api/analytics/call-duration returns 200', durationResp.status === 200, `got ${durationResp.status}`);
    check(
      `averageDurationSeconds === ${expectedAvgDuration}`,
      durationResp.data?.data?.averageDurationSeconds === expectedAvgDuration,
      `got ${durationResp.data?.data?.averageDurationSeconds}`
    );
    check(
      `totalCallsIncluded === ${expectedCallsIncluded}`,
      durationResp.data?.data?.totalCallsIncluded === expectedCallsIncluded,
      `got ${durationResp.data?.data?.totalCallsIncluded}`
    );

    // ── 3. Conversion rate ────────────────────────────────────────────────
    const expectedCallsAnswered = await CallLog.countDocuments({ campaign: campaign._id, answeredAt: { $ne: null } });
    const expectedMeetingsBooked = await Meeting.countDocuments({ campaign: campaign._id });
    const expectedConversionRate =
      expectedCallsAnswered > 0 ? Math.round((expectedMeetingsBooked / expectedCallsAnswered) * 1000) / 10 : 0;

    const conversionResp = await client.get('/api/analytics/conversion-rate', { params: { campaignId } });
    console.log('\nGET /api/analytics/conversion-rate ->', JSON.stringify(conversionResp.data?.data));

    check('GET /api/analytics/conversion-rate returns 200', conversionResp.status === 200, `got ${conversionResp.status}`);
    check(
      `callsAnswered === ${expectedCallsAnswered}`,
      conversionResp.data?.data?.callsAnswered === expectedCallsAnswered,
      `got ${conversionResp.data?.data?.callsAnswered}`
    );
    check(
      `meetingsBooked === ${expectedMeetingsBooked}`,
      conversionResp.data?.data?.meetingsBooked === expectedMeetingsBooked,
      `got ${conversionResp.data?.data?.meetingsBooked}`
    );
    check(
      `conversionRatePercent === ${expectedConversionRate}`,
      conversionResp.data?.data?.conversionRatePercent === expectedConversionRate,
      `got ${conversionResp.data?.data?.conversionRatePercent}`
    );

    // ── 4. Auth is actually enforced ──────────────────────────────────────
    const noAuthResp = await axios.get(`${BASE_URL}/api/analytics/topics`, { validateStatus: () => true });
    check('Analytics routes reject requests with no JWT (401)', noAuthResp.status === 401, `got ${noAuthResp.status}`);

    // ═══════════════════════════════════════════════════════════════════════
    //  Section B — live webhook wiring (informational / optional)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  Section B — Live webhook -> AI topic analysis wiring');
    console.log('═══════════════════════════════════════════════════\n');

    const webhookCallLog = await CallLog.findOne({ vapiCallId: WEBHOOK_TEST_CALL_ID });
    if (!webhookCallLog || webhookCallLog.status === 'Initiated') {
      console.log('  ℹ️  Webhook curl not fired yet — this section is skipped (not a failure).');
      console.log('     Fire the curl command printed by the seed script, then re-run this check');
      console.log('     to confirm the live webhook -> analyzeAndPersistTopics wiring.');
    } else {
      const webhookTranscript = webhookCallLog.transcript
        ? await Transcript.findById(webhookCallLog.transcript)
        : null;

      check('Webhook-driven CallLog reached status "Completed"', webhookCallLog.status === 'Completed', `got "${webhookCallLog.status}"`);
      check('Webhook-driven Transcript was created', !!webhookTranscript);
      if (webhookTranscript) {
        console.log('  Transcript.detectedTopics:', JSON.stringify(webhookTranscript.detectedTopics));
        check(
          'Transcript.detectedTopics was populated by the live AI service call (non-empty)',
          Array.isArray(webhookTranscript.detectedTopics) && webhookTranscript.detectedTopics.length > 0,
          'AI service may be down — check ai-service is running on the configured AI_SERVICE_URL'
        );
        check(
          'Detected topics include ERP and/or CRM (matches curl payload wording)',
          webhookTranscript.detectedTopics.includes('ERP') || webhookTranscript.detectedTopics.includes('CRM')
        );
      }
    }

    console.log('\n───────────────────────────────────────────────────────────');
    console.log(`  Results: ${pass} passed, ${fail} failed`);
    console.log('───────────────────────────────────────────────────────────\n');

    process.exit(fail > 0 ? 1 : 0);
  } catch (err) {
    console.error('❌ Check failed:', err);
    process.exit(1);
  }
})();