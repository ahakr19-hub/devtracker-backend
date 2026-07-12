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

  // 1. Fetch public profile of current user (owner of their team)
  const ownerProfile = await teamRepository.findUserPublicProfile(userId);

  // 2. Fetch all members who joined current user's team
  const myMembers = await teamRepository.findMyTeamMembers(userId);

  const ownedTeams = [];
  if (ownerProfile) {
    ownedTeams.push({
      _id: ownerProfile._id.toString(),
      name: `${ownerProfile.name}'s Team`,
      description: "Primary development workspace",
      category: "general",
      isActive: true,
      owner: ownerProfile,
      members: myMembers,
      createdAt: ownerProfile.createdAt || new Date(),
      updatedAt: new Date()
    });
  }

  // 3. Fetch all teams the current user joined as a member
  const memberTeamsData = await teamRepository.findTeamsIJoined(userId);
  const memberTeams = memberTeamsData.map(t => {
    if (!t.owner) return null;
    return {
      _id: t.owner._id.toString(),
      name: `${t.owner.name}'s Team`,
      description: "Collaborator workspace",
      category: "general",
      isActive: true,
      owner: t.owner,
      members: t.members,
      createdAt: t.joinedAt || new Date(),
      updatedAt: new Date()
    };
  }).filter(Boolean);

  return { ownedTeams, memberTeams };
};

/**
 * Create a new team — this is a placeholder/no-op since teams are implicit
 * based on invitation/developer linkage in this schema.
 */
const createTeam = async (ownerId, payload) => {
  throw new ApiError(400, "In this workspace, teams are automatically created when you send and accept invitations.");
};

module.exports = {
  getMyTeams,
  createTeam,
};
