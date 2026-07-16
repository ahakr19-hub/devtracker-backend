/**
 * authorizeProjectAccess.middleware.js  (Agent 2 — RBAC hardened)
 *
 * Guards every project mutation route (PATCH, DELETE).
 *
 * Access is granted when the requesting user is:
 *   1. Platform admin (role === 'admin')          → full bypass
 *   2. Project owner  (project.owner === userId)  → ownership confirmed
 *   3. Accepted collaborator via invitation       → invitation-based access
 *      (an accepted Invitation exists where sharedProjects ∋ projectId
 *       AND recipientEmail === user.email)
 *
 * Security notes:
 *   - projectId is ALWAYS read from req.params (server-set). Never from body.
 *   - We never trust client-sent user IDs; we use req.user populated by `protect`.
 *   - The collaborator check uses countDocuments (no documents loaded into memory).
 *   - All three checks are O(log N) via compound indexes on Invitation collection.
 */

const ApiError    = require("../utils/apiErrors");
const Invitation  = require("../modules/auth/schemas/invitation.schema");
const { getOneProjectWithOwner } = require("../modules/auth/repositories/project.repository");

const authorizeProjectAccess = async (req, res, next) => {
  try {
    // ── 1. Platform admin fast-path ───────────────────────────────────────────
    if (req.user.role === "admin") {
      return next();
    }

    // ── 2. Resolve project ID from URL params (never from body) ───────────────
    const projectId = req.params.id || req.params.projectId;
    if (!projectId) {
      return next(new ApiError(400, "Project ID is required as a route parameter."));
    }

    // ── 3. Fetch minimal project document (owner field only) ──────────────────
    const project = await getOneProjectWithOwner(projectId);
    if (!project) {
      return next(new ApiError(404, "Project not found."));
    }

    // ── 4. Ownership check ────────────────────────────────────────────────────
    const isOwner = project.owner.toString() === req.user._id.toString();
    if (isOwner) {
      req.projectOwner = project.owner;
      return next();
    }

    // ── 5. Invitation-based collaborator check (Agent 2 addition) ─────────────
    //    Count accepted invitations where this user's email is the recipient
    //    AND the target projectId appears in sharedProjects.
    //    Uses the compound index: { recipientEmail, sharedProjects, status }
    const collaboratorCount = await Invitation.countDocuments({
      recipientEmail: req.user.email,
      sharedProjects: project._id,
      status:         "accepted",
    });

    if (collaboratorCount > 0) {
      req.isCollaborator = true;
      return next();
    }

    // ── 6. No valid access path — reject ──────────────────────────────────────
    return next(
      new ApiError(
        403,
        "Access denied. You must be the project owner or an accepted collaborator."
      )
    );
  } catch (error) {
    next(error);
  }
};

module.exports = authorizeProjectAccess;
