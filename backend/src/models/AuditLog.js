// backend/src/models/AuditLog.js
//
// LeadMind AI — AuditLog model (Day 26, Session 1)
//
// Tracks ADMIN ACTIONS — login, campaign create, campaign status changes —
// for the Day 26 "Audit log viewer" settings-page feature. Deliberately
// distinct from ErrorLog (Day 21, Session 2), which tracks system/pipeline
// FAILURES, not admin activity. Same "two collections, different purpose"
// reasoning ErrorLog.js's header comment already lays out — see that file.

const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema(
  {
    // Short, greppable dotted action name — e.g. "admin.login",
    // "campaign.create", "campaign.start", "campaign.pause". Free-text by
    // design (not an enum), matching ErrorLog.source: new action types will
    // keep getting added as more of the app grows audit coverage, and an
    // enum here would mean editing this file every time.
    action: {
      type: String,
      required: [true, 'Action is required'],
      trim: true,
    },

    // The admin who performed the action.
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: [true, 'Actor is required'],
    },

    // Denormalized alongside `actor` so the audit log viewer can render a
    // list without a populate() round-trip per row, and so the row still
    // reads sensibly if the admin account is ever deleted later.
    actorEmail: {
      type: String,
      required: [true, 'Actor email is required'],
      trim: true,
    },

    // Human-readable summary shown directly in the viewer, e.g.
    // 'admin@leadmind.ai logged in.' or 'Created campaign "Q3 Outreach".'
    description: {
      type: String,
      required: [true, 'Description is required'],
    },

    // Free-form structured context relevant to the action — e.g.
    // { campaignId, previousStatus, newStatus }. Mixed rather than a fixed
    // sub-schema for the same reason as ErrorLog.context: different action
    // types have different relevant fields.
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true } // createdAt is what the viewer sorts/filters by
);

// Recent-first is the natural query pattern for a log viewer; the other two
// indexes support narrowing to one action type or one admin's history.
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ actor: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
