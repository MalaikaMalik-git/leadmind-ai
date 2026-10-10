// src/scripts/seed.js
// LeadMind AI — Database Seeder
// Day 2 Task: "Seed one admin user for testing"
// Run: npm run seed

require('dotenv').config();
const { connectDB, disconnectDB } = require('../config/database');
const { Admin, MeetingSlot } = require('../models/Index');

const seedAdmin = async () => {
  console.log('\n🌱 LeadMind AI — Database Seeder');
  console.log('═'.repeat(50));

  await connectDB();

  // ── Check if admin already exists ──────────────────────────────────────────
  const existingAdmin = await Admin.findOne({
    email: process.env.SEED_ADMIN_EMAIL || 'admin@leadmind.ai',
  }).select('+password');

  if (existingAdmin) {
    console.log('\n⚠️  Admin already exists:');
    console.log(`   Email: ${existingAdmin.email}`);
    console.log(`   Name:  ${existingAdmin.name}`);
    console.log('\n   To re-seed, delete the admin from MongoDB Atlas first.');
    await disconnectDB();
    return;
  }

  // ── Create Admin ───────────────────────────────────────────────────────────
  const adminData = {
    name: process.env.SEED_ADMIN_NAME || 'Malaika Malik',
    email: process.env.SEED_ADMIN_EMAIL || 'admin@leadmind.ai',
    password: process.env.SEED_ADMIN_PASSWORD || 'Admin@123456',
    role: 'admin',
    isActive: true,
    timezone: 'Asia/Karachi',
  };

  const admin = await Admin.create(adminData);

  console.log('\n✅ Admin user created successfully:');
  console.log(`   Name:     ${admin.name}`);
  console.log(`   Email:    ${admin.email}`);
  console.log(`   Password: ${process.env.SEED_ADMIN_PASSWORD || 'Admin@123456'}`);
  console.log(`   Role:     ${admin.role}`);
  console.log(`   ID:       ${admin._id}`);

  // ── Create Default MeetingSlot config for admin ───────────────────────────
  const existingSlot = await MeetingSlot.findOne({ admin: admin._id });

  if (!existingSlot) {
    await MeetingSlot.create({ admin: admin._id });
    console.log('\n✅ Default meeting availability config created (Mon–Fri 9am–5pm PKT)');
  }

  console.log('\n═'.repeat(50));
  console.log('🎉 Seeding complete! You can now log in at http://localhost:3000');
  console.log('═'.repeat(50) + '\n');

  await disconnectDB();
};

seedAdmin().catch((err) => {
  console.error('\n❌ Seeding failed:', err.message);
  process.exit(1);
});