const Joi = require("joi");

// ─── Reusable field definitions ───────────────────────────────────────────────
const feedbackTypeEnum = ["bug", "feature_request", "general", "improvement"];
const feedbackStatusEnum = ["pending", "under_review", "resolved", "closed"];
const ratingRule = Joi.number().integer().min(1).max(5);

// ─── Create Feedback ──────────────────────────────────────────────────────────
const createFeedbackSchema = Joi.object({
    type: Joi.string()
        .valid(...feedbackTypeEnum)
        .lowercase()
        .default("general"),

    subject: Joi.string().trim().min(3).max(120).required().messages({
        "string.min": "Subject must be at least 3 characters",
        "string.max": "Subject cannot exceed 120 characters",
        "any.required": "Subject is required",
    }),

    message: Joi.string().trim().min(10).max(2000).required().messages({
        "string.min": "Message must be at least 10 characters",
        "string.max": "Message cannot exceed 2000 characters",
        "any.required": "Message is required",
    }),

    rating: ratingRule.required().messages({
        "number.min": "Rating must be at least 1",
        "number.max": "Rating cannot exceed 5",
        "any.required": "Rating is required",
    }),
});

// ─── Update Feedback (User) ───────────────────────────────────────────────────
const updateFeedbackSchema = Joi.object({
    type: Joi.string().valid(...feedbackTypeEnum).lowercase(),
    subject: Joi.string().trim().min(3).max(120),
    message: Joi.string().trim().min(10).max(2000),
    rating: ratingRule,
})
    .min(1) // at least one field must be provided
    .messages({ "object.min": "At least one field must be provided for update" });

// ─── Admin Update (extends user fields + admin-only fields) ──────────────────
const adminUpdateFeedbackSchema = Joi.object({
    type: Joi.string().valid(...feedbackTypeEnum).lowercase(),
    subject: Joi.string().trim().min(3).max(120),
    message: Joi.string().trim().min(10).max(2000),
    rating: ratingRule,
    status: Joi.string().valid(...feedbackStatusEnum).lowercase(),
    adminNote: Joi.string().trim().max(1000).allow("", null),
    resolvedAt: Joi.date().iso(),
})
    .min(1)
    .messages({ "object.min": "At least one field must be provided for update" });

// ─── Param Validators ─────────────────────────────────────────────────────────
const mongoIdParamSchema = Joi.object({
    id: Joi.string()
        .pattern(/^[a-f\d]{24}$/i)
        .required()
        .messages({
            "string.pattern.base": "Invalid ID format",
            "any.required": "ID parameter is required",
        }),
});

// ─── Query Filters ────────────────────────────────────────────────────────────
const filterByStatusSchema = Joi.object({
    status: Joi.string().valid(...feedbackStatusEnum).lowercase().required(),
});

const filterByTypeSchema = Joi.object({
    type: Joi.string().valid(...feedbackTypeEnum).lowercase().required(),
});

const filterByRatingSchema = Joi.object({
    rating: ratingRule.required(),
});

module.exports = {
    createFeedbackSchema,
    updateFeedbackSchema,
    adminUpdateFeedbackSchema,
    mongoIdParamSchema,
    filterByStatusSchema,
    filterByTypeSchema,
    filterByRatingSchema,
};
