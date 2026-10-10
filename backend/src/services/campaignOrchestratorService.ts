// backend/src/services/campaignOrchestratorService.ts
//
// LeadMind AI — Outbound Campaign Orchestrator (Day 15)
// Related UC: UC-05 Start/Run Outbound Calling Campaign
//
// Session 1 covered: quiet hours + daily limit guards, first-attempt
// dialing (getNextEligibleLead / dialNextEligibleLead / placeOutboundCallForLead).
//
// Session 2 adds:
//   • getNextRetryDueLead — finds leads whose last call attempt failed to
//     connect and whose 30-minute retry window has arrived (UC-05 special
//     requirement: "max 2 retries, 30 minutes apart").
//   • dialNextEligibleLead now checks retry-due leads BEFORE fresh Pending
//     leads, so a lead that's waited its 30 minutes gets priority.
//   • isQueueExhausted — used by the webhook handler (Session 2) to detect
//     "no leads left, ever" vs. "nothing to dial RIGHT NOW but a retry is
//     still scheduled for later" (UC-05 step 10: "process continues until
//     the campaign is paused/stopped or the leads are finished").
//
// Still no background loop/timer here — Session 2 wires the webhook's
// end-of-call handler to call dialNextEligibleLead again once a call ends,
// keeping everything event-driven.

const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');
import { syncCampaignAssistant, createOutboundCall, buildPhoneCallOverrides } from './vapiService';
import { isWithinQuietHours } from '../utils/quietHours';
import { logError } from '../utils/errorLog';

// ─────────────────────────────────────────────────────────────────────────────
//  Result shapes
// ─────────────────────────────────────────────────────────────────────────────

export type DialSkipReason =
  | 'campaign_not_running'
  | 'quiet_hours'
  | 'daily_limit_reached'
  | 'no_eligible_leads'
  | 'vapi_sync_failed';

export interface DialResult {
  dialed: boolean;
  reason?: DialSkipReason;
  message: string;
  leadId?: string;
  callLogId?: string;
  vapiCallId?: string;
  isRetry?: boolean;
}

