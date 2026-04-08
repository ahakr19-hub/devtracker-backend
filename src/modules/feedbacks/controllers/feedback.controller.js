const feedbackService = require("../services/feedback.service");
const {
    createFeedbackSchema,
    updateFeedbackSchema,
    adminUpdateFeedbackSchema,
    mongoIdParamSchema,
    filterByStatusSchema,
    filterByTypeSchema,
    filterByRatingSchema,
} = require("../schemas/feedback.validators");
const ApiError = require("../../../utils/apiErrors");

// ─── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Validates a Joi schema and throws a 400 ApiError if validation fails.
 * This centralises validation so controllers stay thin.
 */
const validate = (schema, data) => {
    const { error, value } = schema.validate(data, { abortEarly: false, stripUnknown: true });
    if (error) {
        const messages = error.details.map((d) => d.message).join(", ");
        throw new ApiError(400, messages);
    }
    return value; // return sanitised/coerced value
};

// ─── POST /feedbacks ──────────────────────────────────────────────────────────
exports.createFeedback = async (req, res, next) => {
    try {
        // Validate & strip unknown fields (Mass Assignment Protection layer 1)
        const validatedBody = validate(createFeedbackSchema, req.body);

        const feedback = await feedbackService.createFeedback(validatedBody, req.user);

        return res.status(201).json({
            status: "success",
            message: "Feedback submitted successfully",
            data: { feedback },
        });
    } catch (err) {
        next(err);
    }
};

// ─── GET /feedbacks/developer/:id ─────────────────────────────────────────────
/**
 * Public-aware: owner/admin get full list; others get 4 sanitised items.
 */
exports.getFeedbacksByDeveloper = async (req, res, next) => {
    try {
        const { id: developerId } = validate(mongoIdParamSchema, req.params);

        const feedbacks = await feedbackService.getFeedbacksByDeveloper(developerId, req.user);

        return res.status(200).json({
            status: "success",
            results: feedbacks.length,
            data: { feedbacks },
        });
    } catch (err) {
        next(err);
    }
};

// ─── GET /feedbacks/:id ───────────────────────────────────────────────────────
exports.getOneFeedback = async (req, res, next) => {
    try {
        const { id: feedbackId } = validate(mongoIdParamSchema, req.params);

        const feedback = await feedbackService.getOneFeedback(feedbackId, req.user);

        return res.status(200).json({
            status: "success",
            data: { feedback },
        });
    } catch (err) {
        next(err);
    }
};

// ─── GET /feedbacks/me ────────────────────────────────────────────────────────
/**
 * Convenience: authenticated user fetches their own feedbacks directly.
 * No params needed — identity is taken from the JWT.
 */
exports.getMyFeedbacks = async (req, res, next) => {
    try {
        const feedbacks = await feedbackService.getAllFeedbacks(
            req.user._id.toString(),
            req.user
        );

        return res.status(200).json({
            status: "success",
            results: feedbacks.length,
            data: { feedbacks },
        });
    } catch (err) {
        next(err);
    }
};

// ─── GET /feedbacks (Admin only) ─────────────────────────────────────────────
/**
 * Admin sees all feedbacks for any developer. Regular users redirected to /me.
 */
exports.getAllFeedbacks = async (req, res, next) => {
    try {
        const { id: developerId } = validate(mongoIdParamSchema, req.params);

        const feedbacks = await feedbackService.getAllFeedbacks(developerId, req.user);

        return res.status(200).json({
            status: "success",
            results: feedbacks.length,
            data: { feedbacks },
        });
    } catch (err) {
        next(err);
    }
};

// ─── PATCH /feedbacks/:id ─────────────────────────────────────────────────────
exports.updateFeedback = async (req, res, next) => {
    try {
        const { id: feedbackId } = validate(mongoIdParamSchema, req.params);

        // Admins can update status/adminNote; users can only update content
        const schema =
            req.user.role === "admin" ? adminUpdateFeedbackSchema : updateFeedbackSchema;

        // validate() calls stripUnknown: true — this is Mass Assignment Protection layer 2
        const validatedBody = validate(schema, req.body);

        const updated = await feedbackService.updateFeedback(feedbackId, validatedBody, req.user);

        return res.status(200).json({
            status: "success",
            message: "Feedback updated successfully",
            data: { feedback: updated },
        });
    } catch (err) {
        next(err);
    }
};

// ─── DELETE /feedbacks/:id ────────────────────────────────────────────────────
exports.deleteOneFeedback = async (req, res, next) => {
    try {
        const { id: feedbackId } = validate(mongoIdParamSchema, req.params);

        await feedbackService.deleteOneFeedback(feedbackId, req.user);

        return res.status(200).json({
            status: "success",
            message: "Feedback deleted successfully",
            data: null,
        });
    } catch (err) {
        next(err);
    }
};

// ─── GET /feedbacks/filter/status/:status ─────────────────────────────────────
exports.getFeedbacksByStatus = async (req, res, next) => {
    try {
        const { status } = validate(filterByStatusSchema, req.params);

        const feedbacks = await feedbackService.getFeedbacksByStatus(status, req.user);

        return res.status(200).json({
            status: "success",
            results: feedbacks.length,
            data: { feedbacks },
        });
    } catch (err) {
        next(err);
    }
};

// ─── GET /feedbacks/filter/type/:type ─────────────────────────────────────────
exports.getFeedbacksByType = async (req, res, next) => {
    try {
        const { type } = validate(filterByTypeSchema, req.params);

        const feedbacks = await feedbackService.getFeedbacksByType(type, req.user);

        return res.status(200).json({
            status: "success",
            results: feedbacks.length,
            data: { feedbacks },
        });
    } catch (err) {
        next(err);
    }
};

// ─── GET /feedbacks/filter/rating/:rating ─────────────────────────────────────
exports.getFeedbacksByRating = async (req, res, next) => {
    try {
        const { rating } = validate(filterByRatingSchema, req.params);

        const feedbacks = await feedbackService.getFeedbacksByRating(rating, req.user);

        return res.status(200).json({
            status: "success",
            results: feedbacks.length,
            data: { feedbacks },
        });
    } catch (err) {
        next(err);
    }
};

// ─── Admin Analytics ──────────────────────────────────────────────────────────
exports.countAllFeedbacks = async (req, res, next) => {
    try {
        const count = await feedbackService.countAllFeedbacks(req.user);

        return res.status(200).json({
            status: "success",
            data: { count },
        });
    } catch (err) {
        next(err);
    }
};

exports.countAllFeedbacksByType = async (req, res, next) => {
    try {
        const { type } = validate(filterByTypeSchema, req.params);
        const count = await feedbackService.countAllFeedbacksByType(type, req.user);

        return res.status(200).json({
            status: "success",
            data: { type, count },
        });
    } catch (err) {
        next(err);
    }
};

exports.countAllFeedbacksByStatus = async (req, res, next) => {
    try {
        const { status } = validate(filterByStatusSchema, req.params);
        const count = await feedbackService.countAllFeedbacksByStatus(status, req.user);

        return res.status(200).json({
            status: "success",
            data: { status, count },
        });
    } catch (err) {
        next(err);
    }
};

exports.countAllFeedbacksByRating = async (req, res, next) => {
    try {
        const { rating } = validate(filterByRatingSchema, req.params);
        const count = await feedbackService.countAllFeedbacksByRating(rating, req.user);

        return res.status(200).json({
            status: "success",
            data: { rating, count },
        });
    } catch (err) {
        next(err);
    }
};
