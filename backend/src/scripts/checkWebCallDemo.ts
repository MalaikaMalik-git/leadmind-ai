// backend/src/scripts/checkWebCallDemo.ts
//
// DEMO verification — prints what the latest browser web call produced in
// MongoDB: CallLog → Transcript → Lead → Meeting → Campaign stats → dashboard
// KPI numbers. Read-only. Run with: npm run demo:webcall:check

import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
const CallLog = require('../models/CallLog');
const Transcript = require('../models/Transcript');
const Lead = require('../models/Lead');
const Meeting = require('../models/Meeting');
const Campaign = require('../models/Campaign');

const tick = (ok: boolean) => (ok ? '✅' : '❌');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);

  const call = await CallLog.findOne({ channel: 'Web' }).sort({ initiatedAt: -1 });
  if (!call) {
    console.log('No web call found yet. Start one from Dashboard → Calls → "Web Call (Demo)".');
    return;
  }

  const lead = await Lead.findById(call.lead);
  const transcript = call.transcript ? await Transcript.findById(call.transcript) : null;
  const meeting = await Meeting.findOne({ lead: call.lead }).sort({ createdAt: -1 });
  const campaign = call.campaign ? await Campaign.findById(call.campaign) : null;

  console.log('\n──────── Latest WEB call ────────');
  console.log(`${tick(!!call.vapiCallId)} CallLog ${call._id}  status=${call.status}  duration=${call.durationSeconds}s  vapiCallId=${call.vapiCallId || '(missing)'}`);
  console.log(`${tick(!!call.endOfCallProcessedAt)} End-of-call processed (webhook or /sync)`);
  console.log(`${tick(!!transcript)} Transcript ${transcript ? `${transcript._id}  messages=${transcript.messages.length}  finalStatus=${transcript.finalStatus}` : '(none)'}`);
  console.log(`${tick(lead?.qualificationScore != null)} Lead "${lead?.fullName}"  status=${lead?.status}  score=${lead?.qualificationScore}  qualified=${lead?.isQualified}`);
  if (lead?.scoreBreakdown) console.log(`   breakdown: ${JSON.stringify(lead.scoreBreakdown)}`);
  if (lead?.qualificationReason) console.log(`   reason: ${lead.qualificationReason}`);
  console.log(`${tick(!!transcript?.detectedTopics?.length)} Topics: ${(transcript?.detectedTopics || []).map((t: any) => t.topic || t).join(', ') || '(none)'}`);
  console.log(`${tick(!!meeting)} Meeting ${meeting ? `${meeting._id}  at ${meeting.scheduledAt.toISOString()}  sync=${meeting.googleCalendar?.syncStatus}  link=${meeting.googleCalendar?.meetingLink || '-'}` : '(not booked yet)'}`);
  if (campaign) console.log(`   campaign "${campaign.name}" stats: ${JSON.stringify(campaign.stats)}`);

  const [totalLeads, qualified, booked, totalCalls] = await Promise.all([
    Lead.countDocuments({}),
    Lead.countDocuments({ $or: [{ isQualified: true }, { status: { $in: ['Qualified', 'Meeting Booked'] } }] }),
    Lead.countDocuments({ status: 'Meeting Booked' }),
    CallLog.countDocuments({}),
  ]);
  console.log(`\nDashboard KPIs → Total Leads: ${totalLeads} | Qualified: ${qualified} | Meetings Booked: ${booked} | Total Calls: ${totalCalls}\n`);
})()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
