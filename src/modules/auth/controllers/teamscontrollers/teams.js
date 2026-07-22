const teamService = require("../../services/team.service");
const Project     = require("../../schemas/project.schema");

/**
 * @desc    Send a team invitation (with optional project sharing)
 * @route   POST /invitations/sendinvitaions
 * @access  Private
 */
const sendInvite = async (req, res, next) => {
  try {
    const adminId = req.user._id;
    const { email, sharedProjects = [] } = req.body;

    if (!email || typeof email !== "string") {
      return res.status(400).json({ status: "fail", message: "A valid developer email is required." });
    }

    const invitation = await teamService.sendInvite(adminId, email, sharedProjects);

    res.status(201).json({
      status: "success",
      message: "Invitation sent successfully. The developer will see it in their dashboard.",
      data: { invitation },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Fetch admin's own projects for the project-selector modal
 * @route   GET /invitations/my-projects
 * @access  Private
 */
const getAdminProjects = async (req, res, next) => {
  try {
    const adminId = req.user._id;

    const projects = await Project.find(
      { owner: adminId, isArchived: false },
      { _id: 1, name: 1, status: 1 }
    )
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      status: "success",
      results: projects.length,
      data: { projects },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Respond to a team invitation (accept / reject)
 * @route   POST /invitations/respond/:invitationId
 * @access  Private
 */
const respondToInvitation = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { invitationId } = req.params;
    const { decision } = req.body;

    const result = await teamService.respondToInvite(userId, invitationId, decision);

    res.status(200).json({
      status: "success",
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all developers in the admin's team
 * @route   GET /invitations/members
 * @access  Private (Admin Only)
 */
const getTeamMembers = async (req, res, next) => {
  try {
    const adminId = req.user._id;
    const members = await teamService.getTeamMembers(adminId);

    res.status(200).json({
      status: "success",
      results: members.length,
      data: { members },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all pending invitations for the logged-in developer
 * @route   GET /invitations/getallinetations
 * @access  Private
 */
const getMyInvitations = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const invitations = await teamService.getMyInvitations(userId);

    res.status(200).json({
      status: "success",
      results: invitations.length,
      data: { invitations },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Remove a team member (legacy — does not emit revokedProjectIds)
 * @route   DELETE /invitations/members/:memberId
 * @access  Private (Admin / isTeamOwner)
 */
const removeTeamMember = async (req, res, next) => {
  try {
    const adminId = req.user._id;
    const { memberId } = req.params;
    const result = await teamService.removeMember(adminId, memberId);
    res.status(200).json({
      status: "success",
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Terminate a member — removes them AND emits `access:revoked`
 *          with the exact project IDs they are losing access to.
 *          Frontend listens and instantly filters those projects from its cache.
 * @route   POST /invitations/terminate/:memberId
 * @access  Private (Admin / isTeamOwner)
 */
const terminateMember = async (req, res, next) => {
  try {
    const adminId    = req.user._id;
    const { memberId } = req.params;

    const result = await teamService.terminateMember(adminId, memberId);

    res.status(200).json({
      status: "success",
      message: result.message,
      data: {
        revokedProjectIds: result.revokedProjectIds,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update a single permission key for a team member
 * @route   PATCH /invitations/members/:memberId/permissions
 * @access  Private (Admin / isTeamOwner)
 */
const updateMemberPermission = async (req, res, next) => {
  try {
    const adminId = req.user._id;
    const { memberId } = req.params;
    const { key, value } = req.body;

    const result = await teamService.changeMemberPermissions(adminId, memberId, key, value);

    res.status(200).json({
      status: "success",
      message: result.message,
      data: { updatedPermission: result.updated },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Assign (replace) shared projects for a team member
 * @route   PATCH /invitations/members/:memberId/assign-projects
 * @access  Private (Admin / isTeamOwner)
 */
const assignProjectsToMember = async (req, res, next) => {
  try {
    const adminId = req.user._id;
    const { memberId } = req.params;
    const { projectIds = [] } = req.body;

    const result = await teamService.assignProjectsToMember(adminId, memberId, projectIds);

    res.status(200).json({
      status: "success",
      message: result.message,
      data: { sharedProjects: result.sharedProjects },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  sendInvite,
  getAdminProjects,
  getMyInvitations,
  respondToInvitation,
  getTeamMembers,
  removeTeamMember,
  terminateMember,
  updateMemberPermission,
  assignProjectsToMember,
};
