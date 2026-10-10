// backend/src/controllers/webhookController.ts
//
// LeadMind AI — VAPI Webhook Handler
// Related UCs: UC-05 (Outbound pipeline), UC-08 (Call Transcripts),
//              UC-09 (Reporting & Analytics), UC-10/UC-11 (Inbound/Outbound
//              call handling)
//
// Day 14, Session 3: base handler — status-update + end-of-call-report,
// updates CallLog/Transcript/Lead.
//
// Day 15, Session 2 additions to handleEndOfCallReport:
//   • Retry scheduling — if the call never connected (No Answer / Busy /
//     Voicemail / Failed) and the campaign's retry budget isn't exhausted,
//     set CallLog.scheduledRetryAt = now + retryDelayMinutes (UC-05 special
//     requirement: "max 2 retries, 30 minutes apart").
//   • Campaign stats — increments stats.callsAnswered / noAnswer / failed
//     so the dashboard (Day 6) and analytics (Day 17/25) have real numbers
//     to show. meetingsBooked stays untouched here — that depends on
//     calendar booking (Day 22+), which doesn't exist yet.
//
// Day 16, Session 2 addition to handleEndOfCallReport:
//   • AI qualification scoring — once a call fully completes with a real
//     conversation (not partial/abandoned, not No Answer/Busy/etc.), the
//     transcript is sent to the FastAPI /qualify service (Day 16, Session 1)
//     via qualifyAndPersist(). This sets the transcript's/lead's final
//     status to Qualified or Not Qualified, stores the score + breakdown +
//     reason, and increments Campaign.stats.qualified/notQualified. If the
//     AI service is unreachable, scoring fails non-fatally and the call is
//     left as "Needs Human Follow-up" (matches UC-12 A2) rather than
//     crashing the webhook.
//   • Auto-advance — after handling this call, calls
//     dialNextEligibleLead(campaignId) so the NEXT lead (a due retry or a
//     fresh Pending lead) gets dialed automatically, without any manual
//     "start" click per lead (UC-05 steps 9-10: "the system goes to the
//     next lead... continues until the campaign is paused/stopped or the
//     leads are finished").
//   • Auto-complete — if nothing is left to dial, ever (isQueueExhausted),
//     the campaign is marked Completed automatically.
//
// Day 17, Session 2 addition to handleEndOfCallReport:
//   • AI topic analysis — runs alongside qualification (not instead of it)
//     for the same completed calls. Sends the transcript to the FastAPI
//     /analyze-topics service (Day 17, Session 1) via
//     analyzeAndPersistTopics(), which sets Transcript.detectedTopics.
//     This powers the "Most Discussed Topics" analytics endpoint
//     (GET /api/analytics/topics). Independent failure domain from
//     qualification — the AI service being down for scoring (or vice versa)
//     never blocks the other; each is caught and logged non-fatally on its
//     own, matching the qualification service's established pattern.
//
// Day 18, Session 2 additions:
//   • Reactive Lead/CallLog creation — unlike outbound (where the CallLog is
//     pre-created before dialing), an inbound call arrives with no existing
//     CallLog. handleStatusUpdate and handleEndOfCallReport now both fall
//     back to findOrCreateInboundCallLog() when no CallLog matches the
//     vapiCallId, which finds an existing Lead by phone (a past outbound
//     lead calling back keeps their history) or creates a new one with
//     source='Inbound Call'.
//   • Outside-hours branch — the assistant-request handler (Session 1)
//     already decided, in real time, whether this call got the normal
//     intake assistant or the outside-hours courtesy assistant. That
//     decision is recorded in the in-memory `inboundCallRouting` map (same
//     Node process handles both events for a given call) and consulted here
//     to set Transcript.finalStatus = 'Callback Requested' and skip the
//     Day 16/17 AI qualification + topic analysis pipeline entirely — a
//     courtesy "please call back" exchange isn't a sales conversation to
//     qualify or extract project topics from.
//   • Outbound-only guards — retry scheduling, Campaign.stats increments,
//     and auto-advance-to-next-lead are outbound-campaign machinery. An
//     inbound call from someone who happens to already be a lead in a
//     Running campaign must NOT trigger any of that; all three blocks are
//     now gated on callLog.callType === 'Outbound'.
//
// This handler always responds 200 quickly once it has done its DB work —
// VAPI does not need a meaningful response body, just an acknowledgement.
// Auto-advance is wrapped so a dialing failure never breaks the webhook ack.

