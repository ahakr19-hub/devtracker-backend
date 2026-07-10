/**
 * updateTask.js — Controller
 *
 * PATCH /dev/tasks/updatetask/:projectId/:taskId
 *
 * Middleware chain (defined in task.routes.js):
 *   protect → authorizeTaskAccess → [this controller]
 *
 * Responsibilities of THIS layer:
 *   1. Validate the incoming body with Joi (updateTaskSchema).
 *   2. Pass the pre-fetched task context (attached by authorizeTaskAccess)
 *      down to the service so no second DB lookup is needed for the access check.
 *   3. Return a clean, minimal JSON response.
 *
 * Field-level RBAC filtering (owner vs. assigned-developer) is enforced
 * inside updateTaskService — not here — to keep the controller thin.
 */

const ApiError = require("../../../../utils/apiErrors");
const { updateTaskSchema } = require("../../schemas/auth.schema");
const { updateTaskService } = require("../../services/task.service");

const updateTask = async (req, res, next) => {
  try {
    // ── 1. Input validation (Joi) ────────────────────────────────────────────
    const { error, value } = updateTaskSchema.validate(req.body, {
      abortEarly: false,    // surface every validation error in one response
      stripUnknown: true,   // drop unknown keys (secondary mass-assignment guard)
    });

    if (error) {
      const message = error.details.map((d) => d.message).join("; ");
      return next(new ApiError(400, message));
    }

    // ── 2. Extract context ───────────────────────────────────────────────────
    const requesterId = req.user._id;
    const isAdmin     = req.user.role === "admin";
    const { projectId, taskId } = req.params;

    // ── 3. Delegate to service ───────────────────────────────────────────────
    // The service re-evaluates the caller's role for field-level filtering.
    // (authorizeTaskAccess already gated yes/no; service handles field scope.)
    const updatedTask = await updateTaskService(
      requesterId,
      projectId,
      taskId,
      value,
      isAdmin
    );

    // ── 4. Respond ───────────────────────────────────────────────────────────
    res.status(200).json({
      status:  "success",
      message: "Task updated successfully",
      data:    updatedTask,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { updateTask };
