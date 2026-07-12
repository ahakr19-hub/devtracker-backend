const teamRepository = require("../repositories/team.repository");
const ApiError = require("../../../utils/apiErrors");

/**
 * team.service.js — Business logic layer.
 *
 * Separates business rules from the HTTP layer (controller) and the
 * data-access layer (repository), making each individually testable.
 */

/**
 * Get all teams for a user, split into ownedTeams and memberTeams.
 *
 * Splitting on the service layer (not the DB) keeps the query simple
 * (one $or index-scan vs two separate queries) while still giving the
 * frontend a pre-classified response it can render directly.
 *
 * @param {string} userId  — The authenticated user's MongoDB _id
 * @returns {{ ownedTeams: object[], memberTeams: object[] }}
 */
const getMyTeams = async (userId) => {
  if (!userId) {
    throw new ApiError(400, "User ID is required");
  }

  // Single optimised DB round-trip — repository uses compound index IXSCAN
  const allTeams = await teamRepository.findMyTeams(userId);

  const userIdStr = userId.toString();

  // Partition into owned vs member in O(n) — no second DB call needed.
  const ownedTeams = allTeams.filter(
    (t) => t.owner._id.toString() === userIdStr
  );

  const memberTeams = allTeams.filter(
    (t) => t.owner._id.toString() !== userIdStr
  );

  return { ownedTeams, memberTeams };
};

/**
 * Create a new team — the calling user becomes the owner.
 *
 * @param {string} ownerId
 * @param {{ name: string, description?: string, category?: string }} payload
 * @returns {object} The newly created team (lean, populated)
 */
const createTeam = async (ownerId, payload) => {
  const { name, description, category } = payload;

  if (!name || name.trim().length < 2) {
    throw new ApiError(400, "Team name must be at least 2 characters");
  }

  return teamRepository.createTeam({
    name: name.trim(),
    description: description?.trim(),
    category: category?.trim(),
    ownerId,
  });
};

module.exports = {
  getMyTeams,
  createTeam,
};
