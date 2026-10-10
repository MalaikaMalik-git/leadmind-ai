// src/models/index.js
// LeadMind AI — Central model exports
// Import from here to avoid path confusion across the codebase

const Admin = require('./Admin');
const Campaign = require('./Campaign');
const Lead = require('./Lead');
const Transcript = require('./Transcript');
const Meeting = require('./Meeting');
const MeetingSlot = require('./MeetingSlot');
const CallLog = require('./CallLog');
const ErrorLog = require('./ErrorLog');

module.exports = {
  Admin,
  Campaign,
  Lead,
  Transcript,
  Meeting,
  MeetingSlot,
  CallLog,
  ErrorLog,
};