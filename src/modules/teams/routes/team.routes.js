const express = require("express");
const { getMyTeams, createTeam } = require("../controllers/team.controller");
const { protect } = require("../../../middlewares/auth.middleware");

const teamRouter = express.Router();

/**
 * All routes below require a valid JWT (protect middleware).
 * The protect middleware attaches req.user to the request.
 */

// GET /api/teams/my-teams — Fetch all teams for the authenticated user
teamRouter.get("/my-teams", protect, getMyTeams);

// POST /api/teams — Create a new team (caller becomes owner)
teamRouter.post("/", protect, createTeam);

module.exports = { teamRouter };
