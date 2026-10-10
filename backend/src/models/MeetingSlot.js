// backend/src/models/MeetingSlot.js
const mongoose = require('mongoose');

const DAYS_OF_WEEK = Object.freeze([
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
]);
const MEETING_DURATIONS = Object.freeze([15, 30, 45, 60, 90]);

const AvailabilityWindowSchema = new mongoose.Schema(
  {
    day: {
      type: String,
      required: [true, 'Day is required'],
      enum: { values: DAYS_OF_WEEK, message: 'Day must be a valid day of the week' },
    },
    startTime: {
      type: String,
      required: [true, 'Start time is required'],
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be in HH:MM format'],
    },
    endTime: {
      type: String,
      required: [true, 'End time is required'],
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be in HH:MM format'],
    },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const MeetingSlotSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: [true, 'Admin reference is required'],
    },
    availabilityWindows: {
      type: [AvailabilityWindowSchema],
      default: [
        { day: 'Monday',    startTime: '09:00', endTime: '17:00', isActive: true },
        { day: 'Tuesday',   startTime: '09:00', endTime: '17:00', isActive: true },
        { day: 'Wednesday', startTime: '09:00', endTime: '17:00', isActive: true },
        { day: 'Thursday',  startTime: '09:00', endTime: '17:00', isActive: true },
        { day: 'Friday',    startTime: '09:00', endTime: '17:00', isActive: true },
      ],
    },
    defaultMeetingDurationMinutes: {
      type: Number,
      default: 30,
      enum: { values: MEETING_DURATIONS, message: `Duration must be one of: ${MEETING_DURATIONS.join(', ')} minutes` },
    },
    minimumNoticeHours: {
      type: Number, default: 2,
      min: [0, 'Minimum notice cannot be negative'],
      max: [168, 'Minimum notice cannot exceed 1 week'],
    },
    maximumAdvanceDays: {
      type: Number, default: 30,
      min: [1, 'Maximum advance must be at least 1 day'],
      max: [365, 'Maximum advance cannot exceed 1 year'],
    },
    bufferMinutes: {
      type: Number, default: 15,
      min: [0, 'Buffer cannot be negative'],
      max: [60, 'Buffer cannot exceed 60 minutes'],
    },
    timezone: {
      type: String,
      required: [true, 'Timezone is required'],
      default: 'Asia/Karachi',
    },
    preferences: {
      autoConfirm:           { type: Boolean, default: true },
      sendConfirmationEmail: { type: Boolean, default: false },
      sendSmsReminder:       { type: Boolean, default: false },
      allowReschedule:       { type: Boolean, default: true },
      allowCancel:           { type: Boolean, default: true },
      oneMeetingPerLead:     { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

// ── Mongoose 9.x compatible pre-save: NO next parameter ──────────────────────
MeetingSlotSchema.pre('save', function () {
  for (const window of this.availabilityWindows) {
    if (window.startTime >= window.endTime) {
      throw new Error(
        `${window.day}: End time (${window.endTime}) must be after start time (${window.startTime})`
      );
    }
  }
});

MeetingSlotSchema.virtual('activeDays').get(function () {
  return this.availabilityWindows.filter((w) => w.isActive).map((w) => w.day);
});

MeetingSlotSchema.index({ admin: 1 }, { unique: true });

const MeetingSlot = mongoose.model('MeetingSlot', MeetingSlotSchema);
module.exports = MeetingSlot;
module.exports.DAYS_OF_WEEK      = DAYS_OF_WEEK;
module.exports.MEETING_DURATIONS = MEETING_DURATIONS;