/**
 * rateLimit.middleware.js
 *
 * Provides two rate limiters using the `express-rate-limit` package
 * (already in package.json dependencies — no install needed).
 *
 * ┌─────────────────────┬──────────┬─────────────────────────────────────┐
 * │ Limiter             │ Max Hits │ Window  │ Applied To                 │
 * ├─────────────────────┼──────────┼─────────────────────────────────────┤
 * │ authLimiter         │ 10       │ 15 min  │ /login, /register, /otp    │
 * │ globalLimiter       │ 200      │ 15 min  │ All routes (app.js)        │
 * └─────────────────────┴──────────┴─────────────────────────────────────┘
 *
 * NOTE: `app.set('trust proxy', 1)` is already set in app.js, which means
 * express-rate-limit will correctly read the real client IP from the
 * X-Forwarded-For header forwarded by Railway's proxy.
 */
const rateLimit = require("express-rate-limit");

// ── Load Test Mode Override ────────────────────────────────────────────────────
// Set LOAD_TEST_MODE=true in config.env before running k6.
// NEVER enable this in production — it disables all rate limiting.
const LOAD_TEST_MODE = process.env.LOAD_TEST_MODE === 'true';

// ── 1. Auth Limiter — strict, protects brute-force sensitive endpoints ────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: LOAD_TEST_MODE ? 100_000 : 10, // ← Unlimited during load tests; strict in prod
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    message:
      "Too many attempts from this IP. Please wait 15 minutes and try again.",
  },
  skip: (req) => req.path === "/health",
});

// ── 2. Global Limiter — loose backstop against API abuse / DDoS ──────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: LOAD_TEST_MODE ? 10_000_000 : 200, // ← Effectively disabled during load tests
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    message: "Too many requests from this IP. Please slow down.",
  },
  skip: (req) =>
    req.path.startsWith("/subscribe/webhooks") ||
    req.path.startsWith("/github/webhooks"),
});

module.exports = { authLimiter, globalLimiter };