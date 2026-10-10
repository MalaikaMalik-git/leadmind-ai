// src/models/Transcript.js
// LeadMind AI — Call Transcript model
// Matches ERD: Transcripts entity (section 2.12)
// Covers UC-08 (View Call Transcript), UC-09 (Analytics), UC-10/11 (Calling pipeline)

const mongoose = require('mongoose');

// Single turn in a conversation
const MessageSchema = new mongoose.Schema(
  {
    speaker: {
      type: String,
      required: true,
      enum: ['AI', 'Lead'], // UC-08: "clearly distinguish AI and Lead messages"
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { _id: false } // No separate _id per message turn (stored as array)
);

const TranscriptSchema = new mongoose.Schema(
  {
    // ── References ───────────────────────────────────────────────────────────
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      required: [true, 'Lead reference is required'],
    },

    campaign: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      default: null, // Null for inbound calls with no campaign
    },

    callLog: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CallLog',
      default: null,
    },

    // ── Call Metadata (UC-08 spec: "show call metadata") ─────────────────────
    callType: {
      type: String,
      required: true,
      enum: ['Inbound', 'Outbound'],
    },

    callDate: {
      type: Date,
      required: true,
      default: Date.now,
    },

    // Duration in seconds
    durationSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },

    finalStatus: {
      type: String,
      required: true,
      // Mirrors Lead.status — set when call concludes
      enum: [
        'Qualified',
        'Not Qualified',
        'No Answer',
        'Voicemail',
        'Busy',
        'Meeting Booked',
        'Needs Human Follow-up',
        'Invalid Contact',
        'Abandoned',
        'Call Failed',
        'Callback Requested',
        'Qualified (No Slot)',
        'Qualified (Booking Failed)',
      ],
    },

    // ── Conversation Messages (ordered array — UC-08 spec: "preserve message order") ──
    messages: {
      type: [MessageSchema],
      default: [],
      validate: {
        validator: function (v) {
          return Array.isArray(v); // Always an array even if empty (abandoned call)
        },
        message: 'Messages must be an array',
      },
    },

    // ── Qualification snapshot at time of call ────────────────────────────────
    qualificationScore: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },

    scoreBreakdown: {
      budgetConfirmed: { type: Boolean, default: null },
      timelineDefined: { type: Boolean, default: null },
      scopeClear: { type: Boolean, default: null },
      isDecisionMaker: { type: Boolean, default: null },
    },

    qualificationReason: {
      type: String,
      default: null,
    },

    // ── VAPI Integration ──────────────────────────────────────────────────────
    vapiCallId: {
      type: String,
      default: null,
    },

    // Raw transcript from VAPI (backup — parsed version is in messages[])
    rawVapiTranscript: {
      type: String,
      default: null,
      select: false,
    },

    // NLP-extracted topics (used by UC-09 analytics)
    detectedTopics: {
      type: [String],
      default: [],
      // e.g. ['web app', 'SaaS', 'AI/ML']
    },

    isPartial: {
      type: Boolean,
      default: false, // True if lead abandoned call early (UC-10 A2)
    },
  },
  {
    timestamps: true,
  }
);

// ─── Virtual: Duration in minutes:seconds format ──────────────────────────────
TranscriptSchema.virtual('durationFormatted').get(function () {
  const mins = Math.floor(this.durationSeconds / 60);
  const secs = this.durationSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
});

// ─── Indexes ──────────────────────────────────────────────────────────────────
TranscriptSchema.index({ lead: 1, callDate: -1 });
TranscriptSchema.index({ campaign: 1, callDate: -1 });
TranscriptSchema.index({ vapiCallId: 1 });
TranscriptSchema.index({ callDate: -1 }); // For analytics date range filtering (UC-09)

module.exports = mongoose.model('Transcript', TranscriptSchema);