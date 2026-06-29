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

// ── 1. Auth Limiter — strict, protects brute-force sensitive endpoints ────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute sliding window
  max: 10,                   // Max 10 requests per IP per window
  standardHeaders: true,     // Return RateLimit-* headers (RFC 6585)
  legacyHeaders: false,      // Disable old X-RateLimit-* headers
  message: {
    status: "error",
    message:
      "Too many attempts from this IP. Please wait 15 minutes and try again.",
  },
  // Skip rate limiting for server-to-server health checks
  skip: (req) => req.path === "/health",
});

// ── 2. Global Limiter — loose backstop against API abuse / DDoS ──────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute window
  max: 200,                  // 200 requests per IP — high enough for legitimate SPAs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    message: "Too many requests from this IP. Please slow down.",
  },
  // Webhooks must never be rate-limited — they're server-to-server and time-sensitive
  skip: (req) =>
    req.path.startsWith("/subscribe/webhooks") ||
    req.path.startsWith("/github/webhooks"),
});

module.exports = { authLimiter, globalLimiter };