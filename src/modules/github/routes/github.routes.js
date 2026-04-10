/**
 * github.routes.js
 * Agent 3 — All /github/* endpoints with proper middleware stack.
 *
 * Middleware stack per route:
 *   protect            → verify JWT + attach req.user
 *   requireProAccess   → gate: isPro OR active trial
 *
 * Exception:
 *   POST /github/link  → only `protect` (user must link BEFORE trial exists)
 *   GET  /github/trial-status → only `protect` (anyone can check their status)
 */
const express = require("express");
const { protect } = require("../../../middlewares/auth.middleware");
const requireProAccess = require("../../../middlewares/requireProAccess.middleware");
const {
  linkAccount,
  listRepos,
  selectReposHandler,
  trialStatus,
  handleWebhook,
} = require("../controllers/github.controller");

const githubRouter = express.Router();

// ── Webhook Route (MUST be before protect) ──
// Requires raw body parsing (configured in app.js for /webhooks/)
// Authenticated via HMAC signature validation, NOT devtracker session
githubRouter.post("/webhooks/github", handleWebhook);

// All subsequent routes require authentication
githubRouter.use(protect);

/**
 * POST /github/link
 * Links a GitHub account to the authenticated DevTracker user.
 * Activates 30-day Pro trial on first link.
 * No trial gate here — this is the action that CREATES the trial.
 *
 * Body: { code: string }
 */
githubRouter.post("/link", linkAccount);

/**
 * GET /github/trial-status
 * Returns trial info for the UI banner (days remaining, isPro, endsAt).
 * No trial gate — any authenticated user can query their own status.
 */
githubRouter.get("/trial-status", trialStatus);

/**
 * GET /github/repos
 * Lists the user's GitHub repositories. Cached 5 min.
 * Requires: linked GitHub account + active trial or isPro.
 */
githubRouter.get("/repos", requireProAccess, listRepos);

/**
 * POST /github/select-repos
 * Stores selected repos to linkedRepos on the developer document.
 * Requires: linked GitHub account + active trial or isPro.
 *
 * Body: { repos: Array<{ repoId, name, fullName, private?, htmlUrl?, language? }> }
 */
githubRouter.post("/select-repos", requireProAccess, selectReposHandler);

module.exports = githubRouter;
