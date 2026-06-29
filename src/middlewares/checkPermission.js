/**
 * checkPermission.js
 *
 * Authorization middleware factory.
 *
 * SECURITY FIX: adminId is now sourced EXCLUSIVELY from req.params (set by
 * the server's router, not controllable by the client). Previously reading it
 * from req.body allowed any authenticated developer to forge an adminId and
 * gain access to a team they don't belong to (IDOR vulnerability).
 *
 * Usage:
 *   router.delete('/:adminId/resource', protect, checkPermission('canDeleteProjects'), handler);
 */
const ApiError = require("../utils/apiErrors");

const checkPermission = (permissionKey) => {
  return async (req, res, next) => {
    try {
      const user = req.user;

      // ── Source adminId from the URL only — never from req.body ──────────
      // Route params are defined by the server (e.g., router.get('/:adminId/...'))
      // and cannot be spoofed by the client the same way a JSON body can.
      const adminId = req.params.adminId;

      if (!adminId) {
        return next(
          new ApiError(400, "Admin ID is required as a route parameter")
        );
      }

      // ── Allow admins to pass through without a team membership check ─────
      // Admins own teams, they don't appear in their own teams array.
      if (req.user.role === "admin") {
        return next();
      }

      // ── Find this user's membership record for the target team ───────────
      const team = user.teams?.find(
        (t) => t.adminId.toString() === adminId.toString()
      );

      if (!team) {
        return next(
          new ApiError(403, "Access denied. You are not a member of this team.")
        );
      }

      // ── Verify the specific permission flag is granted ───────────────────
      if (!team.permissions?.[permissionKey]) {
        return next(
          new ApiError(
            403,
            `Permission denied: You cannot perform this action (${permissionKey})`
          )
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = checkPermission;