import { Router } from 'express';
import { protect } from '../middleware/auth';
import { placeTestOutboundCall, testQualifyLead, getCalls } from '../controllers/callController';
import { startWebCall, attachWebCall, syncWebCall } from '../controllers/webCallController';

// ─────────────────────────────────────────────────────────────────────────────
//  LeadMind AI — Call Routes
//  Base: /api/calls
//
//  Day 14, Session 4: manual single-call trigger for end-to-end testing.
//  The full outbound campaign orchestrator (queueing, quiet hours, retries)
//  is built on Day 15 and will live alongside this file.
//  Day 16, Session 2: manual AI qualification trigger — runs a fake
//  completed call through the real scoring + persistence pipeline (UC-12)
//  without needing a live VAPI call.
//  Day 20, Session 1: GET / — unified, filterable call log (UC-08).
// ─────────────────────────────────────────────────────────────────────────────

const router = Router();

router.use(protect);

router.get('/', getCalls);
router.post('/test-outbound', placeTestOutboundCall);
router.post('/test-qualify', testQualifyLead);

// DEMO: browser web call (additive — phone calling above is unchanged)
router.post('/web/start', startWebCall);
router.post('/web/:id/attach', attachWebCall);
router.get('/web/:id/sync', syncWebCall);

export default router;