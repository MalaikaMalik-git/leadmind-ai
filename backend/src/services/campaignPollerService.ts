// backend/src/services/campaignPollerService.ts
//
// LeadMind AI — Campaign Poller (Day 15, Session 3)
// Related UC: UC-05 Start/Run Outbound Calling Campaign
//
// The gap this closes: webhookController's auto-advance (Session 2) only
// fires dialNextEligibleLead() when ANOTHER call just ended. If a campaign
// has, say, one lead sitting in a scheduled retry (30 minutes out) and
// nothing else in flight, nothing will ever wake the orchestrator back up
// — the chain would stall silently until someone manually hits /start again.
//
// This is a deliberately simple in-process poller (setInterval), not a
// Redis/Bull queue or cron job — appropriate for this project's scale and
// deployment target (Render free tier, Day 29). Every tick, for every
// Running campaign, it calls dialNextEligibleLead() exactly once — the
// same guarded function Sessions 1-2 already built, so quiet hours, daily
// limits, and retry-due checks are respected automatically. No new
// dialing logic lives here; this file only decides WHEN to ask.
//
// Test scripts import runPollerTick() directly and never touch
// startCampaignPoller()/index.ts, so running `npm run test:day15:s3`
// never starts a real interval or opens a port.

const Campaign = require('../models/Campaign');
import { dialNextEligibleLead } from './campaignOrchestratorService';

const DEFAULT_INTERVAL_MS = 60 * 1000; // 1 minute — well within the 30-minute retry window

let pollerHandle: ReturnType<typeof setInterval> | null = null;

// ─────────────────────────────────────────────────────────────────────────────
//  runPollerTick
//  One pass over every Running campaign. Sequential (not Promise.all) to
//  avoid bursts of simultaneous outbound VAPI calls across campaigns.
//  Never throws — a single campaign's failure is logged and skipped so it
//  can't take down the whole tick (or, if run inside setInterval, the
//  process).
// ─────────────────────────────────────────────────────────────────────────────

export async function runPollerTick(): Promise<void> {
  const runningCampaigns = await Campaign.find({ status: 'Running' }).select('_id name');

  for (const campaign of runningCampaigns) {
    try {
      const result = await dialNextEligibleLead(String(campaign._id));
      if (result.dialed) {
        console.log(`[poller] Dialed lead for campaign "${campaign.name}" (${campaign._id}): ${result.message}`);
      }
      // Routine skips (quiet hours / daily limit / nothing due yet) are
      // expected most ticks and not logged, to avoid spamming the console
      // once per minute per idle campaign.
    } catch (err: any) {
      console.error(`[poller] Tick failed for campaign ${campaign._id}:`, err.message);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  startCampaignPoller / stopCampaignPoller
//  Called once from index.ts after MongoDB connects. Returns the interval
//  handle so it can be cleared on graceful shutdown if ever needed.
// ─────────────────────────────────────────────────────────────────────────────

export function startCampaignPoller(intervalMs: number = DEFAULT_INTERVAL_MS): ReturnType<typeof setInterval> {
  if (pollerHandle) {
    console.warn('[poller] startCampaignPoller called again — clearing previous interval first.');
    clearInterval(pollerHandle);
  }

  console.log(`[poller] Campaign poller started — checking every ${intervalMs / 1000}s for due retries / eligible leads.`);
  pollerHandle = setInterval(() => {
    runPollerTick().catch((err) => console.error('[poller] Unexpected tick error:', err));
  }, intervalMs);

  return pollerHandle;
}

export function stopCampaignPoller(): void {
  if (pollerHandle) {
    clearInterval(pollerHandle);
    pollerHandle = null;
    console.log('[poller] Campaign poller stopped.');
  }
}