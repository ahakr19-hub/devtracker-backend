const teamService = require("../services/team.service");
const logger = require("../../../utils/logger");

/**
 * team.controller.js — HTTP layer only.
 *
 * Responsibilities:
 *   1. Extract validated input from req
 *   2. Delegate all business logic to the service
 *   3. Serialize the response
 *   4. Pass errors to the global error handler via next()
 *
 * No business logic lives here — the controller is intentionally thin.
 */

/**
 * @desc    Get all teams where the authenticated user is owner OR member
 * @route   GET /api/teams/my-teams
 * @access  Private (requires protect middleware)
 */
const getMyTeams = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const { ownedTeams, memberTeams } = await teamService.getMyTeams(userId);

    return res.status(200).json({
      status: "success",
      results: ownedTeams.length + memberTeams.length,
      data: {
        ownedTeams,
        memberTeams,
      },
    });
  } catch (error) {
    // Log internally with context — NEVER expose raw DB errors to client.
    // The global error middleware (error.middleware.js) handles serialisation.
    logger.error("[TeamController.getMyTeams]", error.message);
    next(error);
  }
};

/**
 * @desc    Create a new team — the calling user becomes the owner
 * @route   POST /api/teams
 * @access  Private
 */
const createTeam = async (req, res, next) => {
  try {
    const ownerId = req.user._id;
    const { name, description, category } = req.body;

    const team = await teamService.createTeam(ownerId, {
      name,
      description,
      category,
    });

    return res.status(201).json({
      status: "success",
      message: "Team created successfully",
      data: { team },
    });
  } catch (error) {
    logger.error("[TeamController.createTeam]", error.message);
    next(error);
  }
};

module.exports = {
  getMyTeams,
  createTeam,
};