import { Request, Response } from 'express';
const CallLog = require('../models/CallLog');
const Lead = require('../models/Lead');
const Transcript = require('../models/Transcript');
const Campaign = require('../models/Campaign');
import { dialNextEligibleLead, isQueueExhausted } from '../services/campaignOrchestratorService';
import { qualifyAndPersist } from '../services/qualificationService';
import { analyzeAndPersistTopics } from '../services/topicAnalysisService';
import { autoBookMeetingForQualifiedLead } from '../services/meetingAutomationService';
import { getBusinessHoursStatus } from '../utils/businessHours';
import { buildInboundAssistantConfig, buildOutsideHoursAssistantConfig } from '../services/vapiService';
import { logError } from '../utils/errorLog';

// ── Statuses that mean the call never actually connected — eligible for retry ──
const RETRYABLE_CALL_STATUSES = ['No Answer', 'Busy', 'Voicemail', 'Failed'];

// ── Day 18, Session 2: assistant-request routing decisions, keyed by vapiCallId ──
// Populated synchronously in handleAssistantRequest (Session 1) the instant
// we decide which assistant answers an inbound call; consumed and deleted in
// handleEndOfCallReport once that call ends. This only works because a
// single Node process handles both events for the same call — true for this
// project's single-instance deployment (Render free tier, no horizontal
// scaling). A multi-instance deployment would need this persisted
// externally (e.g. Redis, or a DB write at assistant-request time) instead.
const inboundCallRouting = new Map<string, 'normal' | 'outside-hours'>();

// ── Maps VAPI's `endedReason` values to our CallLog status enum ──────────────
function mapEndedReasonToStatus(endedReason: string | undefined): string {
  if (!endedReason) return 'Completed';

  const reason = endedReason.toLowerCase();

  if (reason.includes('no-answer') || reason.includes('did-not-answer')) return 'No Answer';
  if (reason.includes('busy')) return 'Busy';
  if (reason.includes('voicemail')) return 'Voicemail';
  if (reason.includes('customer-ended-call') || reason.includes('assistant-ended-call')) return 'Completed';
  if (reason.includes('error') || reason.includes('pipeline')) return 'Failed';

  return 'Completed';
}

