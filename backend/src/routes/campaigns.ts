import { Router } from 'express';
import { protect } from '../middleware/auth';
import {
  createCampaign,
  getCampaigns,
  getCampaignById,
  updateCampaign,
  deleteCampaign,
  archiveCampaign,
  restoreCampaign,
  getCampaignImpact,
  syncCampaignVapi,
} from '../controllers/campaignController';
import {
  startCampaign,
  pauseCampaign,
  getQueueStatus,
} from '../controllers/campaignOrchestratorController';
import {
  validateCreateCampaign,
  validateUpdateCampaign,
} from '../middleware/validateCampaign';

// ─────────────────────────────────────────────────────────────────────────────
//  LeadMind AI — Campaign Routes
//  Base: /api/campaigns
//
//  Middleware chain per route:
//    protect → validateCreate/Update → controller
//
//  protect:          401 if no/invalid JWT
//  validateCreate:   422 if required fields missing or invalid (UC-02 A1)
//  validateUpdate:   422 if any sent field fails validation (UC-03 A1)
//
//  Day 15, Session 1: added start / pause / queue-status routes for the
//  outbound campaign orchestrator (UC-05).
// ─────────────────────────────────────────────────────────────────────────────

const router = Router();

// Every campaign route requires a valid JWT
router.use(protect);

// ── UC-02: Create — validate first, then create ───────────────────────────────
router.post('/', validateCreateCampaign, createCampaign);

// ── List all campaigns (paginated, filterable) ────────────────────────────────
router.get('/', getCampaigns);

// ── Get a single campaign by ID ───────────────────────────────────────────────
router.get('/:id', getCampaignById);

// ── UC-03: Update — validate sent fields first, then update ──────────────────
router.put('/:id', validateUpdateCampaign, updateCampaign);

// ── Day 14: manually retry syncing this campaign's VAPI assistant ────────────
router.post('/:id/sync-vapi', syncCampaignVapi);

// ── Day 15, Session 1: outbound campaign orchestrator (UC-05) ────────────────
router.post('/:id/start', startCampaign);
router.post('/:id/pause', pauseCampaign);
router.get('/:id/queue-status', getQueueStatus);

// ── Archive / restore / permanent delete ─────────────────────────────────────
//   archive  — reversible, keeps all leads/calls/meetings (the normal "delete")
//   impact   — counts shown in the confirmation dialog
//   DELETE   — irreversible; archived (or never-used draft) campaigns only,
//              needs ?confirmName=<exact name>, optional ?keepQualified=false
router.get('/:id/impact', getCampaignImpact);
router.post('/:id/archive', archiveCampaign);
router.post('/:id/restore', restoreCampaign);
router.delete('/:id', deleteCampaign);

export default router;