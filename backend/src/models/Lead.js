// src/models/Lead.js
// LeadMind AI — Lead / Potential Client model
// Matches ERD: Leads entity (section 2.12)
// Covers UC-04 (upload), UC-07 (view/status), UC-12 (qualification)

const mongoose = require('mongoose');

// All possible lead statuses across the system lifecycle
const LEAD_STATUS = [
  'Pending',            // Uploaded, not yet called (UC-04 default)
  'Calling',            // Currently on a call
  'Qualified',          // Score >= 60 (UC-12)
  'Not Qualified',      // Score < 60 or refused to answer
  'No Answer',          // Phone not picked up (UC-11 A1)
  'Voicemail',          // Reached voicemail (UC-11 A2)
  'Busy',               // Line was busy
  'Meeting Booked',     // Google Calendar event created (UC-13)
  'Needs Human Follow-up', // AI couldn't determine — unclear responses (UC-12 A2)
  'Invalid Contact',    // Wrong number (UC-11 A3)
  'Abandoned',          // Lead hung up early (UC-10 A2)
  'Call Failed',        // Telephony failure (UC-05 A2)
  'Callback Requested', // Called outside business hours, asked for a callback (UC-10 A1)
  'Qualified (No Slot)',     // Qualified but no calendar slots available (UC-13 A1)
  'Qualified (Booking Failed)', // Qualified but Google Calendar API failed (UC-13 A2)
];

const LEAD_SOURCE = [
  'CSV Upload',   // Uploaded via Admin dashboard (UC-04)
  'Inbound Call', // Called in themselves (UC-10)
  'Manual Entry', // Added manually by admin
];

const LeadSchema = new mongoose.Schema(
  {
    // ── Personal Info ────────────────────────────────────────────────────────
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      maxlength: [150, 'Name cannot exceed 150 characters'],
    },

    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      match: [
        /^\+?[\d\s\-().]{7,20}$/,
        'Please enter a valid phone number',
      ],
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
      match: [
        // Empty is allowed (CSV leads may have no email). Otherwise: something@domain.tld.
        // The previous pattern rejected valid addresses (name+tag@gmail.com, name@company.tech).
        /^$|^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
        'Please enter a valid email address',
      ],
    },

    company: {
      type: String,
      trim: true,
      default: null,
      maxlength: [200, 'Company name cannot exceed 200 characters'],
    },

    jobTitle: {
      type: String,
      trim: true,
      default: null,
      maxlength: [150, 'Job title cannot exceed 150 characters'],
    },

    // ── Campaign & Source ────────────────────────────────────────────────────
    campaign: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      default: null, // Null for inbound leads with no campaign
    },

    source: {
      type: String,
      enum: LEAD_SOURCE,
      default: 'CSV Upload',
    },

    // ── Status & Qualification (UC-07, UC-12) ────────────────────────────────
    status: {
      type: String,
      enum: LEAD_STATUS,
      default: 'Pending',
    },

    qualificationScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },

    isQualified: {
      type: Boolean,
      default: null, // null = not yet evaluated
    },

    // Score breakdown per UC-12 rule-based engine
    scoreBreakdown: {
      budgetConfirmed: { type: Boolean, default: null },    // +30 pts
      timelineDefined: { type: Boolean, default: null },    // +20 pts
      scopeClear: { type: Boolean, default: null },          // +25 pts
      isDecisionMaker: { type: Boolean, default: null },    // +25 pts
    },

    qualificationReason: {
      type: String,
      default: null,
      maxlength: [500, 'Reason cannot exceed 500 characters'],
    },

    // ── Call tracking ────────────────────────────────────────────────────────
    totalCallAttempts: {
      type: Number,
      default: 0,
    },

    lastCalledAt: {
      type: Date,
      default: null,
    },

    // ── Admin notes (UC-07 — editable) ───────────────────────────────────────
    adminNotes: {
      type: String,
      default: null,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    },

    // ── Meeting reference (if UC-13 succeeded) ───────────────────────────────
    meeting: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Meeting',
      default: null,
    },

    // ── Import tracking (UC-04) ──────────────────────────────────────────────
    importBatch: {
      type: String, // UUID of the CSV import batch
      default: null,
    },

    // Raw data from CSV (extra columns beyond required ones)
    rawCsvData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Compound indexes for efficient querying ──────────────────────────────────
LeadSchema.index({ campaign: 1, status: 1 });
LeadSchema.index({ phone: 1, campaign: 1 }); // Duplicate detection
LeadSchema.index({ email: 1, campaign: 1 }); // Duplicate detection
LeadSchema.index({ status: 1, lastCalledAt: 1 }); // Calling pipeline queue
LeadSchema.index({ createdAt: -1 });
LeadSchema.index({ importBatch: 1 });

// ─── Virtual: Next eligible for calling ──────────────────────────────────────
LeadSchema.virtual('callLogs', {
  ref: 'CallLog',
  localField: '_id',
  foreignField: 'lead',
});

LeadSchema.virtual('transcripts', {
  ref: 'Transcript',
  localField: '_id',
  foreignField: 'lead',
});

module.exports = mongoose.model('Lead', LeadSchema);
module.exports.LEAD_STATUS = LEAD_STATUS;
module.exports.LEAD_SOURCE = LEAD_SOURCE;