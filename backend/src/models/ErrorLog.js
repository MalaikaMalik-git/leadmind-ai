// backend/src/models/ErrorLog.js
//
// LeadMind AI — ErrorLog model (Day 21, Session 2)
// Related plan item: "Log all errors to console + DB audit log."
//
// Scope note: this is a SYSTEM/PIPELINE error log — VAPI webhook failures,
// AI service outages, dial failures, etc. It is deliberately distinct from
// the ADMIN ACTION audit log described in the 30-day plan's Day 26 task
// ("Audit log viewer: login, campaign create, status changes") — that one
// tracks what admins DID; this one tracks what went WRONG in the automated
// pipeline. Different purpose, different shape, kept as separate
// collections rather than overloading one model for both.

const mongoose = require('mongoose');

const ErrorLogSchema = new mongoose.Schema(
  {
    // Where the error came from — a short, greppable dotted path, e.g.
    // "webhook.handleVapiWebhook", "orchestrator.createCall",
    // "qualificationService". Free-text by design (not an enum) since new
    // sources will keep getting added as the pipeline grows; an enum here
    // would just mean editing this file every time.
    source: {
      type: String,
      required: [true, 'Error source is required'],
      trim: true,
    },

    message: {
      type: String,
      required: [true, 'Error message is required'],
    },

    // Stack trace, when available (Error instances only — a rejected
    // promise with a plain string reason won't have one).
    stack: {
      type: String,
      default: null,
    },

    // Free-form structured context relevant to the failure — e.g.
    // { vapiCallId, campaignId, leadId }. Deliberately Mixed rather than a
    // fixed sub-schema since different sources have different relevant
    // fields and forcing a common shape would mean losing information.
    context: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // 'error' = something failed and was handled/recovered from
    // (non-fatal, matches this codebase's existing "(non-fatal)" comment
    // convention throughout the webhook/service layer).
    // 'warning' = notable but not a failure (reserved for future use).
    severity: {
      type: String,
      enum: ['error', 'warning'],
      default: 'error',
    },
  },
  { timestamps: true } // createdAt is the primary thing this gets queried by
);

// Recent-first is the natural query pattern for a log; source+recent
// supports narrowing to one pipeline stage (e.g. "show me all orchestrator
// failures from today").
ErrorLogSchema.index({ createdAt: -1 });
ErrorLogSchema.index({ source: 1, createdAt: -1 });

module.exports = mongoose.model('ErrorLog', ErrorLogSchema);