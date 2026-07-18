/**
 * team.repository.js — Data-access layer for the "My Teams" feature.
 *
 * ROOT CAUSE FIX:
 *   This project stores team membership inside the Developer document as an
 *   embedded `teams: [{ adminId, joinedAt, permissions }]` array.
 *   The standalone Team collection is empty — the invitation flow has always
 *   written into Developer documents. All queries here target that existing data.
 *
 * Query strategy for GET /api/teams/my-teams:
 *   ① OWNED  — Developer.find({ "teams.adminId": userId })
 *              Finds every developer who accepted an invitation FROM the current user.
 *   ② MEMBER — Developer.findById(userId).select("teams")
 *              Reads the current user's own teams array, then batch-fetches each admin.
 *
 * Both branches use .lean() + strict field selection — no passwords, no billing data.
 */

const Developer = require("../../auth/schemas/developer.schema");
const Invitation = require("../../auth/schemas/invitation.schema");

/** Only these user fields are ever sent to the client. */
const USER_FIELDS = "_id name email avatar";

/**
 * ① Find all developers who are members of the current user's team.
 *    (i.e. they accepted an invitation sent BY this user.)
 *
 * Uses the existing multi-key index on "teams.adminId" in developerSchema.
 *
 * @param {string} adminId  — The team owner's _id
 * @returns {Promise<object[]>}  Lean user objects: { _id, name, email, avatar, sharedProjects }
 */
const findMyTeamMembers = async (adminId) => {
  const members = await Developer.find({ "teams.adminId": adminId })
    .select(USER_FIELDS)
    .lean();

  const acceptedInvites = await Invitation.find({
    sender: adminId,
    status: "accepted"
  }).select("recipientEmail sharedProjects").lean();

  const inviteMap = new Map(acceptedInvites.map(i => [i.recipientEmail.toLowerCase(), i.sharedProjects]));

  return members.map(m => ({
    ...m,
    sharedProjects: inviteMap.get(m.email.toLowerCase()) || []
  }));
};

/**
 * ② Find all teams the current user has joined as a member.
 *    Reads the user's embedded `teams` array, then batch-fetches each owner
 *    in a single secondary query (one DB round-trip regardless of team count).
 *
 * @param {string} userId
 * @returns {Promise<Array<{ adminId, joinedAt, permissions, owner }>>}
 */
const findTeamsIJoined = async (userId) => {
  // Single document fetch — hits the primary _id index (O(1)).
  const me = await Developer.findById(userId)
    .select("teams")
    .lean();

  if (!me || !me.teams || me.teams.length === 0) return [];

  // Collect admin IDs from the embedded entries.
  const adminIds = me.teams.map((t) => t.adminId);

  // Batch-fetch all admins in one query — avoids N+1.
  const admins = await Developer.find({ _id: { $in: adminIds } })
    .select(USER_FIELDS)
    .lean();

  // Batch-fetch all developers belonging to any of these admin teams — avoids N+1.
  const allTeamMembers = await Developer.find({ "teams.adminId": { $in: adminIds } })
    .select(`${USER_FIELDS} teams`)
    .lean();

  // Group members by adminId
  const membersByAdminMap = new Map();
  for (const member of allTeamMembers) {
    for (const teamEntry of member.teams || []) {
      if (!teamEntry.adminId) continue;
      const adminIdStr = teamEntry.adminId.toString();
      if (adminIds.some(id => id.toString() === adminIdStr)) {
        if (!membersByAdminMap.has(adminIdStr)) {
          membersByAdminMap.set(adminIdStr, []);
        }
        const list = membersByAdminMap.get(adminIdStr);
        if (!list.some(m => m._id.toString() === member._id.toString())) {
          const { teams, ...cleanMember } = member;
          list.push(cleanMember);
        }
      }
    }
  }

  // O(1) lookup map: adminId.toString() → admin object
  const adminMap = new Map(admins.map((a) => [a._id.toString(), a]));

  // Merge each embedded entry with its populated owner and members list.
  return me.teams.map((t) => {
    const adminIdStr = t.adminId.toString();
    return {
      ...t,
      owner: adminMap.get(adminIdStr) || null,
      members: membersByAdminMap.get(adminIdStr) || []
    };
  });
};

/**
 * Fetch a single developer's public profile (used to build the owner object).
 *
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
const findUserPublicProfile = async (userId) => {
  return Developer.findById(userId).select(USER_FIELDS).lean();
};

module.exports = {
  findMyTeamMembers,
  findTeamsIJoined,
  findUserPublicProfile,
};
