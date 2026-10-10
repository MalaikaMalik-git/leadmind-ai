// src/scripts/testConnection.js
// LeadMind AI — MongoDB Connection Test
// Day 2 Task: "Test DB connection from backend"
// Run: npm run test:db

require('dotenv').config();
const { connectDB, disconnectDB } = require('../config/database');
const { Admin, Campaign, Lead, Transcript, Meeting, MeetingSlot, CallLog } = require('../models/Index');

const testConnection = async () => {
  console.log('\n🔍 LeadMind AI — Database Connection Test');
  console.log('═'.repeat(50));

  await connectDB();

  console.log('\n📋 Testing model access (count documents in each collection):\n');

  const models = [
    { name: 'Admin', model: Admin },
    { name: 'Campaign', model: Campaign },
    { name: 'Lead', model: Lead },
    { name: 'Transcript', model: Transcript },
    { name: 'Meeting', model: Meeting },
    { name: 'MeetingSlot', model: MeetingSlot },
    { name: 'CallLog', model: CallLog },
  ];

  let allPassed = true;

  for (const { name, model } of models) {
    try {
      const count = await model.countDocuments();
      console.log(`   ✅ ${name.padEnd(14)} — ${count} document(s)`);
    } catch (err) {
      console.log(`   ❌ ${name.padEnd(14)} — FAILED: ${err.message}`);
      allPassed = false;
    }
  }

  console.log('\n' + '═'.repeat(50));
  if (allPassed) {
    console.log('✅ All models connected successfully!\n');
  } else {
    console.log('⚠️  Some models failed. Check errors above.\n');
  }

  await disconnectDB();
};

testConnection().catch((err) => {
  console.error('\n❌ Connection test failed:', err.message);
  process.exit(1);
});