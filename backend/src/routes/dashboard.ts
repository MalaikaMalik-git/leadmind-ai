import { Router } from 'express';
import { getDashboardStats, getDashboardCallVolume } from '../controllers/dashboardController';
import { protect } from '../middleware/auth';

// ─────────────────────────────────────────────
//  LeadMind AI — Dashboard Routes
//  Base: /api/dashboard
// ─────────────────────────────────────────────

const router = Router();

// All dashboard routes require a valid JWT
router.use(protect);

// GET /api/dashboard/stats
// Returns KPIs, chart data, recent leads, active campaigns
router.get('/stats', getDashboardStats);

// GET /api/dashboard/call-volume?days=7|30|90
// Chart data for the dashboard's 7D / 30D / 90D toggle
router.get('/call-volume', getDashboardCallVolume);

export default router;