/**
 * DevTrack — Load Test Account Seeder
 * ====================================
 * Creates 5 dedicated load-test developer accounts directly in MongoDB.
 * Bypasses the OTP email flow so accounts are immediately usable.
 * Passwords are bcrypt-hashed at cost 10 (same as the auth service).
 *
 * Run from project root:
 *   node load-tests/seed-load-test-accounts.js
 *
 * To remove these accounts after testing:
 *   node load-tests/cleanup.js  (handles tasks)
 *   Or run the drop section at the bottom manually in mongosh.
 */

require('dotenv').config({ path: './config.env' });
const mongoose = require('mongoose');
const bcrypt   = require('bcrypt');

// ── Resolve MONGO_URI from whichever env var your project uses ────────────────
const MONGO_URI = process.env.MONGO_URL || process.env.MONGO_URI || process.env.DATABASE;

if (!MONGO_URI) {
  console.error('❌  No MongoDB URI found (MONGO_URL / MONGO_URI / DATABASE). Check config.env');
  process.exit(1);
}

// ── Load-test accounts to seed ────────────────────────────────────────────────
// These match the TEST_ACCOUNTS array in devtrack.load.test.js exactly.
const LOAD_TEST_ACCOUNTS = [
  { name: 'LoadTest User 1', email: 'loadtest1@devtrack.io', password: 'LoadTest@123' },
  { name: 'LoadTest User 2', email: 'loadtest2@devtrack.io', password: 'LoadTest@123' },
  { name: 'LoadTest User 3', email: 'loadtest3@devtrack.io', password: 'LoadTest@123' },
  { name: 'LoadTest User 4', email: 'loadtest4@devtrack.io', password: 'LoadTest@123' },
  { name: 'LoadTest User 5', email: 'loadtest5@devtrack.io', password: 'LoadTest@123' },
];

async function seed() {
  console.log('\n🔗  Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI, { maxPoolSize: 5 });
  console.log('✅  Connected.\n');

  const collection = mongoose.connection.db.collection('developers');
  const SALT_ROUNDS = 10; // Must match bcrypt cost in auth.service.js

  let created = 0;
  let skipped = 0;

  for (const account of LOAD_TEST_ACCOUNTS) {
    // Check if the account already exists — idempotent seed
    const existing = await collection.findOne({ email: account.email });

    if (existing) {
      console.log(`⏭️   Skipping ${account.email} — already exists.`);
      skipped++;
      continue;
    }

    // Hash the password with bcrypt (cost 10) — same as auth.service.js
    const hashedPassword = await bcrypt.hash(account.password, SALT_ROUNDS);

    // Build the document matching the Developer schema exactly
    const doc = {
      name:      account.name,
      email:     account.email,
      password:  hashedPassword,
      role:      'developer',

      // isVerified is not in the schema but login only checks email+password
      // so no OTP verification needed for these direct-insert accounts.

      subscription: {
        plan:               'free',
        isPremium:          false,
        status:             'free',
        planType:           'monthly',
        subscriptionStatus: 'expired',  // Free tier — enough to access endpoints
      },

      projectCount: 0,
      github:       {},
      teams:        [],

      notifications: {
        emailOnTaskComplete:  false,
        emailOnProjectUpdate: false,
      },

      preferences: {
        theme:    'dark',
        language: 'en',
      },

      resetOTP:            null,
      resetOTPExpires:     null,
      resetOTPAttempts:    0,
      resetOTPLastRequest: null,

      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await collection.insertOne(doc);
    console.log(`✅  Created: ${account.email}`);
    created++;
  }

  console.log(`\n📊  Seed Summary:`);
  console.log(`    ✅  Created : ${created}`);
  console.log(`    ⏭️   Skipped : ${skipped}`);
  console.log(`    📁  Total   : ${LOAD_TEST_ACCOUNTS.length}\n`);

  if (created > 0 || skipped === LOAD_TEST_ACCOUNTS.length) {
    console.log('🚀  All load-test accounts are ready.\n');
    console.log('    Run the test with:');
    console.log('    k6 run load-tests/devtrack.load.test.js\n');
  }

  await mongoose.disconnect();
  console.log('🔌  Connection closed.');
}

seed().catch((err) => {
  console.error('\n❌  Seeder failed:', err.message);
  mongoose.disconnect().finally(() => process.exit(1));
});
