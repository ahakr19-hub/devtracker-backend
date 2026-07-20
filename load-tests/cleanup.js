/**
 * DevTrack — Post-Load-Test Cleanup Script
 *
 * Removes all synthetic data created by the k6 load test.
 * Run with: node load-tests/cleanup.js
 *
 * Prerequisites:
 *   - MONGO_URI must be set in config.env or as an environment variable
 *   - Run from the project root: node load-tests/cleanup.js
 */

require('dotenv').config({ path: './config.env' });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URL || process.env.MONGO_URI || process.env.DATABASE;

if (!MONGO_URI) {
  console.error('❌  MONGO_URL / MONGO_URI / DATABASE not found in environment. Aborting.');
  process.exit(1);
}

async function cleanup() {
  console.log('🔗  Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI, { maxPoolSize: 5 });
  console.log('✅  Connected.');

  // ---- Delete synthetic tasks ----
  const taskResult = await mongoose.connection.db
    .collection('tasks')
    .deleteMany({ title: { $regex: /^\[LoadTest\]/ } });

  console.log(`🗑️   Deleted ${taskResult.deletedCount} load-test task(s).`);

  // ---- Delete synthetic projects ----
  const projectResult = await mongoose.connection.db
    .collection('projects')
    .deleteMany({ name: { $regex: /^\[LoadTest\]/ } });
  console.log(`🗑️   Deleted ${projectResult.deletedCount} load-test project(s).`);

  await mongoose.disconnect();
  console.log('✅  Cleanup complete. Connection closed.');
}

cleanup().catch((err) => {
  console.error('❌  Cleanup failed:', err.message);
  process.exit(1);
});
