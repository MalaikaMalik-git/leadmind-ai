// backend/src/models/CallLog.js
// LeadMind AI — CallLog model
// ERD entity: CallLog (section 2.12)
// Related UCs: UC-05 (Outbound pipeline), UC-10 (Inbound), UC-11 (Connect Outbound)
//
// Key spec requirements implemented:
// - "Save call status (answered, no answer, busy, failed)" (UC-05 post-condition)
// - "Retry policy: max 2 retries, 30 minutes apart" (UC-05 special requirements)
// - "Call rate limiting required to avoid carrier blocking" (UC-05 special requirements)
// - "Call metadata (duration, timestamp) must be stored" (UC-11 special requirements)
// - "Quiet hours compliance check before each call" (Day 15 tasks)
// - One CallLog document per call ATTEMPT — a lead with 2 retries = 3 CallLog docs

const mongoose = require('mongoose');

// ─── Constants ────────────────────────────────────────────────────────────────
const CALL_TYPE = Object.freeze({
  INBOUND:  'Inbound',
  OUTBOUND: 'Outbound',
});

const CALL_STATUS = Object.freeze({
  INITIATED: 'Initiated',  // Request sent to VAPI
  RINGING:   'Ringing',    // Dialing
  ANSWERED:  'Answered',   // Lead picked up
  NO_ANSWER: 'No Answer',  // No pickup after timeout
  BUSY:      'Busy',       // Busy tone detected
  VOICEMAIL: 'Voicemail',  // Voicemail detected
  COMPLETED: 'Completed',  // Call ended normally after conversation
  FAILED:    'Failed',     // Telephony error (UC-05 A2)
  ABANDONED: 'Abandoned',  // Lead hung up early (UC-10 A2)
});

// ─── Schema ───────────────────────────────────────────────────────────────────
const CallLogSchema = new mongoose.Schema(
  {
    // ── References ─────────────────────────────────────────────────────────────
    lead: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Lead',
      required: [true, 'Lead reference is required'],
    },

    // null for inbound calls not tied to a campaign
    campaign: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Campaign',
      default: null,
    },

    // Set after transcript is created (can be null if call failed before connection)
    transcript: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Transcript',
      default: null,
    },

    // ── Call identifiers ───────────────────────────────────────────────────────
    callType: {
      type:     String,
      required: [true, 'Call type is required'],
      enum: {
        values:  Object.values(CALL_TYPE),
        message: 'Call type must be Inbound or Outbound',
      },
    },

    // ── DEMO: how the call travelled ─────────────────────────────────────────
    // 'Phone' = the original VAPI telephony flow (default — every existing
    // document and code path keeps behaving exactly as before).
    // 'Web'   = browser-based VAPI web call used for demos. Web calls are
    // excluded from phone-only machinery (retries, auto-advance dialing).
    channel: {
      type:    String,
      enum:    ['Phone', 'Web'],
      default: 'Phone',
    },

    status: {
      type:     String,
      required: [true, 'Call status is required'],
      enum: {
        values:  Object.values(CALL_STATUS),
        message: 'Invalid call status',
      },
      default: CALL_STATUS.INITIATED,
    },

    // ── Phone numbers ──────────────────────────────────────────────────────────
    // The number that initiated the call (VAPI number for outbound, lead for inbound)
    fromNumber: {
      type:    String,
      trim:    true,
      default: null,
    },

    // The number that was dialed
    toNumber: {
      type:     String,
      required: [true, 'To number is required'],
      trim:     true,
    },

    // ── Duration ───────────────────────────────────────────────────────────────
    // 0 for unanswered calls — never null so analytics aggregations don't fail
    durationSeconds: {
      type:    Number,
      default: 0,
      min:     [0, 'Duration cannot be negative'],
    },

    // ── VAPI integration ───────────────────────────────────────────────────────
    // VAPI's own call identifier — used to match webhook events back to this doc.
    // unique: true (Day 21, Session 1) — a vapiCallId identifies exactly ONE
    // real call; two CallLog documents must never share one. sparse: true
    // (declared on the index below, not here) allows multiple docs with no
    // vapiCallId at all (e.g. a freshly created outbound CallLog before the
    // VAPI create-call response comes back).
    vapiCallId: {
      type:    String,
      trim:    true,
      default: null,
    },

    // Day 21, Session 1 — idempotency guard for handleEndOfCallReport.
    // VAPI (like most webhook providers) delivers "at least once" — the
    // same end-of-call-report can legitimately arrive twice (e.g. VAPI
    // retrying because our first ack was slow or dropped). Without this,
    // a duplicate delivery would create a second Transcript, re-run AI
    // qualification, double-increment Campaign.stats, and could even
    // trigger auto-advance twice. Set atomically (see webhookController.ts)
    // the first time an end-of-call-report is actually processed for this
    // call; any later delivery for the same call sees this already set and
    // is ignored.
    endOfCallProcessedAt: {
      type:    Date,
      default: null,
    },

    // Result of the automatic "book a meeting + email the link" step that runs
    // after a QUALIFIED call (see meetingAutomationService.ts). null = not run
    // (call not qualified, or still processing). The web-call UI polls this.
    //   status: 'booked' | 'skipped' | 'failed'
    //   reason: no_email | auto_confirm_off | already_booked | calendar_not_connected | no_slot | booking_failed | no_admin
    autoBooking: {
      status:  { type: String, enum: ['booked', 'skipped', 'failed'], default: null },
      reason:  { type: String, default: null },
      message: { type: String, default: null },
      meeting: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting', default: null },
      at:      { type: Date, default: null },
    },

    // The VAPI assistant configured with campaign instructions
    vapiAssistantId: {
      type:    String,
      trim:    true,
      default: null,
    },

    // ── Retry tracking (UC-05: "max 2 retries, 30 minutes apart") ─────────────
    // 1 = initial attempt, 2 = first retry, 3 = second (final) retry
    attemptNumber: {
      type:    Number,
      default: 1,
      min:     [1, 'Attempt number must be at least 1'],
      max:     [3, 'Max 3 attempts allowed (1 initial + 2 retries)'],
    },

    isRetry: {
      type:    Boolean,
      default: false,
    },

    // Reference to the previous failed CallLog this is retrying
    previousCallLog: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'CallLog',
      default: null,
    },

    // When the next retry should fire (set by the calling pipeline after a failure)
    scheduledRetryAt: {
      type:    Date,
      default: null,
    },

    // ── Timestamps ─────────────────────────────────────────────────────────────
    initiatedAt: {
      type:    Date,
      default: Date.now,
    },

    // Set when lead picks up
    answeredAt: {
      type:    Date,
      default: null,
    },

    // Set when call ends (regardless of outcome)
    endedAt: {
      type:    Date,
      default: null,
    },

    // ── Quiet hours flag ───────────────────────────────────────────────────────
    // True if this call was queued instead of fired due to quiet hours (UC-05 A1)
    blockedByQuietHours: {
      type:    Boolean,
      default: false,
    },

    // ── Error details ──────────────────────────────────────────────────────────
    // Populated when status = Failed — VAPI error code
    errorCode: {
      type:    String,
      default: null,
    },

    // Human-readable error — shown in admin dashboard call log
    errorMessage: {
      type:     String,
      trim:     true,
      maxlength: [500, 'Error message cannot exceed 500 characters'],
      default:  null,
    },

    // ── Qualification outcome snapshot ─────────────────────────────────────────
    // Copied from Lead after call completes — avoids join just to show call outcome
    qualificationScore: {
      type:    Number,
      default: null,
      min:     0,
      max:     100,
    },

    finalLeadStatus: {
      type:    String,
      default: null,
      // Matches Lead.status enum — set when call pipeline updates the lead
    },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Virtual: formatted duration (MM:SS) ─────────────────────────────────────
