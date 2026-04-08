const express = require("express");
const { protect, auth } = require("../../../middlewares/auth.middleware");
const {
    createFeedback,
    getMyFeedbacks,
    getAllFeedbacks,
    getOneFeedback,
    getFeedbacksByDeveloper,
    updateFeedback,
    deleteOneFeedback,
    getFeedbacksByStatus,
    getFeedbacksByType,
    getFeedbacksByRating,
    countAllFeedbacks,
    countAllFeedbacksByType,
    countAllFeedbacksByStatus,
    countAllFeedbacksByRating,
} = require("../controllers/feedback.controller");

const router = express.Router();

// All feedback routes require authentication
router.use(protect);

// ─── User Routes ──────────────────────────────────────────────────────────────

/**
 * POST /feedbacks
 * Submit a new feedback (any authenticated user)
 */
router.post("/", createFeedback);

/**
 * GET /feedbacks/me
 * Get the current user's own feedbacks (full details, no cap)
 * MUST be placed before /:id to avoid "me" being treated as a Mongo ObjectId
 */
router.get("/me", getMyFeedbacks);

/**
 * GET /feedbacks/developer/:id
 * Public-aware read:
 *   - Owner / Admin → full details
 *   - Other users   → public fields, max 4 items (no PII leakage)
 */
router.get("/developer/:id", getFeedbacksByDeveloper);

/**
 * GET /feedbacks/:id
 * Read a single feedback (owner or admin only)
 */
router.get("/:id", getOneFeedback);

/**
 * PATCH /feedbacks/:id
 * Update feedback:
 *   - User  → can change type, subject, message, rating
 *   - Admin → additionally can change status, adminNote, resolvedAt
 */
router.patch("/:id", updateFeedback);

/**
 * DELETE /feedbacks/:id
 * Delete a feedback (owner or admin only)
 */
router.delete("/:id", deleteOneFeedback);

// ─── Filter Routes (own scope for user, platform-wide for admin) ──────────────

/**
 * GET /feedbacks/filter/status/:status
 * Admin → all feedbacks with that status
 * User  → only their own feedbacks with that status
 */
router.get("/filter/status/:status", getFeedbacksByStatus);

/**
 * GET /feedbacks/filter/type/:type
 */
router.get("/filter/type/:type", getFeedbacksByType);

/**
 * GET /feedbacks/filter/rating/:rating
 */
router.get("/filter/rating/:rating", getFeedbacksByRating);

// ─── Admin Only Routes ────────────────────────────────────────────────────────

/**
 * GET /feedbacks/admin/developer/:id
 * Admin retrieval of feedbacks for any developer (explicit admin route)
 */
router.get("/admin/developer/:id", auth, getAllFeedbacks);

/**
 * GET /feedbacks/admin/count
 * Total feedback count (admin analytics)
 */
router.get("/admin/count", auth, countAllFeedbacks);

/**
 * GET /feedbacks/admin/count/type/:type
 */
router.get("/admin/count/type/:type", auth, countAllFeedbacksByType);

/**
 * GET /feedbacks/admin/count/status/:status
 */
router.get("/admin/count/status/:status", auth, countAllFeedbacksByStatus);

/**
 * GET /feedbacks/admin/count/rating/:rating
 */
router.get("/admin/count/rating/:rating", auth, countAllFeedbacksByRating);

module.exports = router;
