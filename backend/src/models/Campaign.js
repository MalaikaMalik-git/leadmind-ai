// backend/src/models/Campaign.js
const mongoose = require('mongoose');

const TONE_OPTIONS = ['Professional', 'Friendly', 'Direct', 'Consultative', 'Persuasive', 'Soft Warm'];
const CAMPAIGN_STATUS = ['Draft', 'Running', 'Paused', 'Completed', 'Archived'];

const CampaignSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Campaign name is required'],
      trim: true,
      maxlength: [150, 'Campaign name cannot exceed 150 characters'],
    },
    goal: {
      type: String,
      required: [true, 'Campaign goal is required'],
      trim: true,
      maxlength: [500, 'Goal cannot exceed 500 characters'],
    },
    tone: {
      type: String,
      required: [true, 'Tone is required'],
      enum: { values: TONE_OPTIONS, message: `Tone must be one of: ${TONE_OPTIONS.join(', ')}` },
      default: 'Professional',
    },
    instructions: {
      type: String,
      required: [true, 'AI instructions are required'],
      trim: true,
      maxlength: [2000, 'Instructions cannot exceed 2000 characters'],
    },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    dailyCallLimit: {
      type: Number,
      required: [true, 'Daily call limit is required'],
      min: [1, 'Daily call limit must be at least 1'],
      max: [500, 'Daily call limit cannot exceed 500'],
      default: 50,
    },
    quietHours: {
      enabled: { type: Boolean, default: false },
      startTime: {
        type: String,
        default: '22:00',
        match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be in HH:MM format'],
      },
      endTime: {
        type: String,
        default: '08:00',
        match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be in HH:MM format'],
      },
      timezone: { type: String, default: 'Asia/Karachi' },
    },
    status: {
      type: String,
      enum: CAMPAIGN_STATUS,
      default: 'Draft',
    },
    qualificationCriteria: {
      minBudget: { type: Number, default: 0 },
      requireTimeline: { type: Boolean, default: true },
      requireScope: { type: Boolean, default: true },
      requireDecisionMaker: { type: Boolean, default: true },
      qualificationThreshold: { type: Number, default: 60 },
    },
    stats: {
      totalLeads: { type: Number, default: 0 },
      callsMade: { type: Number, default: 0 },
      callsAnswered: { type: Number, default: 0 },
      qualified: { type: Number, default: 0 },
      notQualified: { type: Number, default: 0 },
      meetingsBooked: { type: Number, default: 0 },
      noAnswer: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    retryPolicy: {
      maxRetries: { type: Number, default: 2 },
      retryDelayMinutes: { type: Number, default: 30 },
    },

    // ── VAPI integration (Day 14) ────────────────────────────────────────────
    // Set once this campaign's tone/instructions/goal have been synced to a
    // VAPI assistant (Session 2). The calling pipeline (Day 15) will attach
    // this assistant ID to every outbound call request for this campaign.
    vapiAssistantId: {
      type: String,
      trim: true,
      default: null,
    },

    // Timestamp of the last successful sync to VAPI — lets us detect if
    // campaign instructions/tone changed after the assistant was last synced
    // (used by UC-03: "Updated tone and instructions must be used by the AI
    // agent for subsequent calls").
    vapiSyncedAt: {
      type: Date,
      default: null,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },
    isDeleted: { type: Boolean, default: false, select: false },

    // ── Archive (production-style "delete") ──────────────────────────────────
    // Archiving hides a campaign from the working lists and stops it from
    // being started, while keeping every lead, call, transcript and meeting
    // intact for reporting. statusBeforeArchive lets Restore put it back.
    archivedAt: { type: Date, default: null },
    statusBeforeArchive: { type: String, enum: ['Draft', 'Running', 'Paused', 'Completed'], default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    pausedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// ── Mongoose 9.x compatible pre-save: NO next parameter ──────────────────────
CampaignSchema.pre('save', function () {
  if (this.startDate && this.endDate && this.endDate <= this.startDate) {
    throw new Error('End date must be after start date');
  }
});

CampaignSchema.virtual('qualificationRate').get(function () {
  if (!this.stats.callsAnswered) return 0;
  return Math.round((this.stats.qualified / this.stats.callsAnswered) * 100);
});

CampaignSchema.index({ createdBy: 1, status: 1 });
CampaignSchema.index({ createdAt: -1 });

// Mongoose 9.x: pre hooks must NOT use next parameter — use async/throw instead
CampaignSchema.pre(/^find/, function () {
  if (!this.getOptions()._includeDeleted) {
    this.where({ isDeleted: { $ne: true } });
  }
});

module.exports = mongoose.model('Campaign', CampaignSchema);
module.exports.TONE_OPTIONS = TONE_OPTIONS;
module.exports.CAMPAIGN_STATUS = CAMPAIGN_STATUS;