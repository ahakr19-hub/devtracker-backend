/**
 * redis.js — Shared Redis client + exportable connection options
 *
 * We export TWO things:
 *  1. `redis`               — a live ioredis client for direct commands (hget, hset, etc.)
 *  2. `redisConnectionOptions` — the raw config object that BullMQ queues/workers import
 *     so they build their OWN connections with the SAME settings (BullMQ requires
 *     dedicated connections — it cannot share a single client with command traffic).
 *
 * Previously, taskQueue.js duplicated this entire config block, creating a second
 * independent TCP connection and risking config drift between the two copies.
 */
const Redis  = require("ioredis");
const logger = require("../utils/logger");

let host = "127.0.0.1";
let port = 6379;
let password = undefined;
let tls = false;

const redisUrl = process.env.REDIS_URL || process.env.REDIS_PUBLIC_URL;

if (redisUrl) {
  try {
    const parsed = new URL(redisUrl);
    host = parsed.hostname;
    port = parsed.port ? parseInt(parsed.port, 10) : 6379;
    password = parsed.password ? decodeURIComponent(parsed.password) : undefined;
    if (parsed.protocol === "rediss:") {
      tls = true;
    }
  } catch (err) {
    logger.error("❌ Failed to parse Redis URL:", err.message);
  }
} else {
  host = process.env.REDIS_HOST || "127.0.0.1";
  port = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379;
  password = process.env.REDIS_PASSWORD || undefined;
  tls = process.env.REDIS_TLS === "true";
}

// ── Shared connection config ──────────────────────────────────────────────────
// Exported so BullMQ queues/workers in taskQueue.js can use the exact same
// settings without duplicating this block.
const redisConnectionOptions = {
  host,
  port,
  password,
  maxRetriesPerRequest: null, // Required by BullMQ — do not remove
  connectTimeout: 10000,
  reconnectOnError(err) {
    if (err.message.includes("limit exceeded")) {
      logger.error("🛑 Redis: Upstash limit exceeded. Aborting connection attempts.");
      return 2; // ioredis magic value: abort entirely, emit error event
    }
  },
  retryStrategy(times) {
    // Cap back-off at 10 s — never return null (causes unhandled terminal errors)
    return Math.min(times * 1000, 10_000);
  },
};

// Enable TLS for Upstash or any externally secured Redis service
if (tls || host.includes("upstash.io")) {
  redisConnectionOptions.tls = {};
}

// ── Live ioredis client (for direct HGET / HSET / EXPIRE commands) ────────────
const redis = new Redis(redisConnectionOptions);

redis.on("connect", () => logger.info("✅ Redis connected"));
redis.on("error",   (err) => logger.error("❌ Redis error:", err.message));

module.exports = redis;
module.exports.redisConnectionOptions = redisConnectionOptions;