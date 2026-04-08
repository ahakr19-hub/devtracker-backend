const mongoose = require("mongoose");
const Feedback = require("../schemas/feedback.schema");
const ApiError = require("../../../utils/apiErrors");

// ─── Private Fields (never expose to public views) ───────────────────────────
const PRIVATE_FIELDS = "-adminNote -status -resolvedAt";
const PUBLIC_FIELDS = "type subject message rating createdAt";
const ADMIN_FIELDS = "-__v"; // Admin sees everything except internal version key

// ─── Helpers ─────────────────────────────────────────────────────────────────
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// ─── Create ───────────────────────────────────────────────────────────────────
const createFeedback = async ({ developer, type, subject, message, rating }) => {
    return await Feedback.create({ developer, type, subject, message, rating });
};

// ─── Read (Auth / Owner) ──────────────────────────────────────────────────────
/**
 * Get all feedbacks for a developer.
 * - Admin: full fields, no limit
 * - Owner: own fields minus adminNote, sorted by latest
 * - Public strangers: limited public fields, capped at 4
 */
const getAllFeedbacks = async (developerId) => {
    return await Feedback.find({ developer: developerId })
        .select(ADMIN_FIELDS)
        .sort({ createdAt: -1 });
};

const getOneFeedback = async (feedbackId) => {
    if (!isValidObjectId(feedbackId)) {
        throw new ApiError(400, "Invalid Feedback ID format");
    }
    return await Feedback.findById(feedbackId).select(ADMIN_FIELDS);
};

// ─── Read (Public ─ Scoped) ───────────────────────────────────────────────────
/**
 * Fetches feedbacks for a specific developer.
 * `isPublic=true` strips PII-adjacent fields and enforces limit.
 */
const getFeedbacksByDeveloper = async (developerId, limit = null, isPublic = false) => {
    let query = Feedback.find({ developer: developerId }).sort({ createdAt: -1 });

    if (isPublic) {
        // Strip sensitive fields: status, adminNote, resolvedAt, developer ref
        query = query.select(PUBLIC_FIELDS);
    } else {
        query = query.select(ADMIN_FIELDS);
    }

    if (limit) {
        query = query.limit(limit);
    }

    return await query;
};

// ─── Update / Delete ──────────────────────────────────────────────────────────
const updateFeedback = async (feedbackId, updateObj) => {
    if (!isValidObjectId(feedbackId)) {
        throw new ApiError(400, "Invalid Feedback ID format");
    }
    return await Feedback.findByIdAndUpdate(feedbackId, updateObj, {
        new: true,
        runValidators: true,
    }).select(ADMIN_FIELDS);
};

const deleteOneFeedback = async (feedbackId) => {
    if (!isValidObjectId(feedbackId)) {
        throw new ApiError(400, "Invalid Feedback ID format");
    }
    return await Feedback.findByIdAndDelete(feedbackId);
};

// ─── Admin Analytics (Count) ──────────────────────────────────────────────────
const countAllFeedbacks = async () => Feedback.countDocuments();
const countAllFeedbacksByType   = async (type)   => Feedback.countDocuments({ type });
const countAllFeedbacksByStatus = async (status) => Feedback.countDocuments({ status });
const countAllFeedbacksByRating = async (rating) => Feedback.countDocuments({ rating });

// ─── Filtered Queries (Admin — All) ──────────────────────────────────────────
const getFeedbacksByStatus = async (status) => {
    return await Feedback.find({ status })
        .select(ADMIN_FIELDS)
        .sort({ createdAt: -1 });
};

const getFeedbacksByType = async (type) => {
    return await Feedback.find({ type })
        .select(ADMIN_FIELDS)
        .sort({ createdAt: -1 });
};

const getFeedbacksByRating = async (rating) => {
    return await Feedback.find({ rating })
        .select(ADMIN_FIELDS)
        .sort({ createdAt: -1 });
};

// ─── Filtered Queries (User — Scoped to their own) ───────────────────────────
const getFeedbacksByStatusAndDeveloper = async (status, developerId) => {
    return await Feedback.find({ status, developer: developerId })
        .select(PRIVATE_FIELDS)
        .sort({ createdAt: -1 });
};

const getFeedbacksByRatingAndDeveloper = async (rating, developerId) => {
    return await Feedback.find({ rating, developer: developerId })
        .select(PRIVATE_FIELDS)
        .sort({ createdAt: -1 });
};

const getFeedbacksByTypeAndDeveloper = async (type, developerId) => {
    return await Feedback.find({ type, developer: developerId })
        .select(PRIVATE_FIELDS)
        .sort({ createdAt: -1 });
};

module.exports = {
    createFeedback,
    getAllFeedbacks,
    getOneFeedback,
    updateFeedback,
    deleteOneFeedback,
    countAllFeedbacks,
    countAllFeedbacksByType,
    countAllFeedbacksByStatus,
    countAllFeedbacksByRating,
    getFeedbacksByDeveloper,
    getFeedbacksByStatus,
    getFeedbacksByType,
    getFeedbacksByRating,
    getFeedbacksByStatusAndDeveloper,
    getFeedbacksByRatingAndDeveloper,
    getFeedbacksByTypeAndDeveloper,
};