// ── Converts VAPI's raw transcript/messages into our Transcript.messages[] shape ──
function buildTranscriptMessages(vapiMessages: any[] | undefined): Array<{ speaker: 'AI' | 'Lead'; text: string; timestamp: Date }> {
  if (!Array.isArray(vapiMessages)) return [];

  return vapiMessages
    .filter((m) => m.role === 'assistant' || m.role === 'user')
    .map((m) => ({
      speaker: (m.role === 'assistant' ? 'AI' : 'Lead') as 'AI' | 'Lead',
      text: m.message || m.content || '',
      timestamp: m.time ? new Date(m.time) : new Date(),
    }))
    .filter((m) => m.text.trim().length > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/webhooks/vapi
// ─────────────────────────────────────────────────────────────────────────────

export const handleVapiWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const message = req.body?.message;

    if (!message || !message.type) {
      // Acknowledge anyway — VAPI may send message shapes we don't handle yet
      res.status(200).json({ received: true, handled: false });
      return;
    }

    switch (message.type) {
      case 'status-update':
        await handleStatusUpdate(message);
        break;

      case 'end-of-call-report':
        await handleEndOfCallReport(message);
        break;

      case 'assistant-request':
        // Day 18, Session 1 (UC-10): unlike every other event type, this one
        // requires a specific, meaningful response body (which assistant to
        // use for this inbound call) sent directly — not the generic
        // {received:true} ack the rest of this handler sends. Vapi also
        // enforces a hard 7.5s response budget for this event specifically,
        // so it returns immediately rather than falling through below.
        handleAssistantRequest(message, res);
        return;

      default:
        // Not an event we act on yet (e.g. transcript partials, function-call
        // events used later for live qualification)
        break;
    }

    res.status(200).json({ received: true, handled: true, type: message.type });
  } catch (err: any) {
    await logError('webhook.handleVapiWebhook', err, { messageType: req.body?.message?.type });
    // Still respond 200 — VAPI will retry on non-2xx, and we've already
    // logged the error for debugging. Returning 500 here would just cause
    // repeated retries of an event we already failed to process once.
    res.status(200).json({ received: true, handled: false, error: 'internal_error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  assistant-request (Day 18, Session 1) — UC-10: Receive Inbound Call
//
//  Fired by Vapi when an inbound call arrives at a phone number with no
//  assistantId configured (see vapiService.attachServerUrlToPhoneNumber).
//  We must respond within 7.5 seconds with either an assistant config to
//  use for this call, or an error message to speak to the caller.
//
//  Deliberately synchronous and DB-free: business hours is a pure function
//  over env vars + the current time (utils/businessHours.ts), so this path
//  never waits on Mongo. Reactive Lead/CallLog/Transcript creation for the
//  call happens later, off this critical path, in handleStatusUpdate /
//  handleEndOfCallReport (Day 18, Session 2) — those events arrive after
//  the assistant has already been selected and the call is underway, so
//  there's no response-time pressure on them.
// ─────────────────────────────────────────────────────────────────────────────

function handleAssistantRequest(message: any, res: Response): void {
  try {
    const vapiCallId = message.call?.id;
    const status = getBusinessHoursStatus();

    console.log(
      `[webhook:assistant-request] Inbound call from ${message.call?.customer?.number || 'unknown number'} — ` +
        `${status.withinBusinessHours ? 'within' : 'outside'} business hours ` +
        `(${status.currentTimeInZone} ${status.timezone}, window ${status.windowStart}-${status.windowEnd})`
    );

    // Day 18, Session 2: remember which branch we chose for this call so
    // handleEndOfCallReport can skip AI qualification/topic analysis for
    // outside-hours courtesy calls once the call ends.
    if (vapiCallId) {
      inboundCallRouting.set(vapiCallId, status.withinBusinessHours ? 'normal' : 'outside-hours');
    }

    const assistant = status.withinBusinessHours
      ? buildInboundAssistantConfig()
      : buildOutsideHoursAssistantConfig({
          start: status.windowStart,
          end: status.windowEnd,
          timezone: status.timezone,
        });

    res.status(200).json({ assistant });
  } catch (err: any) {
    // Deliberately NOT awaited — this function must respond within Vapi's
    // 7.5s budget, and this whole code path exists specifically to avoid
    // ever blocking on a database round-trip (see the module-level comment
    // above). The DB write happens in the background; console logging
    // inside logError() still fires synchronously either way.
    void logError('webhook.assistantRequest', err, { vapiCallId: message.call?.id });
    // Per Vapi's contract, "error" is spoken to the caller rather than the
    // call silently failing — better UX than a dead line if something here
    // throws unexpectedly.
    res.status(200).json({ error: "Sorry, we're having a technical issue right now. Please try calling back shortly." });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  findOrCreateInboundCallLog (Day 18, Session 2) — UC-10
//
//  Called when a webhook event references a vapiCallId with no matching
//  CallLog. For outbound this is always an error (the CallLog is always
//  pre-created before we ask Vapi to dial). For inbound, it's the NORMAL
//  case — Vapi originates the call, so nothing exists in our DB yet until
//  the first event arrives.
//
//  Lead lookup is intentionally global (not scoped to a campaign) — a
//  caller may already be an existing outbound lead from a past or running
//  campaign calling back. Matching them by phone preserves their history
//  (campaign, prior status, totalCallAttempts) instead of fragmenting it
//  across duplicate Lead documents. A genuinely new caller gets a fresh
//  Lead with source='Inbound Call' and campaign=null (UC-10 post-condition:
//  "Lead outcome status is recorded").
// ─────────────────────────────────────────────────────────────────────────────

async function findOrCreateInboundCallLog(message: any): Promise<any | null> {
  const vapiCallId = message.call?.id;
  if (!vapiCallId) return null;

  // Only ever reactively create for genuinely inbound calls — outbound
  // CallLogs are always pre-created by the campaign orchestrator, so a
  // missing CallLog there is a real error condition, not something to
  // paper over.
  if (message.call?.type !== 'inboundPhoneCall') return null;

  const fromNumber: string | null = message.call?.customer?.number || null;
  const toNumber: string = message.phoneNumber?.number || 'Unknown';

  // Day 21, Session 1 follow-up fix (originally flagged as a deferred
  // limitation — confirmed reproducible under genuine concurrency by that
  // session's own Part C test, so fixing it properly now rather than
  // leaving it deferred).
  //
  // Global findOne first: recognizes a RETURNING lead regardless of which
  // campaign they belong to (or none) — this is what makes a past
  // outbound lead calling back correctly reuse their existing history
  // instead of fragmenting into a duplicate record.
  //
  // If genuinely not found, the CREATE step below uses an atomic upsert —
  // scoped to { phone, campaign: null } specifically — instead of a plain
  // create(). This closes the exact race Day 21's test caught: two
  // simultaneous inbound calls from the same brand-new number can no
  // longer both create a Lead, because MongoDB itself now serializes the
  // upsert. Scoping the upsert's match to campaign:null (rather than just
  // phone) is deliberate: it only ever guards NEW inbound-created leads
  // against each other. It can never collide with Day 11's CSV import
  // leads (which live in a specific campaign) because those are already
  // caught by the global findOne above — if a lead search happens to race
  // against a brand-new CSV import at the exact same instant, the result
  // is at most a second Lead document across campaigns, which is the
  // SAME already-accepted behavior Day 11 intentionally allows, not a new
  // kind of bug.
  let lead = fromNumber ? await Lead.findOne({ phone: fromNumber }) : null;

  if (lead) {
    lead.status = 'Calling';
    await lead.save();
    console.log(`[webhook] Inbound call matched existing Lead ${lead._id} (${fromNumber}), campaign=${lead.campaign || 'none'}`);
  } else if (fromNumber) {
    lead = await Lead.findOneAndUpdate(
      { phone: fromNumber, campaign: null },
      { $setOnInsert: { fullName: 'Inbound Caller', phone: fromNumber, source: 'Inbound Call', status: 'Calling', campaign: null } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`[webhook] New inbound caller — created/claimed Lead ${lead._id} (${fromNumber})`);
  } else {
    // No caller ID at all (blocked/withheld number) — vapiCallId is
    // unique per call, so there's no realistic race to guard against here.
    lead = await Lead.create({
      fullName: 'Inbound Caller',
      phone: `unknown-${vapiCallId}`,
      source: 'Inbound Call',
      status: 'Calling',
    });
    console.log(`[webhook] New inbound caller with no caller ID — created Lead ${lead._id}`);
  }

  const callLog = await CallLog.create({
    lead: lead._id,
    campaign: lead.campaign || null, // inherits the lead's existing campaign, if any — otherwise null
    callType: 'Inbound',
    status: 'Ringing',
    fromNumber,
    toNumber,
    vapiCallId,
  }).catch(async (err: any) => {
    // Day 21, Session 1: race guard. vapiCallId is now a unique index
    // (previously only sparse) — if two webhook events for the same
    // brand-new inbound call both reached this function before either
    // finished creating a CallLog, the loser hits a duplicate-key error
    // here (Mongo error code 11000) instead of silently creating a second
    // CallLog for one real call. Treat that as "someone else already
    // created it" and just fetch what they made, rather than failing.
    if (err.code === 11000) {
      console.warn(`[webhook] Race detected creating CallLog for vapiCallId=${vapiCallId} — another event already created it, reusing that record.`);
      return CallLog.findOne({ vapiCallId });
    }
    throw err;
  });

  return callLog;
}
// ─────────────────────────────────────────────────────────────────────────────
//  findCallLogForEvent (DEMO web-call support)
//
//  Normal path (phone calls, unchanged): match by vapiCallId.
//  Web-call fallback: a webhook can arrive before the browser has reported
//  the VAPI call id. Web calls are started with metadata.leadmindCallLogId,
//  VAPI echoes it back in message.call.metadata, so we can still find the
//  pre-created CallLog and attach the vapiCallId to it.
// ─────────────────────────────────────────────────────────────────────────────
async function findCallLogForEvent(message: any): Promise<any | null> {
  const vapiCallId = message.call?.id;
  let callLog = await CallLog.findOne({ vapiCallId });
  if (callLog) return callLog;

  const metaId = message.call?.metadata?.leadmindCallLogId;
  if (metaId && /^[a-f\d]{24}$/i.test(String(metaId))) {
    callLog = await CallLog.findOne({ _id: metaId, channel: 'Web', vapiCallId: null });
    if (callLog) {
      callLog.vapiCallId = vapiCallId;
      await callLog.save();
      console.log(`[webhook] Web call matched via metadata — CallLog ${callLog._id} <- vapiCallId ${vapiCallId}`);
    }
  }
  return callLog;
}


// ─────────────────────────────────────────────────────────────────────────────
//  status-update — fires as the call progresses (queued → ringing →
//  in-progress → ended). We only care about 'ringing' and 'in-progress' here;
//  'ended' is handled in full detail by end-of-call-report below.
// ─────────────────────────────────────────────────────────────────────────────

async function handleStatusUpdate(message: any): Promise<void> {
  const vapiCallId = message.call?.id;
  const status = message.status;
  if (!vapiCallId || !status) return;

  let callLog = await findCallLogForEvent(message);
  if (!callLog) {
    // Day 18, Session 2: no pre-existing CallLog is expected here for
    // inbound calls — Vapi originates them, we don't. Falls through to a
    // real warning (and returns) only if this ISN'T a recognized inbound
    // call, e.g. a genuinely orphaned outbound event.
    callLog = await findOrCreateInboundCallLog(message);
    if (!callLog) {
      console.warn(`[webhook:status-update] No CallLog found for vapiCallId=${vapiCallId} and it isn't an inbound call — ignoring.`);
      return;
    }
  }

  if (status === 'ringing') {
    callLog.status = 'Ringing';
  } else if (status === 'in-progress') {
    callLog.status = 'Answered';
    if (!callLog.answeredAt) {
      callLog.answeredAt = new Date();
    }
    await Lead.updateOne({ _id: callLog.lead }, { $set: { lastCalledAt: new Date() } });
  }

  await callLog.save();
}

// ─────────────────────────────────────────────────────────────────────────────
//  end-of-call-report — the definitive summary VAPI sends once a call ends.
//  Contains duration, ended reason, and the full conversation.
// ─────────────────────────────────────────────────────────────────────────────

export async function handleEndOfCallReport(message: any): Promise<void> {
  const vapiCallId = message.call?.id;
  console.log(`[webhook:end-of-call-report] Received event for vapiCallId="${vapiCallId}"`);
  if (!vapiCallId) {
    console.warn('[webhook:end-of-call-report] message.call.id was missing — cannot look up a CallLog. Full message:', JSON.stringify(message));
    return;
  }

  let callLog = await findCallLogForEvent(message);
  console.log(
    `[webhook:end-of-call-report] CallLog lookup for "${vapiCallId}":`,
    callLog ? `FOUND (_id=${callLog._id}, campaign=${callLog.campaign})` : 'NOT FOUND'
  );
  if (!callLog) {
    // Day 18, Session 2: same reactive fallback as handleStatusUpdate — this
    // is the normal path for a short inbound call whose end-of-call-report
    // arrives before any status-update was received/processed.
    callLog = await findOrCreateInboundCallLog(message);
    if (!callLog) {
      console.warn(`[webhook:end-of-call-report] No CallLog found for vapiCallId=${vapiCallId} and it isn't an inbound call — ignoring.`);
      return;
    }
  }

  // ── Day 21, Session 1: idempotency guard (THE race-condition fix) ────────
  // VAPI, like most webhook providers, delivers "at least once" — the same
  // end-of-call-report can arrive twice (e.g. VAPI retries because our ack
  // was slow, or a network blip caused a redelivery). Everything below this
  // point mutates state exactly once per real call: creates a Transcript,
  // runs paid AI qualification + topic analysis calls, increments
  // Campaign.stats, and can trigger auto-advance to the next lead. Without
  // this guard, a duplicate delivery would do ALL of that a second time —
  // duplicate transcript, double-billed AI calls, inflated campaign stats,
  // and potentially double-dialing a lead.
  //
  // findOneAndUpdate with the filter including `endOfCallProcessedAt: null`
  // is atomic at the MongoDB level — even if two requests for the same
  // CallLog reach this line genuinely concurrently, only one can win the
  // match-and-set; the other gets null back and exits below. A plain
  // "read callLog.endOfCallProcessedAt, then write" would NOT be safe here
  // (classic check-then-act race) — this has to be a single atomic
  // operation, which is why it's not just an `if` on the in-memory
  // `callLog` object already loaded above.
  const claim = await CallLog.findOneAndUpdate(
    { _id: callLog._id, endOfCallProcessedAt: null },
    { $set: { endOfCallProcessedAt: new Date() } }
  );

  if (!claim) {
    console.warn(
      `[webhook:end-of-call-report] Duplicate delivery for vapiCallId=${vapiCallId} ` +
      `(CallLog ${callLog._id} was already processed) — ignoring, no reprocessing.`
    );
    return;
  }
  // Keep the in-memory doc's view of this field consistent with what we
  // just wrote — purely defensive; callLog.save() below only ever sends
  // its explicitly-modified paths, so this isn't required for correctness,
  // just hygiene in case anything later in this function ever reads it.
  callLog.endOfCallProcessedAt = claim.endOfCallProcessedAt;

  const finalStatus = mapEndedReasonToStatus(message.endedReason);
  const durationSeconds = Math.round(message.durationSeconds || 0);
  const endedAt = new Date();

  // ── Update the CallLog ───────────────────────────────────────────────────
  callLog.status = finalStatus;
  callLog.endedAt = endedAt;
  callLog.durationSeconds = durationSeconds;
  if (!callLog.answeredAt && finalStatus === 'Completed') {
    callLog.answeredAt = callLog.initiatedAt;
  }

  // ── Build the transcript from VAPI's message array ──────────────────────
  const transcriptMessages = buildTranscriptMessages(message.artifact?.messages || message.messages);
  const isPartial = finalStatus === 'Completed' && durationSeconds < 10 && transcriptMessages.length < 2;

  // ── Day 18, Session 2: consult the assistant-request routing decision ────
  // Only meaningful for inbound calls — Session 1's handleAssistantRequest
  // is the only place that writes to this map. Deleted here regardless of
  // whether it was set, so the map never grows unbounded.
  const routingDecision = inboundCallRouting.get(vapiCallId);
  inboundCallRouting.delete(vapiCallId);
  const isOutsideHoursCourtesyCall = callLog.callType === 'Inbound' && routingDecision === 'outside-hours';

  const transcript = await Transcript.create({
    lead: callLog.lead,
    campaign: callLog.campaign,
    callLog: callLog._id,
    callType: callLog.callType,
    callDate: callLog.initiatedAt,
    durationSeconds,
    finalStatus: isPartial ? 'Abandoned' : finalStatus === 'Completed' ? 'Needs Human Follow-up' : finalStatus,
    // ^ Provisional value. For "Completed" calls this is immediately
    // overwritten a few lines below — either by qualifyAndPersist() (Day 16)
    // for normal calls, or set directly to 'Callback Requested' for
    // outside-hours courtesy calls (Day 18, Session 2) — "Needs Human
    // Follow-up" only survives as the final value if neither branch runs
    // (e.g. scoring skipped or the AI service call fails).
    messages: transcriptMessages,
    vapiCallId,
    rawVapiTranscript: message.transcript || null,
    isPartial,
  });

  callLog.transcript = transcript._id;
  callLog.finalLeadStatus = transcript.finalStatus;

  // ── Day 18, Session 2: outside-hours courtesy calls skip AI entirely ─────
  // UC-10 A1 — this was never a sales conversation to qualify or extract
  // project topics from; it's a "please call back during business hours"
  // exchange. isPartial still takes priority (a genuine early hangup during
  // the courtesy message is still Abandoned, not a completed callback
  // request).
  if (isOutsideHoursCourtesyCall && finalStatus === 'Completed' && !isPartial) {
    transcript.finalStatus = 'Callback Requested';
    await transcript.save();
    callLog.finalLeadStatus = 'Callback Requested';
    console.log(`[webhook] Lead ${callLog.lead} called outside business hours — marked "Callback Requested", AI pipeline skipped.`);
  }

  // ── Day 16 (scoring) + Day 17 (topic analysis): both AI service calls ─────
  // Only run these for calls that actually completed with a real
  // conversation. Calls that never connected (No Answer/Busy/Voicemail/
  // Failed), that were abandoned before any meaningful exchange, or that
  // were outside-hours courtesy calls (Day 18, Session 2) skip both
  // entirely — there's nothing to qualify or analyze.
  const shouldAnalyze =
    finalStatus === 'Completed' && !isPartial && !isOutsideHoursCourtesyCall && transcriptMessages.length > 0;

  // Set below when scoring says "Qualified" — drives the automatic meeting
  // booking + invitation email further down (phone AND web calls).
  let qualifiedForBooking = false;

  if (shouldAnalyze) {
    // Run concurrently — these hit two independent FastAPI endpoints and
    // neither's success/failure affects the other. Both helper functions
    // catch their own errors internally and return a status object rather
    // than throwing, so Promise.all here is safe even if the AI service is
    // fully down.
    const [qualificationOutcome, topicOutcome] = await Promise.all([
      qualifyAndPersist({
        transcript,
        callLog,
        leadId: callLog.lead,
        campaignId: callLog.campaign,
        messages: transcriptMessages,
      }),
      analyzeAndPersistTopics({
        transcript,
        leadId: callLog.lead,
        campaignId: callLog.campaign,
        messages: transcriptMessages,
      }),
    ]);

    if (qualificationOutcome.status === 'scored') {
      console.log(
        `[webhook] Lead ${callLog.lead} scored ${qualificationOutcome.score}/100 -> ${qualificationOutcome.finalStatus}`
      );
      qualifiedForBooking = qualificationOutcome.qualified === true;
    } else if (qualificationOutcome.status === 'failed') {
      await logError('webhook.qualification', qualificationOutcome.error, {
        leadId: String(callLog.lead),
        callLogId: String(callLog._id),
        vapiCallId,
      });
    }

    if (topicOutcome.status === 'analyzed') {
      console.log(
        `[webhook] Lead ${callLog.lead} topics detected: [${topicOutcome.topicsDetected.join(', ') || 'none'}] (${topicOutcome.totalMentions} mentions)`
      );
    } else if (topicOutcome.status === 'failed') {
      await logError('webhook.topicAnalysis', topicOutcome.error, {
        leadId: String(callLog.lead),
        callLogId: String(callLog._id),
        vapiCallId,
      });
    }

    // Single save persists whichever mutations succeeded — score/breakdown/
    // reason from qualifyAndPersist, detectedTopics from
    // analyzeAndPersistTopics. Safe to call even if both failed (no-op diff).
    await transcript.save();
  }

  // ── Day 15, Session 2: retry scheduling ───────────────────────────────────
  // Only calls that never connected are retry-eligible. A campaign's
  // retryPolicy.maxRetries caps total ADDITIONAL attempts, so the highest
  // allowed attemptNumber is (1 + maxRetries) — e.g. maxRetries=2 allows
  // attemptNumber 1 (initial), 2 (retry 1), 3 (retry 2), and stops there.
  //
  // Day 18, Session 2: gated to Outbound only — retrying is "we call them
  // again," which doesn't apply to an inbound call the lead placed to us.
  let retryScheduled = false;
  const isWebCall = callLog.channel === 'Web'; // DEMO: web calls never use phone retry/auto-dial machinery
  if (!isWebCall && callLog.callType === 'Outbound' && RETRYABLE_CALL_STATUSES.includes(finalStatus)) {
    const campaign = await Campaign.findById(callLog.campaign);
    const maxAttempts = 1 + (campaign?.retryPolicy?.maxRetries ?? 2);
    const retryDelayMinutes = campaign?.retryPolicy?.retryDelayMinutes ?? 30;

    if (campaign && callLog.attemptNumber < maxAttempts) {
      callLog.scheduledRetryAt = new Date(Date.now() + retryDelayMinutes * 60 * 1000);
      retryScheduled = true;
    }
  }

  await callLog.save();

  // ── Update the Lead record ────────────────────────────────────────────────
  await Lead.updateOne(
    { _id: callLog.lead },
    {
      $set: {
        status: transcript.finalStatus,
        lastCalledAt: endedAt,
      },
      $inc: { totalCallAttempts: 1 },
    }
  );

  // ── Campaign stats (best-effort — full analytics dashboard is Day 25) ─────
  // Day 18, Session 2: gated to Outbound only. These counters represent
  // outbound dialing activity for the campaign — an inbound call from an
  // existing lead calling back isn't part of that dialing effort and
  // shouldn't move these numbers.
  if (callLog.callType === 'Outbound' && callLog.campaign) {
    const statsInc: Record<string, number> = {};
    if (callLog.answeredAt) statsInc['stats.callsAnswered'] = 1;
    if (finalStatus === 'No Answer') statsInc['stats.noAnswer'] = 1;
    if (finalStatus === 'Failed') statsInc['stats.failed'] = 1;

    if (Object.keys(statsInc).length > 0) {
      await Campaign.updateOne({ _id: callLog.campaign }, { $inc: statsInc });
    }
  }

  // ── Automatic meeting booking + invitation email for QUALIFIED leads ──────
  // Applies to phone calls and web calls alike. Deliberately NOT awaited: it
  // makes several Google/SMTP round-trips, and neither the VAPI webhook ack
  // nor the web-call /sync request should wait on them. The result is stored
  // on CallLog.autoBooking, which the UI polls. The service never throws; the
  // .catch is only a last-resort guard against an unhandled rejection.
  if (qualifiedForBooking) {
    void autoBookMeetingForQualifiedLead({
      leadId: callLog.lead,
      campaignId: callLog.campaign,
      transcriptId: transcript._id,
      callLogId: callLog._id,
    }).catch((e: any) => console.error('[webhook] autoBook crashed (non-fatal):', e?.message || e));
  }

  // ── Day 15, Session 2: auto-advance to the next lead ──────────────────────
  // Wrapped defensively — a failure here must never prevent the webhook
  // from acknowledging receipt of this event back to VAPI.
  //
  // Day 18, Session 2: gated to Outbound only. Without this guard, an
  // inbound call from a lead who happens to belong to a Running campaign
  // would incorrectly trigger that campaign's outbound dialing machinery —
  // auto-advance must only fire in response to an outbound attempt
  // completing, never as a side effect of someone calling in.
  if (!isWebCall && callLog.callType === 'Outbound' && callLog.campaign) {
    try {
      const campaignId = String(callLog.campaign);
      const dialResult = await dialNextEligibleLead(campaignId);

      if (!dialResult.dialed && dialResult.reason === 'no_eligible_leads' && !retryScheduled) {
        // Nothing dialed AND nothing left to retry right now — check if the
        // queue is truly finished (no Pending leads anywhere, no retry owed
        // now or later) before auto-completing the campaign.
        const exhausted = await isQueueExhausted(campaignId);
        if (exhausted) {
          await Campaign.updateOne(
            { _id: campaignId, status: 'Running' },
            { $set: { status: 'Completed', completedAt: new Date() } }
          );
          console.log(`[webhook] Campaign ${campaignId} auto-completed — all leads processed.`);
        }
      } else {
        console.log(`[webhook] Auto-advance for campaign ${campaignId}:`, dialResult.message);
      }
    } catch (advanceErr: any) {
      await logError('webhook.autoAdvance', advanceErr, { campaignId: String(callLog.campaign) });
    }
  }
}