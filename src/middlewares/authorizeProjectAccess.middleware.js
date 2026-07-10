/**
 * authorizeProjectAccess.middleware.js
 *
 * Guards the PATCH /updateproject/:id route.
 *
 * Who is allowed through?
 *   1. Platform admin  (req.user.role === 'admin')      — full bypass
 *   2. Project owner   (project.owner === req.user._id) — ownership verified
 *
 * Security notes:
 *   - Must be mounted AFTER `protect` so req.user is guaranteed to exist.
 *   - We deliberately fetch ONLY the `owner` field from the DB (via
 *     getOneProjectWithOwner) to avoid loading the full document just for
 *     an authorization check — keeps this middleware lightweight.
 *   - The projectId is always read from req.params (server-set), never
 *     from req.body, to prevent IDOR via body forgery.
 */

const ApiError = require("../utils/apiErrors");
const { getOneProjectWithOwner } = require("../modules/auth/repositories/project.repository");

const authorizeProjectAccess = async (req, res, next) => {
  try {
    // ── 1. Fast-path: platform admins bypass ownership checks ───────────────
    if (req.user.role === "admin") {
      return next();
    }

    // ── 2. Resolve the target project id from the URL (never from body) ─────
    const projectId = req.params.id || req.params.projectId;
    if (!projectId) {
      return next(new ApiError(400, "Project ID is required as a route parameter."));
    }

    // ── 3. Fetch the project's owner — minimal projection, no extra data ─────
    const project = await getOneProjectWithOwner(projectId);
    if (!project) {
      return next(new ApiError(404, "Project not found."));
    }

    // ── 4. Ownership check ───────────────────────────────────────────────────
    const isOwner = project.owner.toString() === req.user._id.toString();
    if (!isOwner) {
      return next(
        new ApiError(403, "Access denied. Only the project owner or an admin can perform this action.")
      );
    }

    // ── 5. Attach project context for downstream use (avoids a second fetch) ─
    req.projectOwner = project.owner;

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = authorizeProjectAccess;
