import { Router } from 'express';
import { verifyVapiWebhook } from '../middleware/verifyVapiWebhook';
import { handleVapiWebhook } from '../controllers/webhookController';

// ─────────────────────────────────────────────────────────────────────────────
//  LeadMind AI — Webhook Routes
//  Base: /api/webhooks
//
//  No `protect` middleware here — this is called by VAPI's servers, not a
//  logged-in admin. Authenticity is verified instead via the shared secret
//  header (see verifyVapiWebhook).
// ─────────────────────────────────────────────────────────────────────────────

const router = Router();

router.post('/vapi', verifyVapiWebhook, handleVapiWebhook);

export default router;