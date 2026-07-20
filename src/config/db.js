const mongoose = require("mongoose");

/**
 * Connects to MongoDB and returns the promise.
 * Callers must await this so the server never starts before the DB is ready.
 */
const dbConnection = async () => {
  // Mask credentials before logging so the Atlas password never appears in Railway logs
  const safeUrl = process.env.MONGO_URL?.replace(
    /:\/\/([^:]+):([^@]+)@/,
    "://<user>:<pass>@"
  );
  console.log("Connecting to MongoDB:", safeUrl);

  await mongoose.connect(process.env.MONGO_URL, {
    family: 4,                       // Force IPv4 — avoids DNS lookup issues on Node 18+
    serverSelectionTimeoutMS: 5000,  // Fail fast instead of hanging for 30 s
    maxPoolSize: 100,                // Increase connection pool size for high concurrency
  });

  console.log("✅ Database connected successfully");
};

module.exports = dbConnection;