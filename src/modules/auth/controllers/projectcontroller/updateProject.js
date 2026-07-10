/**
 * updateProject.js — Controller
 *
 * PATCH /dev/projectdev/updateproject/:id
 *
 * Middleware chain (defined in project.routes.js):
 *   protect → authorizeProjectAccess → [this controller]
 *
 * Responsibilities of THIS layer:
 *   1. Validate the incoming body with Joi (schema is already defined in auth.schema.js).
 *   2. Delegate the business logic (whitelist, DB update) to the service.
 *   3. Return a clean, minimal JSON response.
 *
 * Everything else (auth, ownership, field-level sanitization) is handled
 * upstream by the middleware or downstream by the service.
 */

const ApiError = require("../../../../utils/apiErrors");
const { updateProjectSchema } = require("../../schemas/auth.schema");
const { updateDevProject }    = require("../../services/project.service");

const updateProject = async (req, res, next) => {
  try {
    // ── 1. Input validation (Joi) ────────────────────────────────────────────
    // `updateProjectSchema` uses .min(1) so an empty body is rejected here.
    const { error, value } = updateProjectSchema.validate(req.body, {
      abortEarly: false,    // collect ALL validation errors, not just the first
      stripUnknown: true,   // silently drop any key not in the schema (extra safety)
    });

    if (error) {
      const message = error.details.map((d) => d.message).join("; ");
      return next(new ApiError(400, message));
    }

    // ── 2. Extract context set by protect + authorizeProjectAccess ────────────
    const requesterId = req.user._id;
    const isAdmin     = req.user.role === "admin";
    const projectId   = req.params.id;

    // ── 3. Delegate to service — business logic & DB interaction live there ──
    const updatedProject = await updateDevProject(requesterId, projectId, value, isAdmin);

    // ── 4. Respond with only the updated document fields ─────────────────────
    res.status(200).json({
      status:  "success",
      message: "Project updated successfully",
      data:    updatedProject,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { updateProject };
