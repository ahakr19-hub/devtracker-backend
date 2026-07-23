const Invitation = require('../schemas/invitation.schema');
const Developer   = require('../schemas/developer.schema');
const Project     = require('../schemas/project.schema');

// ── Create ────────────────────────────────────────────────────────────────────

const createInvitation = async (senderId, recipientEmail) => {
  return await Invitation.create({
    sender: senderId,
    recipientEmail,
    status: "pending",
  });
};

/**
 * Agent 1 — creates an invitation that carries a specific project selection.
 * sharedProjectIds: string[] of ObjectIds the admin explicitly chose.
 */
const createInvitationWithProjects = async (senderId, recipientEmail, sharedProjectIds = []) => {
  return await Invitation.create({
    sender: senderId,
    recipientEmail,
    status: "pending",
    sharedProjects: sharedProjectIds,
  });
};

// ── Lookups ───────────────────────────────────────────────────────────────────

const findPendingInvite = async (senderId, recipientEmail) => {
  return await Invitation.findOne({
    sender: senderId,
    recipientEmail,
    status: "pending",
  });
};

const findInvitesForUser = async (email) => {
  return await Invitation.find({ recipientEmail: email, status: "pending" })
    .populate("sender", "name email")
    .populate("sharedProjects", "name status")   // ← expose project names in the UI
    .sort({ createdAt: -1 });
};

const findInviteById = async (id) => {
  return await Invitation.findById(id).populate("sharedProjects", "_id name");
};

/**
 * Agent 2 — RBAC: counts accepted invitations granting this email access to a
 * specific project. countDocuments → no documents loaded into memory.
 */
const findAcceptedInvitationsWithProject = async (recipientEmail, projectId) => {
  return await Invitation.countDocuments({
    recipientEmail,
    sharedProjects: projectId,
    status: "accepted",
  });
};

// ── Plan Limit Gate (Agent 1) ─────────────────────────────────────────────────

/**
 * Returns the total number of projects the invitee "controls":
 *   owned projects  +  unique projects shared via accepted invitations.
 *
 * Uses countDocuments + aggregate — never loads full documents into memory.
 * Both branches run in parallel via Promise.all for minimum latency.
 *
 * @param {ObjectId} inviteeId
 * @param {string}   inviteeEmail
 * @returns {Promise<number>}
 */
const getInviteeProjectCount = async (inviteeId, inviteeEmail) => {
  const [ownedCount, sharedCount] = await Promise.all([
    // Branch 1: projects directly owned by this developer (not archived)
    Project.countDocuments({ owner: inviteeId, isArchived: false }),

    // Branch 2: distinct shared-project IDs from accepted invitations.
    //   Aggregation deduplicates so one project shared by two admins counts once.
    Invitation.aggregate([
      {
        $match: {
          recipientEmail: inviteeEmail,
          status: "accepted",
          sharedProjects: { $exists: true, $not: { $size: 0 } },
        },
      },
      { $unwind: "$sharedProjects" },
      { $group: { _id: "$sharedProjects" } },
      { $count: "total" },
    ]).then((r) => (r.length > 0 ? r[0].total : 0)),
  ]);

  return ownedCount + sharedCount;
};

// ── Updates ───────────────────────────────────────────────────────────────────

const updateInvitationStatus = async (invitationId, status) => {
  return await Invitation.findByIdAndUpdate(
    invitationId,
    { status },
    { new: true }
  );
};

// ── Team Member Queries ───────────────────────────────────────────────────────

const findTeamMembers = async (adminId) => {
  return await Developer.find({
    "teams.adminId": adminId,
  }).select("name email teams.$");
};

const removeMemberFromTeam = async (adminId, memberId) => {
  return await Developer.findByIdAndUpdate(
    memberId,
    { $pull: { teams: { adminId: adminId } } },
    { new: true }
  );
};

const updateSinglePermission = async (adminId, memberId, key, value) => {
  const updateQuery = {};
  updateQuery[`teams.$.permissions.${key}`] = value;

  return await Developer.findOneAndUpdate(
    { _id: memberId, "teams.adminId": adminId },
    { $set: updateQuery },
    { new: true }
  );
};

const findAcceptedInvite = async (senderId, recipientEmail) => {
  return await Invitation.findOne({
    sender: senderId,
    recipientEmail,
    status: "accepted",
  });
};

/**
 * clearSharedProjects — wipes the sharedProjects array from an accepted invitation
 * after the member has been terminated so no stale project references remain in DB.
 *
 * @param {string} adminId   — The admin's ObjectId
 * @param {string} memberId  — The member developer's ObjectId
 * @returns {Promise<Invitation|null>}
 */
const clearSharedProjects = async (adminId, memberId) => {
  const member = await Developer.findById(memberId).select('email').lean();
  if (!member) return null;

  return await Invitation.findOneAndUpdate(
    {
      sender: adminId,
      recipientEmail: member.email.toLowerCase(),
      status: 'accepted',
    },
    { $set: { sharedProjects: [] } },
    { new: true }
  );
};

/**
 * Find the accepted invitation for a specific member by their Developer _id.
 * Used by terminateMember to collect the exact revokedProjectIds before removal.
 *
 * Strategy:
 *  1. Resolve the member's email from their Developer doc (_id → email, O(1) pk lookup).
 *  2. Query the Invitation by sender + email + status=accepted and populate sharedProjects.
 *
 * @param {string} adminId   — The admin's ObjectId
 * @param {string} memberId  — The member developer's ObjectId
 * @returns {Promise<Invitation|null>}
 */
const findAcceptedInviteByMemberId = async (adminId, memberId) => {
  // Step 1: resolve email (minimal projection — email only)
  const member = await Developer.findById(memberId).select('email').lean();
  if (!member) return null;

  // Step 2: fetch invitation with project references populated
  return await Invitation.findOne({
    sender: adminId,
    recipientEmail: member.email.toLowerCase(),
    status: 'accepted',
  }).populate('sharedProjects', '_id name');
};

module.exports = {
  createInvitation,
  createInvitationWithProjects,
  findPendingInvite,
  findInvitesForUser,
  findInviteById,
  findAcceptedInvitationsWithProject,
  getInviteeProjectCount,
  updateInvitationStatus,
  findTeamMembers,
  removeMemberFromTeam,
  updateSinglePermission,
  findAcceptedInvite,
  findAcceptedInviteByMemberId,
  clearSharedProjects,
};