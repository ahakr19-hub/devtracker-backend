const { tryCatch } = require("bullmq");
const teamService   = require("../../services/team.service");
const Project       = require("../../schemas/project.schema");

const sendInvite = async (req, res, next) => {
  try {
    const adminId = req.user._id;
    const { email, sharedProjects = [] } = req.body;

    // Basic input guard before hitting the service layer
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
 * Agent 2 — GET /invitations/my-projects
 * Returns only the non-archived projects owned by the requesting admin,
 * so the frontend project-selector modal can populate itself without
 * exposing any other developer's data.
 *
 * Projection: only _id and name are returned (minimal surface area).
 */
const getAdminProjects = async (req, res, next) => {
  try {
    const adminId = req.user._id;

    const projects = await Project.find(
      { owner: adminId, isArchived: false },
      { _id: 1, name: 1, status: 1 }      // minimal projection
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



// في ملف controllers/team.controller.js

const respondToInvitation = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { invitationId } = req.params;
    const { decision } = req.body;

    const result = await teamService.respondToInvite(
      userId,
      invitationId,
      decision,
    );

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
 * @route   GET /api/v1/teams/members
 * @access  Private (Admin Only)
 */
const getTeamMembers = async (req, res, next) => {
  try {
    const adminId = req.user._id;
    const members = await teamService.getTeamMembers(adminId);

    res.status(200).json({
      status: "success",
      results: members.length,
      data: {
        members,
      },
    });
  } catch (error) {
    next(error);
  }
};
/**
 * @desc    Get all pending invitations for the logged-in developer
 * @route   GET /api/v1/teams/my-invitations
 * @access  Private (Logged-in Developer)
 */
const getMyInvitations = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const invitations = await teamService.getMyInvitations(userId);

    res.status(200).json({
      status: "success",
      results: invitations.length,
      data: {
        invitations,
      },
    });
  } catch (error) {
    next(error);
  }
};

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
 * @desc    Update a single permission for a team member
 * @route   PATCH /api/v1/teams/members/:memberId/permissions
 * @access  Private (Admin Only)
 */
const updateMemberPermission = async (req, res, next) => {
  try {
    const adminId = req.user._id;
    const { memberId } = req.params;
    const { key, value } = req.body; // بنبعت مثلاً key: "canDeleteProjects", value: true

    const result = await teamService.changeMemberPermissions(
      adminId,
      memberId,
      key,
      value
    );

    res.status(200).json({
      status: "success",
      message: result.message,
      data: {
        updatedPermission: result.updated
      }
    });
  } catch (error) {
    next(error);
  }
};

const assignProjectsToMember = async (req, res, next) => {
  try {
    const adminId = req.user._id;
    const { memberId } = req.params;
    const { projectIds = [] } = req.body;

    const result = await teamService.assignProjectsToMember(adminId, memberId, projectIds);

    res.status(200).json({
      status: "success",
      message: result.message,
      data: {
        sharedProjects: result.sharedProjects
      }
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
  updateMemberPermission,
  assignProjectsToMember
};

