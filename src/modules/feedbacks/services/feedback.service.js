const { findUserById } = require("../../auth/repositories/auth.repository");
const feedbackRepo = require("../repostiories/feedback.repostiories");
const ApiError = require("../../../utils/apiErrors");

// ─── Create ───────────────────────────────────────────────────────────────────
const createFeedback = async ({ type, subject, message, rating }, currentUser) => {
    // Any authenticated user can submit feedback for themselves
    return await feedbackRepo.createFeedback({
        developer: currentUser._id,
        type,
        subject,
        message,
        rating,
    });
};

// ─── Read (All) ───────────────────────────────────────────────────────────────
/**
 * Admin gets all feedbacks for any developer (full details).
 * Regular user can only get their own feedbacks (full details).
 * A stranger is directed via getFeedbacksByDeveloper (limited/public).
 */
const getAllFeedbacks = async (developerId, currentUser) => {
    // RBAC: only owner or admin may read the full list
    if (
        currentUser._id.toString() !== developerId &&
        currentUser.role !== "admin"
    ) {
        throw new ApiError(403, "Unauthorized access to these feedbacks");
    }

    // Verify the target developer actually exists (avoids empty 200 responses)
    const developerExists = await findUserById(developerId);
    if (!developerExists) {
        throw new ApiError(404, "Developer not found");
    }

    return await feedbackRepo.getAllFeedbacks(developerId);
};

// ─── Read (Single) ────────────────────────────────────────────────────────────
const getOneFeedback = async (feedbackId, currentUser) => {
    const feedback = await feedbackRepo.getOneFeedback(feedbackId);
    if (!feedback) {
        throw new ApiError(404, "Feedback not found");
    }

    // RBAC: only owner or admin may view the full record
    if (
        feedback.developer.toString() !== currentUser._id.toString() &&
        currentUser.role !== "admin"
    ) {
        throw new ApiError(403, "Access denied to this feedback");
    }

    return feedback;
};

// ─── Read (Public / Developer wall) ──────────────────────────────────────────
/**
 * - Owner / Admin : full details, no cap
 * - Anyone else   : public fields only, capped to 4 items
 */
const getFeedbacksByDeveloper = async (developerId, currentUser) => {
    // Verify the developer actually exists
    const developerExists = await findUserById(developerId);
    if (!developerExists) {
        throw new ApiError(404, "Developer not found");
    }

    const isOwnerOrAdmin =
        currentUser._id.toString() === developerId ||
        currentUser.role === "admin";

    if (isOwnerOrAdmin) {
        return await feedbackRepo.getFeedbacksByDeveloper(developerId);
    }

    // Public view: strip PII-adjacent fields, cap at 4
    return await feedbackRepo.getFeedbacksByDeveloper(developerId, 4, true);
};

// ─── Update ───────────────────────────────────────────────────────────────────
const updateFeedback = async (feedbackId, rawBody, currentUser) => {
    const feedback = await feedbackRepo.getOneFeedback(feedbackId);
    if (!feedback) {
        throw new ApiError(404, "Feedback not found");
    }

    // RBAC
    if (
        feedback.developer.toString() !== currentUser._id.toString() &&
        currentUser.role !== "admin"
    ) {
        throw new ApiError(403, "Unauthorized to update this feedback");
    }

    // ── Mass Assignment Protection ────────────────────────────────────────────
    // Users: may only change content fields
    // Admins: may additionally change status, adminNote, resolvedAt
    const userAllowedFields = ["type", "subject", "message", "rating"];
    const adminExtraFields  = ["status", "adminNote", "resolvedAt"];

    const allowedFields =
        currentUser.role === "admin"
            ? [...userAllowedFields, ...adminExtraFields]
            : userAllowedFields;

    const filteredUpdate = {};
    for (const key of allowedFields) {
        if (key in rawBody) {
            filteredUpdate[key] = rawBody[key];
        }
    }

    if (Object.keys(filteredUpdate).length === 0) {
        throw new ApiError(400, "No valid fields provided for update");
    }

    // Auto-set resolvedAt when admin marks a feedback as resolved
    if (filteredUpdate.status === "resolved" && !filteredUpdate.resolvedAt) {
        filteredUpdate.resolvedAt = new Date();
    }

    return await feedbackRepo.updateFeedback(feedbackId, filteredUpdate);
};

// ─── Delete ───────────────────────────────────────────────────────────────────
const deleteOneFeedback = async (feedbackId, currentUser) => {
    const feedback = await feedbackRepo.getOneFeedback(feedbackId);
    if (!feedback) {
        throw new ApiError(404, "Feedback not found");
    }

    if (
        feedback.developer.toString() !== currentUser._id.toString() &&
        currentUser.role !== "admin"
    ) {
        throw new ApiError(403, "Unauthorized to delete this feedback");
    }

    return await feedbackRepo.deleteOneFeedback(feedbackId);
};

// ─── Admin Analytics ──────────────────────────────────────────────────────────
const countAllFeedbacks = async (currentUser) => {
    if (currentUser.role !== "admin") {
        throw new ApiError(403, "Admin privileges required");
    }
    return await feedbackRepo.countAllFeedbacks();
};

const countAllFeedbacksByType = async (type, currentUser) => {
    if (currentUser.role !== "admin") {
        throw new ApiError(403, "Admin privileges required");
    }
    return await feedbackRepo.countAllFeedbacksByType(type);
};

const countAllFeedbacksByStatus = async (status, currentUser) => {
    if (currentUser.role !== "admin") {
        throw new ApiError(403, "Admin privileges required");
    }
    return await feedbackRepo.countAllFeedbacksByStatus(status);
};

const countAllFeedbacksByRating = async (rating, currentUser) => {
    if (currentUser.role !== "admin") {
        throw new ApiError(403, "Admin privileges required");
    }
    return await feedbackRepo.countAllFeedbacksByRating(rating);
};

// ─── Filtered Queries ─────────────────────────────────────────────────────────
const getFeedbacksByStatus = async (status, currentUser) => {
    if (currentUser.role === "admin") {
        return await feedbackRepo.getFeedbacksByStatus(status);
    }
    return await feedbackRepo.getFeedbacksByStatusAndDeveloper(status, currentUser._id);
};

const getFeedbacksByRating = async (rating, currentUser) => {
    if (currentUser.role === "admin") {
        return await feedbackRepo.getFeedbacksByRating(rating);
    }
    return await feedbackRepo.getFeedbacksByRatingAndDeveloper(rating, currentUser._id);
};

const getFeedbacksByType = async (type, currentUser) => {
    if (currentUser.role === "admin") {
        return await feedbackRepo.getFeedbacksByType(type);
    }
    return await feedbackRepo.getFeedbacksByTypeAndDeveloper(type, currentUser._id);
};

module.exports = {
    createFeedback,
    getAllFeedbacks,
    getOneFeedback,
    updateFeedback,
    deleteOneFeedback,
    getFeedbacksByDeveloper,
    countAllFeedbacks,
    countAllFeedbacksByType,
    countAllFeedbacksByStatus,
    countAllFeedbacksByRating,
    getFeedbacksByStatus,
    getFeedbacksByRating,
    getFeedbacksByType,
};