CallLogSchema.virtual('durationFormatted').get(function () {
  const mins = Math.floor(this.durationSeconds / 60);
  const secs = this.durationSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
});

// ─── Virtual: was the call connected (answered at any point) ─────────────────
CallLogSchema.virtual('wasConnected').get(function () {
  return this.answeredAt !== null;
});

// ─── Indexes ──────────────────────────────────────────────────────────────────
// Lead call history (UC-07 Lead Detail page — call timeline)
CallLogSchema.index({ lead: 1, initiatedAt: -1 });

// Campaign-level call overview
CallLogSchema.index({ campaign: 1, status: 1 });

// VAPI webhook matching — must be fast
// Day 21, Session 1: partialFilterExpression, NOT sparse. This distinction
// matters and is easy to get wrong — sparse only excludes documents where
// the field is entirely ABSENT. But vapiCallId's schema default is `null`
// (see above), so every CallLog created before VAPI responds with a real
// ID (see campaignOrchestratorService.ts, which creates the CallLog THEN
// dials) has vapiCallId EXPLICITLY set to null, not missing. A sparse
// index still includes explicit nulls, so unique+sparse alone would make
// the SECOND ever-queued outbound call collide on that shared null value
// and fail — breaking outbound calling entirely. A partial index with an
// explicit $type filter correctly excludes null values too, not just
// missing ones.
CallLogSchema.index(
  { vapiCallId: 1 },
  { unique: true, partialFilterExpression: { vapiCallId: { $type: 'string' } } }
);

// Retry queue polling — calling pipeline queries this every N seconds
CallLogSchema.index({ status: 1, scheduledRetryAt: 1 });

// Analytics date range filtering (UC-09)
CallLogSchema.index({ initiatedAt: -1 });

// ─── Export ───────────────────────────────────────────────────────────────────
const CallLog = mongoose.model('CallLog', CallLogSchema);

module.exports = CallLog;
module.exports.CALL_TYPE   = CALL_TYPE;
module.exports.CALL_STATUS = CALL_STATUS;