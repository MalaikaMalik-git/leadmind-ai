// backend/src/scripts/cleanupTestData.ts
//
// Removes the test data that built up in MongoDB during development
// (test campaigns, leads, calls, transcripts, meetings, error logs) and
// leaves the system itself untouched:
//
//   KEPT   Admin accounts, Google Calendar connection, Scheduling settings
//          (MeetingSlot) and — unless --include-audit — the Audit Log.
//   DELETED Campaigns, Leads, Calls, Transcripts, Meetings, Error Logs.
//
// SAFE BY DEFAULT
//   • Without --confirm it only PRINTS what it would delete (dry run).
//   • With --confirm it first writes a JSON backup of everything it is about
//     to delete to backend/backups/ (restore = re-insert from that file).
//   • It then asks you to type the database name before deleting anything
//     (skip the prompt with --yes in non-interactive shells).
//
// USAGE (from the backend folder)
//   npm run cleanup:test-data                          # dry run — look first
//   npm run cleanup:test-data -- --confirm             # really delete
//   npm run cleanup:test-data -- --confirm --except=<campaignId>[,<id2>]   # keep specific campaigns
//
// OPTIONAL FLAGS
//   --calendar        also delete the Google Calendar events of the deleted
//                     meetings (silently — leads are NOT emailed cancellations)
//   --vapi            also delete the VAPI assistants of the deleted campaigns
//   --include-audit   also clear the Audit Log
//   --no-backup       skip the JSON backup (not recommended)
//   --yes             skip the "type the database name" prompt

import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import mongoose from 'mongoose';

const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');
const Transcript = require('../models/Transcript');
const Meeting = require('../models/Meeting');
const ErrorLog = require('../models/ErrorLog');
const AuditLog = require('../models/AuditLog');
const Admin = require('../models/Admin');

import { deleteCalendarEvent } from '../services/googleCalendarService';
import { getValidAccessToken } from '../services/calendarTokenService';
import { deleteAssistant } from '../services/vapiService';

const args = process.argv.slice(2);
const has = (flag: string) => args.includes(flag);
const exceptArg = args.find((a) => a.startsWith('--except='));
const keepCampaignIds: string[] = exceptArg
  ? exceptArg.replace('--except=', '').split(',').map((s) => s.trim()).filter(Boolean)
  : [];