interface RetryDueLead {
  lead: any;
  attemptNumber: number;
  previousCallLogId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
//  countCallsMadeToday
//  "Daily call limit" is enforced per calendar day in UTC. Counts every
//  CallLog attempt (initial + retries) initiated today for this campaign —
//  matches UC-05's "clear rules, like daily calling limits."
// ─────────────────────────────────────────────────────────────────────────────
// counting daily leads to check if daily limit has reached
export async function countCallsMadeToday(campaignId: string): Promise<number> {
  const startOfTodayUTC = new Date();
  startOfTodayUTC.setUTCHours(0, 0, 0, 0);

  return CallLog.countDocuments({
    campaign: campaignId,
    callType: 'Outbound',
    initiatedAt: { $gte: startOfTodayUTC },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  getNextEligibleLead
//  UC-05 step 4: "The system chooses the next lead where status = Pending."
//  Oldest-first (FIFO) so leads are dialed in upload order.
// ─────────────────────────────────────────────────────────────────────────────

export async function getNextEligibleLead(campaignId: string) {
  return Lead.findOne({
    campaign: campaignId,
    status: 'Pending',
  }).sort({ createdAt: 1 });
}

// ─────────────────────────────────────────────────────────────────────────────
//  getNextRetryDueLead  (Session 2)
//  Finds the earliest-due retry for this campaign: takes each lead's MOST
//  RECENT call attempt (via $group + $first after sorting newest-first),
//  keeps only those whose latest attempt didn't connect and has a
//  scheduledRetryAt that has already arrived, then returns the one that's
//  been waiting longest.
//
//  Self-cleaning by design: once a retry is actually dialed, it creates a
//  NEW CallLog for that lead (no scheduledRetryAt set yet), which becomes
//  the "latest" attempt on the next query — so the old, already-handled
//  scheduledRetryAt naturally drops out of consideration without any
//  explicit cleanup step.
// ─────────────────────────────────────────────────────────────────────────────

const RETRYABLE_CALL_STATUSES = ['No Answer', 'Busy', 'Voicemail', 'Failed'];

async function getLatestCallLogPerLead(campaignId: string) {
  return CallLog.aggregate([
    { $match: { campaign: new mongoose.Types.ObjectId(campaignId), callType: 'Outbound' } },
    { $sort: { initiatedAt: -1 } },
    { $group: { _id: '$lead', latestCallLog: { $first: '$$ROOT' } } },
  ]);
}

export async function getNextRetryDueLead(campaignId: string): Promise<RetryDueLead | null> {
  const now = new Date();
  const latestPerLead = await getLatestCallLogPerLead(campaignId);

  const dueRetries = latestPerLead
    .map((row: any) => row.latestCallLog)
    .filter(
      (cl: any) =>
        RETRYABLE_CALL_STATUSES.includes(cl.status) &&
        cl.scheduledRetryAt &&
        new Date(cl.scheduledRetryAt) <= now
    )
    .sort((a: any, b: any) => new Date(a.scheduledRetryAt).getTime() - new Date(b.scheduledRetryAt).getTime());

  if (dueRetries.length === 0) return null;

  const nextCallLog = dueRetries[0];
  const lead = await Lead.findById(nextCallLog.lead);
  if (!lead) return null; // lead was deleted — skip defensively

  return {
    lead,
    attemptNumber: nextCallLog.attemptNumber + 1,
    previousCallLogId: String(nextCallLog._id),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  isQueueExhausted  (Session 2)
//  True when there is nothing left to dial for this campaign, EVER — no
//  fresh Pending leads AND no lead anywhere in its retry window (past or
//  future). Used to decide whether a campaign should auto-complete once the
//  webhook handler finds nothing to dial.
// ─────────────────────────────────────────────────────────────────────────────

export async function isQueueExhausted(campaignId: string): Promise<boolean> {
  const pendingCount = await Lead.countDocuments({ campaign: campaignId, status: 'Pending' });
  if (pendingCount > 0) return false;

  const latestPerLead = await getLatestCallLogPerLead(campaignId);
  const anyRetryStillOwed = latestPerLead.some(
    (row: any) => RETRYABLE_CALL_STATUSES.includes(row.latestCallLog.status) && row.latestCallLog.scheduledRetryAt
  );

  return !anyRetryStillOwed;
}

// ─────────────────────────────────────────────────────────────────────────────
//  placeOutboundCallForLead
//  Shared call-placement logic — used for both fresh dials and retries.
//  Never throws — always returns a DialResult.
// ─────────────────────────────────────────────────────────────────────────────

export async function placeOutboundCallForLead(
  lead: any,
  campaign: any,
  attemptNumber: number = 1,
  previousCallLogId: string | null = null
): Promise<DialResult> {
  // ── Ensure the campaign has a synced VAPI assistant ─────────────────────
  if (!campaign.vapiAssistantId) {
    try {
      const assistantId = await syncCampaignAssistant(campaign);
      campaign.vapiAssistantId = assistantId;
      campaign.vapiSyncedAt = new Date();
      await campaign.save();
    } catch (syncErr: any) {
      await logError('orchestrator.syncAssistant', syncErr, { campaignId: String(campaign._id) });
      return {
        dialed: false,
        reason: 'vapi_sync_failed',
        message: 'Could not sync campaign to VAPI before placing call.',
      };
    }
  }

  // ── Mark lead as being called ─────────────────────────────────────────
  lead.status = 'Calling';
  await lead.save();

  // ── Create the CallLog before dialing (webhook needs something to match) ──
  const callLog = await CallLog.create({
    lead: lead._id,
    campaign: campaign._id,
    callType: 'Outbound',
    status: 'Initiated',
    toNumber: lead.phone,
    vapiAssistantId: campaign.vapiAssistantId,
    attemptNumber,
    isRetry: attemptNumber > 1,
    previousCallLog: previousCallLogId,
  });

  // ── Place the real call via VAPI ─────────────────────────────────────────
  try {
    const vapiCall = await createOutboundCall(
      campaign.vapiAssistantId,
      lead.phone,
      // Same assistant, but the prompt knows whether we have this lead's email (meeting-link promise)
      buildPhoneCallOverrides(campaign, { leadEmail: lead.email })
    );
    callLog.vapiCallId = vapiCall.id;
    await callLog.save();
  } catch (callErr: any) {
    await logError('orchestrator.createCall', callErr, {
      campaignId: String(campaign._id),
      leadId: String(lead._id),
      callLogId: String(callLog._id),
    });
    callLog.status = 'Failed';
    callLog.errorMessage = callErr.response?.data?.message || callErr.message;
    await callLog.save();

    // Reflect the failure on the lead immediately — the webhook will never
    // fire for a call that was never accepted by VAPI in the first place.
    lead.status = 'Call Failed';
    await lead.save();

    return {
      dialed: false,
      message: 'VAPI rejected the call request — see CallLog.errorMessage for details.',
      leadId: String(lead._id),
      callLogId: String(callLog._id),
      isRetry: attemptNumber > 1,
    };
  }

  // ── Bump campaign call counter (best-effort, not the source of truth) ────
  await Campaign.updateOne({ _id: campaign._id }, { $inc: { 'stats.callsMade': 1 } });

  return {
    dialed: true,
    message: attemptNumber > 1 ? `Retry call placed (attempt ${attemptNumber}).` : 'Call placed successfully — awaiting VAPI webhook events.',
    leadId: String(lead._id),
    callLogId: String(callLog._id),
    vapiCallId: callLog.vapiCallId,
    isRetry: attemptNumber > 1,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  dialNextEligibleLead
//  The orchestrator "tick" — call this to attempt dialing exactly one lead.
//  Checks (in UC-05 order): campaign running → quiet hours → daily limit →
//  retry-due lead (Session 2, takes priority) → fresh Pending lead → dial.
//
//  Called from two places:
//   1. campaignOrchestratorController.startCampaign — dials the very first lead.
//   2. webhookController.handleEndOfCallReport (Session 2) — dials the next
//      lead automatically once each call ends, creating the event-driven
//      chain described in UC-05 steps 9-10.
// ─────────────────────────────────────────────────────────────────────────────

export async function dialNextEligibleLead(campaignId: string): Promise<DialResult> {
  const campaign = await Campaign.findById(campaignId);

  if (!campaign || campaign.status !== 'Running') {
    return {
      dialed: false,
      reason: 'campaign_not_running',
      message: 'Campaign is not in Running state — no calls will be placed.',
    };
  }

  // ── UC-05 step 3 / A1: quiet hours compliance ─────────────────────────────
  if (isWithinQuietHours(campaign.quietHours, new Date())) {
    return {
      dialed: false,
      reason: 'quiet_hours',
      message: 'Paused due to Quiet Hours — will resume automatically once the window ends.',
    };
  }

  // ── Special requirement: daily call limit / rate limiting ────────────────
  const callsToday = await countCallsMadeToday(campaignId);
  if (callsToday >= campaign.dailyCallLimit) {
    return {
      dialed: false,
      reason: 'daily_limit_reached',
      message: `Daily call limit reached (${callsToday}/${campaign.dailyCallLimit}). Will resume tomorrow.`,
    };
  }

  // ── Session 2: retry-due leads take priority over fresh Pending leads ────
  const retryDue = await getNextRetryDueLead(campaignId);
  if (retryDue) {
    return placeOutboundCallForLead(retryDue.lead, campaign, retryDue.attemptNumber, retryDue.previousCallLogId);
  }

  // ── UC-05 step 4: next fresh Pending lead ─────────────────────────────────
  const lead = await getNextEligibleLead(campaignId);
  if (!lead) {
    return {
      dialed: false,
      reason: 'no_eligible_leads',
      message: 'No Pending leads and no retries due right now.',
    };
  }

  // ── UC-05 steps 5-8: place the call ────────────────────────────────────────
  return placeOutboundCallForLead(lead, campaign, 1, null);
}