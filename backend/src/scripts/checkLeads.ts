import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';

const Lead = require('../models/Lead');

// One-off diagnostic — NOT part of the Day 11 deliverable.
// Usage: CAMPAIGN_ID=<id> npx ts-node src/scripts/checkLeads.ts

async function main() {
  const campaignId = process.env.CAMPAIGN_ID;
  if (!campaignId) {
    console.error('Set CAMPAIGN_ID env var first, e.g.: CAMPAIGN_ID=abc123 npx ts-node src/scripts/checkLeads.ts');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI!);

  const leads = await Lead.find({ campaign: campaignId }, 'fullName phone email importBatch createdAt').lean();

  console.log(`\nCampaign ${campaignId} currently has ${leads.length} lead(s):\n`);
  leads.forEach((l: any) => {
    console.log(`  • ${l.fullName} | ${l.phone} | ${l.email} | batch=${l.importBatch} | ${l.createdAt}`);
  });
  console.log('');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});