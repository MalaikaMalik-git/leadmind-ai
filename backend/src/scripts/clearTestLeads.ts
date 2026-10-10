import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';

const Lead = require('../models/Lead');

// One-off cleanup — NOT part of the Day 11 deliverable.
// Deletes all leads for a campaign so you can re-run a clean import test.
// Usage: CAMPAIGN_ID=<id> npx ts-node src/scripts/clearTestLeads.ts

async function main() {
  const campaignId = process.env.CAMPAIGN_ID;
  if (!campaignId) {
    console.error('Set CAMPAIGN_ID env var first, e.g.: CAMPAIGN_ID=abc123 npx ts-node src/scripts/clearTestLeads.ts');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI!);

  const result = await Lead.deleteMany({ campaign: campaignId });
  console.log(`\n🗑️  Deleted ${result.deletedCount} lead(s) from campaign ${campaignId}\n`);

  // Also reset the campaign's totalLeads counter back to 0 so the stats bar
  // (Day 8) stays accurate after this cleanup.
  const Campaign = require('../models/Campaign');
  await Campaign.updateOne({ _id: campaignId }, { $set: { 'stats.totalLeads': 0 } });
  console.log('✅ Campaign stats.totalLeads reset to 0\n');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});