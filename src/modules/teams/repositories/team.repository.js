const Team = require("../schemas/team.schema");

/**
 * team.repository.js — Data-access layer for the Team collection.
 *
 * All queries use `.lean()` to skip Mongoose document hydration,
 * returning plain JS objects.  This alone reduces memory allocation
 * by ~30-40% per request compared to full Mongoose documents.
 *
 * Population is strict — only the three fields the client needs
 * (_id, name, email, avatar) are fetched from the Developer collection.
 * The `select` string on `populate()` maps directly to a MongoDB
 * $project stage, so no extra bytes travel over the wire.
 */

/** Fields to populate from the Developer collection. */
const USER_PROJECTION = "_id name email avatar";

/**
 * Fetch all teams where `userId` is the owner OR a member.
 *
 * MongoDB executes this as two separate IXSCAN operations
 * (one on the `owner` index, one on the `members` multi-key index)
 * and merges via OR_TO_UNION, avoiding a COLLSCAN entirely.
 *
 * @param {import('mongoose').Types.ObjectId | string} userId
 * @returns {Promise<object[]>}
 */
const findMyTeams = async (userId) => {
  return Team.find({
    $or: [{ owner: userId }, { members: userId }],
    isActive: true,
  })
    .select("-__v -updatedAt") // strip housekeeping fields
    .populate("owner", USER_PROJECTION)
    .populate("members", USER_PROJECTION)
    .sort({ createdAt: -1 })
    .lean(); // ← bypass Mongoose hydration: plain JS objects, ~40% faster
};

/**
 * Create a new team with the calling user as owner.
 *
 * @param {{ name: string, description?: string, category?: string, ownerId: string }} payload
 * @returns {Promise<object>}
 */
const createTeam = async ({ name, description, category, ownerId }) => {
  const team = await Team.create({
    name,
    description: description || "",
    category: category || "general",
    owner: ownerId,
    members: [],
  });

  // Re-fetch with population so the controller always returns a consistent shape.
  return Team.findById(team._id)
    .populate("owner", USER_PROJECTION)
    .populate("members", USER_PROJECTION)
    .lean();
};

/**
 * Find a single team by its ID.
 *
 * @param {string} teamId
 * @returns {Promise<object|null>}
 */
const findTeamById = async (teamId) => {
  return Team.findById(teamId)
    .populate("owner", USER_PROJECTION)
    .populate("members", USER_PROJECTION)
    .lean();
};

module.exports = {
  findMyTeams,
  createTeam,
  findTeamById,
};
