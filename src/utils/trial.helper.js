/**
 * trial.helper.js
 * Agent 2 (Refactor) — Pro Trial Lifecycle Manager
 *
 * Trial duration is driven by GITHUB_PRO_TRIAL_DAYS env var (default: 30).
 * startProTrial() is strictly idempotent — it checks proTrialStartDate === null
 * so the trial can NEVER be reset by re-linking or re-calling.
 */

/** Duration sourced from env — allows ops to adjust without code deploy */
const TRIAL_DURATION_DAYS = parseInt(process.env.GITHUB_PRO_TRIAL_DAYS, 10) || 30;

/**
 * Activates the 30-day GitHub Pro trial on the given developer document.
 * Only runs on the first GitHub link (no existing trial start date).
 *
 * @param {import('mongoose').Document} developer  - Mongoose developer document
 * @returns {boolean} true if trial was newly started, false if already active/expired
 */
const startProTrial = (developer) => {
  // Strict null/undefined guard — proTrialStartDate being set = trial already exists
  const alreadyStarted =
    developer.github != null &&
    developer.github.proTrialStartDate != null;

  if (alreadyStarted) return false;

  const now = new Date();
  const trialEnd = new Date(now);
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DURATION_DAYS);

  // Initialise github sub-doc if first-ever link
  if (!developer.github) developer.github = {};

  developer.github.proTrialStartDate = now;
  developer.github.proTrialEndDate   = trialEnd;

  return true;
};

/**
 * Returns the number of days remaining in the trial (0 if expired / not started).
 * @param {Date|null} proTrialEndDate
 * @returns {{ active: boolean, daysRemaining: number, endsAt: Date|null }}
 */
const getTrialStatus = (proTrialEndDate) => {
  if (!proTrialEndDate) {
    return { active: false, daysRemaining: 0, endsAt: null };
  }

  const now = new Date();
  const end = new Date(proTrialEndDate);
  const msRemaining = end - now;

  if (msRemaining <= 0) {
    return { active: false, daysRemaining: 0, endsAt: end };
  }

  const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
  return { active: true, daysRemaining, endsAt: end };
};

module.exports = { startProTrial, getTrialStatus, TRIAL_DURATION_DAYS };
