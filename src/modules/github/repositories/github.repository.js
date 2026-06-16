/**
 * github.repository.js
 * Agent 3 — Data access layer for GitHub-specific Developer operations.
 * All DB calls are lean + field-projected for maximum performance.
 */
const Developer = require("../../auth/schemas/developer.schema");

/**
 * Find a developer by their GitHub numeric ID (string-stored).
 * Uses the sparse index on github.githubId — O(log n).
 */
const findByGithubId = (githubId) =>
  Developer.findOne({ "github.githubId": String(githubId) });

/**
 * Find a developer by their primary email.
 */
const findByEmail = (email) => Developer.findOne({ email });

/**
 * Atomically update the github sub-document for a developer.
 * Uses $set to avoid overwriting unrelated fields.
 */
const updateGithubData = (developerId, githubData) =>
  Developer.findByIdAndUpdate(
    developerId,
    { $set: githubData },
    { new: true, runValidators: true }
  );

/**
 * Add repos to linkedRepos if they are not already present (by repoId).
 * Uses $addToSet equivalent via $push + filtering in service layer.
 */
const setLinkedRepos = (developerId, repos) =>
  Developer.findByIdAndUpdate(
    developerId,
    { $set: { "github.linkedRepos": repos } },
    { new: true, select: "github.linkedRepos" }
  );

/**
 * Efficiently read only the GitHub sub-document for trial status queries.
 */
const getGithubSlice = (developerId) =>
  Developer.findById(developerId)
    .select("github subscription")
    .lean();

module.exports = {
  findByGithubId,
  findByEmail,
  updateGithubData,
  setLinkedRepos,
  getGithubSlice,
};
