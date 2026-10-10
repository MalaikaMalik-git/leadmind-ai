// backend/src/models/Admin.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const AdminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Admin name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please enter a valid email address',
      ],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: ['admin', 'sales_manager'],
      default: 'admin',
    },
    avatar: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    timezone: { type: String, default: 'Asia/Karachi' },
    googleCalendar: {
      isConnected: { type: Boolean, default: false },
      accessToken: { type: String, default: null, select: false },
      refreshToken: { type: String, default: null, select: false },
      tokenExpiry: { type: Date, default: null },
      calendarEmail: { type: String, default: null },
    },
    notifications: {
      qualifiedLeadAlert: { type: Boolean, default: true },
      meetingBookedAlert: { type: Boolean, default: true },
      campaignCompletedAlert: { type: Boolean, default: true },
    },
   lastLoginAt: { type: Date, default: null },
refreshToken: {
  type: String,
  default: null,
  select: false,
},
refreshTokens: [
  {
    token: { type: String },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
  },
],
  },
  { timestamps: true }
);

// ── Mongoose 9.x compatible pre-save: NO next parameter for async hooks ───────
AdminSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

AdminSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

AdminSchema.methods.toPublicProfile = function () {
  return {
    _id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    avatar: this.avatar,
    isActive: this.isActive,
    timezone: this.timezone,
    googleCalendar: {
      isConnected: this.googleCalendar.isConnected,
      calendarEmail: this.googleCalendar.calendarEmail,
    },
    notifications: this.notifications,
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
  };
};

AdminSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('Admin', AdminSchema);