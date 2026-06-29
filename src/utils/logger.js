/**
 * logger.js — Structured JSON logger
 *
 * Wraps console.* with structured JSON output so Railway's log drain
 * (and any future log aggregator like Datadog/Papertrail) can parse,
 * filter, and alert on log entries by level, timestamp, and message.
 *
 * Drop-in replacement for console.log / console.warn / console.error.
 *
 * Usage:
 *   const logger = require('../utils/logger');
 *   logger.info('Server started on port 3001');
 *   logger.warn('Trial expired for user', userId);
 *   logger.error('DB connection failed', err.message);
 */

const isProd = process.env.NODE_ENV === "production";

const format = (level, args) => {
  const message = args
    .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
    .join(" ");

  // In production — output one JSON line per entry (machine-readable)
  if (isProd) {
    return JSON.stringify({
      level,
      ts: new Date().toISOString(),
      msg: message,
    });
  }

  // In development — keep it human-readable with a timestamp prefix
  const ts = new Date().toISOString();
  return `[${ts}] [${level.toUpperCase()}] ${message}`;
};

const logger = {
  info:  (...args) => console.log(format("info", args)),
  warn:  (...args) => console.warn(format("warn", args)),
  error: (...args) => console.error(format("error", args)),
  debug: (...args) => {
    // Only emit debug logs outside of production to keep prod logs clean
    if (!isProd) console.log(format("debug", args));
  },
};

module.exports = logger;
