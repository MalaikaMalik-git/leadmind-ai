// backend/src/middleware/verifyVapiWebhook.ts
//
// LeadMind AI — VAPI Webhook Verification (Day 14, Session 3)
//
// VAPI sends the secret you configured (Server URL Secret in the VAPI
// dashboard → Session 1) back on every webhook request in the
// `x-vapi-secret` header. We compare it against VAPI_WEBHOOK_SECRET using a
// timing-safe comparison so this endpoint can't be spoofed by an outsider
// who doesn't know the secret.
//
// Security requirement (spec 2.2.4): "Only authenticated users/services
// must be able to..." — for webhooks, "authentication" means proving the
// request genuinely came from VAPI.

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export const verifyVapiWebhook = (req: Request, res: Response, next: NextFunction): void => {
  const expectedSecret = process.env.VAPI_WEBHOOK_SECRET;
  const receivedSecret = req.headers['x-vapi-secret'];

  if (!expectedSecret) {
    console.error('[verifyVapiWebhook] VAPI_WEBHOOK_SECRET is not set in backend/.env');
    res.status(500).json({ success: false, message: 'Webhook not configured on server.' });
    return;
  }

  if (!receivedSecret || typeof receivedSecret !== 'string') {
    res.status(401).json({ success: false, message: 'Missing webhook secret.' });
    return;
  }

  // Timing-safe compare — both buffers must be equal length or timingSafeEqual throws
  const expectedBuf = Buffer.from(expectedSecret);
  const receivedBuf = Buffer.from(receivedSecret);

  const isValid =
    expectedBuf.length === receivedBuf.length &&
    crypto.timingSafeEqual(expectedBuf, receivedBuf);

  if (!isValid) {
    res.status(401).json({ success: false, message: 'Invalid webhook secret.' });
    return;
  }

  next();
};