const CONFIRM = has('--confirm');
const DO_CALENDAR = has('--calendar');
const DO_VAPI = has('--vapi');
const INCLUDE_AUDIT = has('--include-audit');
const NO_BACKUP = has('--no-backup');
const SKIP_PROMPT = has('--yes');

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set in backend/.env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const dbName = mongoose.connection.name;

  // Everything NOT in keepCampaignIds. $nin also matches campaign:null (inbound / web-demo leads).
  const keepObjectIds = keepCampaignIds.map((id) => new mongoose.Types.ObjectId(id));
  const byCampaign = keepObjectIds.length ? { campaign: { $nin: keepObjectIds } } : {};
  const campaignFilter = keepObjectIds.length ? { _id: { $nin: keepObjectIds } } : {};

  // _includeDeleted so previously soft-deleted campaigns are cleaned up too
  const campaigns = await Campaign.find(campaignFilter).setOptions({ _includeDeleted: true }).lean();
  const [leads, calls, transcripts, meetings, errorLogs, auditLogs, admins] = await Promise.all([
    Lead.countDocuments(byCampaign),
    CallLog.countDocuments(byCampaign),
    Transcript.countDocuments(byCampaign),
    Meeting.countDocuments(byCampaign),
    ErrorLog.countDocuments({}),
    AuditLog.countDocuments({}),
    Admin.countDocuments({}),
  ]);
  const meetingsWithEvents = await Meeting.find({ ...byCampaign, 'googleCalendar.eventId': { $ne: null } })
    .select('googleCalendar.eventId bookedBy campaign status')
    .lean();

  console.log(`\n🧹 LeadMind AI — test data cleanup`);
  console.log(`   Database: ${dbName}`);
  console.log(`   Mode:     ${CONFIRM ? 'DELETE (--confirm)' : 'DRY RUN (nothing will be deleted)'}\n`);

  console.log(`   Will KEEP: ${admins} admin account(s), Google connection, scheduling settings${INCLUDE_AUDIT ? '' : `, ${auditLogs} audit log entries`}`);
  if (keepObjectIds.length) console.log(`   Keeping campaign(s): ${keepCampaignIds.join(', ')} (and all their data)`);
  console.log(`\n   Will DELETE:`);
  console.log(`     campaigns    ${campaigns.length}`);
  for (const c of campaigns.slice(0, 25)) console.log(`        - ${c.name}  [${c.status}]  ${c._id}`);
  if (campaigns.length > 25) console.log(`        … and ${campaigns.length - 25} more`);
  console.log(`     leads        ${leads}`);
  console.log(`     calls        ${calls}`);
  console.log(`     transcripts  ${transcripts}`);
  console.log(`     meetings     ${meetings}${DO_CALENDAR ? `  (+ ${meetingsWithEvents.length} Google Calendar events)` : ''}`);
  console.log(`     error logs   ${errorLogs}`);
  if (INCLUDE_AUDIT) console.log(`     audit logs   ${auditLogs}`);

  if (!CONFIRM) {
    console.log(`\n   Dry run only. Re-run with --confirm to delete (a backup is written first).\n`);
    await mongoose.disconnect();
    return;
  }

  // ── Typed confirmation ────────────────────────────────────────────────────
  if (!SKIP_PROMPT) {
    const typed = await ask(`\n   Type the database name "${dbName}" to continue: `);
    if (typed !== dbName) {
      console.log('   Name did not match — nothing was deleted.\n');
      await mongoose.disconnect();
      return;
    }
  }

  // ── Backup ────────────────────────────────────────────────────────────────
  if (!NO_BACKUP) {
    const dir = path.resolve(__dirname, '../../backups');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.gitignore'), '*\n'); // backups hold lead data — never commit them
    const file = path.join(dir, `test-data-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    const backup = {
      createdAt: new Date().toISOString(),
      database: dbName,
      campaigns,
      leads: await Lead.find(byCampaign).lean(),
      calls: await CallLog.find(byCampaign).lean(),
      transcripts: await Transcript.find(byCampaign).lean(),
      meetings: await Meeting.find(byCampaign).lean(),
    };
    fs.writeFileSync(file, JSON.stringify(backup));
    console.log(`\n   💾 Backup written: ${file}`);
  }

  // ── Optional: external clean-up first (needs the DB rows to find ids) ────
  if (DO_CALENDAR && meetingsWithEvents.length) {
    const admin = await Admin.findOne({ 'googleCalendar.isConnected': true }).select('_id').lean();
    if (!admin) {
      console.log('   ⚠️  --calendar: no admin has Google Calendar connected — skipping calendar events.');
    } else {
      const token = await getValidAccessToken(String(admin._id));
      let ok = 0;
      let failed = 0;
      for (const m of meetingsWithEvents) {
        try {
          await deleteCalendarEvent(token, m.googleCalendar.eventId, 'none');
          ok++;
        } catch (e: any) {
          failed++;
          console.log(`   ⚠️  Could not delete calendar event ${m.googleCalendar.eventId}: ${e?.response?.data?.error?.message || e.message}`);
        }
      }
      console.log(`   📅 Google Calendar events removed: ${ok}${failed ? `, failed: ${failed}` : ''}`);
    }
  }

  if (DO_VAPI) {
    let ok = 0;
    for (const c of campaigns) {
      if (!c.vapiAssistantId) continue;
      try {
        await deleteAssistant(c.vapiAssistantId);
        ok++;
      } catch (e: any) {
        console.log(`   ⚠️  Could not delete VAPI assistant ${c.vapiAssistantId}: ${e?.response?.data?.message || e.message}`);
      }
    }
    console.log(`   🎙️  VAPI assistants removed: ${ok}`);
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  const r = {
    meetings: await Meeting.deleteMany(byCampaign),
    transcripts: await Transcript.deleteMany(byCampaign),
    calls: await CallLog.deleteMany(byCampaign),
    leads: await Lead.deleteMany(byCampaign),
    campaigns: await Campaign.deleteMany(campaignFilter).setOptions({ _includeDeleted: true }),
    errorLogs: await ErrorLog.deleteMany({}),
    auditLogs: INCLUDE_AUDIT ? await AuditLog.deleteMany({}) : { deletedCount: 0 },
  };

  console.log(`\n   ✅ Deleted: ${r.campaigns.deletedCount} campaigns, ${r.leads.deletedCount} leads, ${r.calls.deletedCount} calls, ` +
    `${r.transcripts.deletedCount} transcripts, ${r.meetings.deletedCount} meetings, ${r.errorLogs.deletedCount} error logs` +
    `${INCLUDE_AUDIT ? `, ${r.auditLogs.deletedCount} audit logs` : ''}\n`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
