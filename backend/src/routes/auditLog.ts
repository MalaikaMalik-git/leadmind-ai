import { Router } from 'express';
import { protect } from '../middleware/auth';
import { getAuditLog } from '../controllers/auditLogController';

// ─────────────────────────────────────────────
//  LeadMind AI — Audit Log Routes (Day 26, Session 1)
//  Base: /api/audit-log
// ─────────────────────────────────────────────

const router = Router();

// GET /api/audit-log — Bearer-protected, paginated + filterable
router.get('/', protect, getAuditLog);

export default router;
