/**
 * error.middleware.js — Global Error Handler
 *
 * Must be the LAST middleware registered in app.js (after all routes).
 * Express identifies it as an error handler because it has 4 arguments: (err, req, res, next).
 *
 * Handles:
 *  1. Operational ApiErrors  — safe user-facing messages
 *  2. Mongoose CastError     — invalid ObjectId in a route param / query
 *  3. Mongoose Duplicate Key — e.g., registering with an existing email
 *  4. Mongoose ValidationError — schema-level field validation failures
 *  5. JWT errors             — expired / invalid tokens that slip past protect()
 *  6. Unknown errors         — log full context, return generic 500
 */
const ApiError = require("../utils/apiErrors");

const errorMiddleware = (err, req, res, next) => {
  // ── 1. Our own operational errors (thrown via `next(new ApiError(...))`) ──
  if (err.isOperational) {
    return res.status(err.status).json({
      status: "error",
      message: err.message,
    });
  }

  // ── 2. Mongoose CastError — invalid format for a MongoDB ObjectId ─────────
  // Triggered when a route param like /:id is not a valid 24-char hex string.
  // e.g., GET /projects/not-an-id  → "Invalid _id: not-an-id"
  if (err.name === "CastError") {
    return res.status(400).json({
      status: "error",
      message: `Invalid ${err.path}: ${err.value}. Please provide a valid ID.`,
    });
  }

  // ── 3. MongoDB Duplicate Key Error (code 11000) ───────────────────────────
  // Triggered when inserting/updating a document that violates a unique index.
  // e.g., registering with an email that already exists.
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    const value = err.keyValue?.[field];
    return res.status(409).json({
      status: "error",
      message: `${field} '${value}' already exists. Please use a different value.`,
    });
  }

  // ── 4. Mongoose ValidationError ──────────────────────────────────────────
  // Triggered when a document fails schema-level validation before saving.
  // e.g., saving a developer without a required `email` field.
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(422).json({
      status: "error",
      message: messages.join(". "),
    });
  }

  // ── 5. JWT Errors (safety net — protect() should catch these first) ────────
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      status: "error",
      message: "Invalid authentication token. Please log in again.",
    });
  }
  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      status: "error",
      message: "Your session has expired. Please log in again.",
    });
  }

  // ── 6. Unknown / Programming Errors ───────────────────────────────────────
  // Log full structured context for debugging. Never expose internals to client.
  console.error(
    JSON.stringify({
      level: "error",
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      userId: req.user?._id ?? "unauthenticated",
      error: err.message,
      stack: err.stack,
    })
  );

  return res.status(500).json({
    status: "error",
    message: "Something went wrong on our end. Please try again later.",
  });
};

module.exports = errorMiddleware;