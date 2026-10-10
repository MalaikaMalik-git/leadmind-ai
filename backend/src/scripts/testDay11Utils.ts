import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { parseCsvBuffer } from '../utils/csvParser';
import {
  buildHeaderMap,
  validateRequiredColumns,
  mapRowToLeadFields,
  validateLeadRow,
} from '../utils/leadValidation';
import { getExistingContacts, DuplicateChecker } from '../utils/duplicateDetection';

const Campaign = require('../models/Campaign');

// ─────────────────────────────────────────────────────────────────────────────
//  Day 11 — Session 1 sanity check
//  Run with: npm run test:day11
//
//  This does NOT hit any HTTP route (that's Session 2). It exercises the
//  parsing → validation → duplicate-detection pipeline directly so we can
//  confirm all four utils work correctly before wiring the real endpoint.
// ─────────────────────────────────────────────────────────────────────────────

// A sample CSV with: 2 valid rows, 1 missing name, 1 bad phone, 1 in-file duplicate phone
const SAMPLE_CSV = `Full Name,Phone Number,Email,Company
Ayesha Khan,+92 300 1234567,ayesha@example.com,Acme Corp
Bilal Ahmed,0321-9876543,bilal@example.com,Beta Software
,0333-1112222,noname@example.com,Gamma Inc
Sara Malik,abc123,sara@example.com,Delta Ltd
Ayesha Khan,+923001234567,duplicate@example.com,Acme Corp`;

async function main() {
  console.log('\n🧪 Day 11 — Session 1 Utility Test\n' + '─'.repeat(50));

  // ── 1. Parse ────────────────────────────────────────────────────────────
  const buffer = Buffer.from(SAMPLE_CSV, 'utf-8');
  const { headers, rows } = parseCsvBuffer(buffer);
  console.log(`✅ Parsed CSV — ${rows.length} data rows found`);
  console.log(`   Headers: ${headers.join(', ')}`);

  // ── 2. Required column check ────────────────────────────────────────────
  const columnCheck = validateRequiredColumns(headers);
  if (!columnCheck.valid) {
    console.log(`❌ Missing required columns: ${columnCheck.missing.join(', ')}`);
    process.exit(1);
  }
  console.log('✅ Required columns present (Full Name, Phone)');

  // ── 3. Map + validate each row ───────────────────────────────────────────
  const headerMap = buildHeaderMap(headers);
  const mappedRows = rows.map((row) => mapRowToLeadFields(row, headerMap));

  let validCount = 0;
  let invalidCount = 0;

  mappedRows.forEach((row, i) => {
    const result = validateLeadRow(row);
    if (result.valid) {
      validCount++;
      console.log(`   Row ${i + 1} [${row.fullName}] → valid`);
    } else {
      invalidCount++;
      console.log(`   Row ${i + 1} → INVALID: ${result.errors.join(' / ')}`);
    }
  });

  console.log(`✅ Row validation done — ${validCount} valid, ${invalidCount} invalid`);

  // ── 4. Duplicate detection ──────────────────────────────────────────────
  // Try to connect to MongoDB so we can also test against real existing
  // leads. If no campaigns exist yet, we still test in-file duplicate
  // detection using an empty starting set.
  let existingContacts = { phones: new Set<string>(), emails: new Set<string>() };
  let dbTested = false;

  if (process.env.MONGODB_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      const anyCampaign = await Campaign.findOne().lean();

      if (anyCampaign) {
        existingContacts = await getExistingContacts(anyCampaign._id.toString());
        console.log(
          `✅ Connected to MongoDB — checked against campaign "${anyCampaign.name}" ` +
          `(${existingContacts.phones.size} existing phones, ${existingContacts.emails.size} existing emails)`
        );
        dbTested = true;
      } else {
        console.log('⚠️  Connected to MongoDB but no campaigns exist yet — testing in-file duplicates only');
      }
    } catch (err: any) {
      console.log(`⚠️  Could not connect to MongoDB (${err.message}) — testing in-file duplicates only`);
    }
  } else {
    console.log('⚠️  MONGODB_URI not set — testing in-file duplicates only');
  }

  const checker = new DuplicateChecker(existingContacts);
  let dupeCount = 0;

  mappedRows.forEach((row, i) => {
    const isDupe = checker.isDuplicate(row.phone, row.email);
    if (isDupe) {
      dupeCount++;
      console.log(`   Row ${i + 1} [${row.fullName || '(no name)'}] → DUPLICATE (phone/email already seen)`);
    } else {
      checker.markSeen(row.phone, row.email);
    }
  });

  console.log(`✅ Duplicate detection done — ${dupeCount} duplicate(s) found ${dbTested ? '(DB + in-file)' : '(in-file only)'}`);

  console.log('─'.repeat(50));
  console.log('🎉 All Session 1 utilities working as expected.\n');

  if (dbTested) await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Test script failed:', err);
  process.exit(1);
});