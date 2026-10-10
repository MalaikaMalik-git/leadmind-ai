// backend/src/scripts/migrateCallLogVapiIdIndex.ts
//
// LeadMind AI — Day 21, Session 1 one-time migration
// Run with: npm run migrate:calllog-index
//
// Why this is needed: MongoDB will NOT automatically alter an existing
// index's options when the field pattern is unchanged. The old index —
// { vapiCallId: 1 } with { sparse: true } — has the exact same key pattern
// as the new one — { vapiCallId: 1 } with { unique: true,
// partialFilterExpression: {...} } — so Mongoose's autoIndex on startup
// will NOT replace it; it'll either silently keep the old (unsafe) index
// or throw an IndexOptionsConflict, depending on driver version. This
// script explicitly drops the old index by name so the new one (defined
// in models/CallLog.js) gets created cleanly on next app startup.
//
// Safe to run multiple times — if the old index is already gone, it just
// says so and moves on.

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
const CallLog = require('../models/CallLog');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('✅ MongoDB connected\n');

  const existingIndexes = await CallLog.collection.indexes();
  console.log('Current indexes on CallLog:');
  existingIndexes.forEach((idx: any) => {
    const flags = [idx.unique && 'unique', idx.sparse && 'sparse', idx.partialFilterExpression && `partial:${JSON.stringify(idx.partialFilterExpression)}`]
      .filter(Boolean)
      .join(', ');
    console.log(`  - ${idx.name}:`, JSON.stringify(idx.key), flags ? `(${flags})` : '');
  });

  const oldIndex = existingIndexes.find((idx: any) => idx.name === 'vapiCallId_1');

  if (!oldIndex) {
    console.log('\nℹ️  No old vapiCallId_1 index found — nothing to drop.');
  } else if (oldIndex.unique && oldIndex.partialFilterExpression) {
    console.log('\nℹ️  Index is already the new unique+partial version — nothing to do.');
  } else {
    console.log('\n🗑️  Dropping old vapiCallId_1 index (sparse-only, not unique)...');
    await CallLog.collection.dropIndex('vapiCallId_1');
    console.log('✅ Old index dropped.');
  }

  console.log('\n🔧 Syncing indexes from the current schema (creates the new unique+partial index)...');
  await CallLog.syncIndexes();

  const finalIndexes = await CallLog.collection.indexes();
  console.log('\nFinal indexes on CallLog:');
  finalIndexes.forEach((idx: any) => {
    const flags = [idx.unique && 'unique', idx.partialFilterExpression && `partial:${JSON.stringify(idx.partialFilterExpression)}`]
      .filter(Boolean)
      .join(', ');
    console.log(`  - ${idx.name}:`, JSON.stringify(idx.key), flags ? `(${flags})` : '');
  });

  const newIndex = finalIndexes.find((idx: any) => idx.name === 'vapiCallId_1');
  if (newIndex?.unique && newIndex?.partialFilterExpression) {
    console.log('\n✅ Migration complete — vapiCallId is now uniquely enforced for real call IDs, while multiple pre-dial CallLogs with no vapiCallId yet remain unaffected.');
  } else {
    console.error('\n❌ Something looks off — the final index does not have both unique and partialFilterExpression set. Check the output above.');
    process.exit(1);
  }

  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});