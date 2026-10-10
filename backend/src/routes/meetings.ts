import { Router } from 'express';
import { protect } from '../middleware/auth';
import { bookMeeting } from '../controllers/meetingController';

// ─────────────────────────────────────────────
//  LeadMind AI — Meeting Routes (Day 23, Session 2)
//  Base: /api/meetings
//  Related UC: UC-13 — Schedule Meeting
// ─────────────────────────────────────────────

const router = Router();

router.use(protect);

// POST /api/meetings/book
router.post('/book', bookMeeting);

export default router;