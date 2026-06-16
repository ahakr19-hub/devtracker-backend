const Redis = require("ioredis");

const port = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379;
const host = process.env.REDIS_HOST || "127.0.0.1";
const password = process.env.REDIS_PASSWORD || undefined;

const options = {
  host,
  port,
  password,
  maxRetriesPerRequest: null,
  connectTimeout: 10000,
  reconnectOnError(err) {
    if (err.message.includes('limit exceeded')) {
      console.error("🛑 Upstash limit exceeded detected. Banning further connection attempts.");
      // By returning 2, we abort the connection entirely.
      // This will emit an error, which we catch via redis.on("error")
      return 2; 
    }
  },
  retryStrategy(times) {
    // Never return null, as that causes terminal errors that might crash the app if uncaught by BullMQ.
    // Instead, cap the backoff at 10 seconds.
    return Math.min(times * 1000, 10000);
  }
};

// Enable TLS if using Upstash or external secured service
if (host.includes("upstash.io") || process.env.REDIS_TLS === 'true') {
  options.tls = {};
}

const redis = new Redis(options);

redis.on("connect", () => {
  console.log("✅ Redis connected");
});

redis.on("error", (err) => {
  console.error("❌ Redis error:", err.message);
});

module.exports = redis;