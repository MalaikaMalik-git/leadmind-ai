// src/config/database.js
// LeadMind AI — MongoDB Atlas connection via Mongoose

const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
      throw new Error(
        'MONGODB_URI is not defined in environment variables.\n' +
        'Copy .env.example → .env and add your MongoDB Atlas URI.'
      );
    }

    const conn = await mongoose.connect(uri, {
      // These are the recommended options for Mongoose 8.x
      serverSelectionTimeoutMS: 10000, // Timeout after 10s
      socketTimeoutMS: 45000,          // Close sockets after 45s
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`   Database: ${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.error(`❌ MongoDB Connection Failed: ${error.message}`);
    process.exit(1);
  }
};

// Graceful disconnect helper (used in tests/scripts)
const disconnectDB = async () => {
  await mongoose.disconnect();
  console.log('🔌 MongoDB Disconnected.');
};

module.exports = { connectDB, disconnectDB };