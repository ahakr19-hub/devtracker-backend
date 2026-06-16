/**
 * requireProAccess.middleware.js
 * Agent 2 (Refactor) — Pro Trial Lifecycle & Access Control
 *
 * Priority:
 *   1. isPro === true              → PASS immediately (paid subscriber)
 *   2. Active trial window         → PASS (free 30-day trial)
 *   3. No GitHub linked            → 403 with hint to link
 *   4. Trial expired               → 403 with remainingDays: 0
 *
 * Returns structured JSON 403 so the Angular UI banner can render
 * actionable copy without string-parsing error messages.
 */
const ApiError = require("../utils/apiErrors");
const { getTrialStatus } = require("../utils/trial.helper");

const requireProAccess = (req, res, next) => {
  const user = req.user;

  if (!user) {
    return next(new ApiError(401, "Authentication required."));
  }

  const github = user.github || {};

  // ── Gate 1: Paid Pro subscriber — checks the actual subscription field ──────
  // set by the Stripe/Paymob webhook after a confirmed payment.
  if (user.subscription?.isPremium === true) {
    return next();
  }

  // ── Gate 2: Active trial window ───────────────────────────────────
  const { active, daysRemaining, endsAt } = getTrialStatus(github.proTrialEndDate);
  if (active) {
    return next();
  }

  // ── Rejected: build a structured error body for the UI banner ───────────
  const hasLinkedGitHub = !!github.githubId;

  if (!hasLinkedGitHub) {
    return res.status(403).json({
      error:         "github_not_linked",
      message:       "Link your GitHub account to activate your free 30-day Pro trial.",
      remainingDays: 0,
      endsAt:        null,
    });
  }

  // Trial has expired
  return res.status(403).json({
    error:         "trial_expired",
    message:       "Your Pro trial has expired. Please upgrade to continue using GitHub features.",
    remainingDays: 0,
    endsAt:        endsAt ? endsAt.toISOString() : null,
  });
};

module.exports = requireProAccess;
