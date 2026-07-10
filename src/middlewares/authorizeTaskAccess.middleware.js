/**
 * authorizeTaskAccess.middleware.js
 *
 * Guards the PATCH /updatetask/:projectId/:taskId route.
 *
 * Who is allowed through?
 *   1. Platform admin                                    — full bypass
 *   2. Project owner  (project.owner === req.user._id)   — full access
 *   3. Team member with `canManageTasks` permission       — full access
 *   4. The developer the task is assigned to             — limited access
 *      (field restriction is enforced in the service layer)
 *
 * Security notes:
 *   - Must run AFTER `protect`.
 *   - taskId and projectId are always read from req.params.
 *   - We populate only `project.owner` and `task.assignedTo` to minimise
 *     the DB payload for a pure authorization check.
 *   - The middleware does NOT perform field-level filtering itself; it only
 *     decides yes/no. The service layer (updateTaskService) handles which
 *     fields each role is allowed to mutate.
 */

const ApiError = require("../utils/apiErrors");
const { findTaskWithProject } = require("../modules/auth/repositories/task.repository");

const authorizeTaskAccess = async (req, res, next) => {
  try {
    // ── 1. Platform admins bypass all ownership checks ──────────────────────
    if (req.user.role === "admin") {
      return next();
    }

    const { projectId, taskId } = req.params;
    if (!projectId || !taskId) {
      return next(new ApiError(400, "Both projectId and taskId are required as route parameters."));
    }

    // ── 2. Fetch task with only the fields we need for the access check ──────
    const task = await findTaskWithProject(taskId);
    if (!task) {
      return next(new ApiError(404, "Task not found."));
    }

    // Guard: ensure this task actually belongs to the stated project
    if (String(task.project._id) !== String(projectId)) {
      return next(new ApiError(400, "Task does not belong to the specified project."));
    }

    const callerId       = req.user._id.toString();
    const projectOwnerId = task.project.owner.toString();

    // ── 3. Project owner → allowed ───────────────────────────────────────────
    if (callerId === projectOwnerId) {
      req.taskContext = { task, isFullAccess: true };
      return next();
    }

    // ── 4. Team member with canManageTasks → allowed ─────────────────────────
    const teamCtx = req.user.teams?.find(
      (t) => t.adminId.toString() === projectOwnerId
    );
    if (teamCtx?.permissions?.canManageTasks) {
      req.taskContext = { task, isFullAccess: true };
      return next();
    }

    // ── 5. Assigned developer → allowed (limited field scope in service) ──────
    const isAssignedDev =
      task.assignedTo && task.assignedTo.toString() === callerId;

    if (isAssignedDev) {
      req.taskContext = { task, isFullAccess: false };
      return next();
    }

    // ── 6. None of the above → deny ──────────────────────────────────────────
    return next(
      new ApiError(403, "Access denied. You do not have permission to update this task.")
    );
  } catch (error) {
    next(error);
  }
};

module.exports = authorizeTaskAccess;
