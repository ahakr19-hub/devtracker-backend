/**
 * notification.repository.js
 *
 * Thin data-access layer for the Notification collection.
 * Controllers and services MUST use these functions — never
 * import the model directly outside this file.
 */

const Notification = require("../schemas/notification.schema");

// ── Create ─────────────────────────────────────────────────────────────────────

/**
 * Persist a new notification document.
 * @param {{ userId, title, message, type, metadata? }} data
 * @returns {Promise<Document>} the saved Mongoose document
 */
const createNotification = async (data) => {
  return Notification.create(data);
};

// ── Read ───────────────────────────────────────────────────────────────────────

/**
 * Fetch all notifications for a user, newest first, capped at 100.
 * @param {string|ObjectId} userId
 * @returns {Promise<Document[]>}
 */
const findByUserId = async (userId) => {
  return Notification.find({ userId })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean(); // plain JS objects — faster, no Mongoose overhead for reads
};

// ── Update ─────────────────────────────────────────────────────────────────────

/**
 * Mark a single notification as read.
 * The userId scope prevents cross-user mutation.
 * @param {string} id         notification _id
 * @param {string} userId     requesting user's _id (ownership guard)
 * @returns {Promise<Document|null>}
 */
const markOneAsRead = async (id, userId) => {
  return Notification.findOneAndUpdate(
    { _id: id, userId },
    { $set: { isRead: true } },
    { new: true }
  ).lean();
};

/**
 * Mark ALL unread notifications for a user as read in one query.
 * @param {string} userId
 * @returns {Promise<import('mongoose').UpdateWriteOpResult>}
 */
const markAllAsRead = async (userId) => {
  return Notification.updateMany(
    { userId, isRead: false },
    { $set: { isRead: true } }
  );
};

/**
 * Clear all notifications for a user.
 * @param {string} userId
 * @returns {Promise<import('mongoose').DeleteResult>}
 */
const clearAllNotifications = async (userId) => {
  return Notification.deleteMany({ userId });
};

module.exports = {
  createNotification,
  findByUserId,
  markOneAsRead,
  markAllAsRead,
  clearAllNotifications,
};
