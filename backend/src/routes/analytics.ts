import { Router } from 'express';
import {
  getTopicAnalytics,
  getAvgCallDuration,
  getConversionRate,
  getAnalyticsSummary,
  getAnalyticsTimeseries,
} from '../controllers/analyticsController';
import { protect } from '../middleware/auth';

// ─────────────────────────────────────────────
//  LeadMind AI — Analytics Routes
//  Base: /api/analytics
//  Related UC: UC-09 — "Only authenticated users must be able to view
//  campaign data, leads, transcripts, and statistics" (SRS 2.2.4)
// ─────────────────────────────────────────────

const router = Router();

// All analytics routes require a valid JWT
router.use(protect);

// Day 17, Session 2
// GET /api/analytics/topics?campaignId=&startDate=&endDate=
router.get('/topics', getTopicAnalytics);

// GET /api/analytics/call-duration?campaignId=&startDate=&endDate=
router.get('/call-duration', getAvgCallDuration);

// GET /api/analytics/conversion-rate?campaignId=&startDate=&endDate=
router.get('/conversion-rate', getConversionRate);

// Day 25, Session 1 — NEW
// GET /api/analytics/summary?campaignId=&startDate=&endDate=
// Returns the 5 KPI card values in a single call
router.get('/summary', getAnalyticsSummary);

// GET /api/analytics/timeseries?campaignId=&startDate=&endDate=&granularity=day|week
// Returns calls/qualified/meetings per time bucket, for the multi-line chart
router.get('/timeseries', getAnalyticsTimeseries);

export default router;