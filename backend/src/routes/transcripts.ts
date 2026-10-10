import { Router } from 'express';
import { protect } from '../middleware/auth';
import { getTranscriptById } from '../controllers/transcriptController';

// ─────────────────────────────────────────────
//  LeadMind AI — Transcript Routes (Day 19, Session 1)
//  Base: /api/transcripts
//  Related UC: UC-08 — View Call Transcript
// ─────────────────────────────────────────────

const router = Router();

router.use(protect);

// GET /api/transcripts/:id
router.get('/:id', getTranscriptById);

export default router;