/**
 * notification.service.js
 *
 * Business logic for all notification events.
 *
 * Flow for every event:
 *   1. Build the notification payload.
 *   2. Persist to MongoDB via the repository.
 *   3. Emit `notification:received` to the target user's Socket.io room
 *      with the saved DB document (including _id and createdAt).
 *
 * The frontend BehaviorSubject cache is updated from the socket payload,
 * giving real-time delivery when the user is online and DB persistence
 * for when they reconnect / refresh.
 */

const { createNotification } = require("../repositories/notification.repository");

// ── Core helper ───────────────────────────────────────────────────────────────

/**
 * Save a notification then emit it via Socket.io.
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {{ title: string, message: string, type: 'TASK_ASSIGNMENT'|'SYSTEM'|'PERMISSIONS', metadata?: object }} payload
 * @returns {Promise<import('mongoose').Document>} the saved document
 */
const createAndEmit = async (userId, payload) => {
  // 1. Persist first — even if the socket fails, the notification is safe.
  const saved = await createNotification({
    userId,
    title:    payload.title,
    message:  payload.message,
    type:     payload.type,
    metadata: payload.metadata || {},
  });

  // 2. Emit the full DB object to the user's room.
  //    The socket payload is the plain object (via .toObject()); _id is guaranteed.
  if (global.io) {
    global.io.to(userId.toString()).emit("notification:received", {
      ...saved.toObject(),
      _id: saved._id.toString(),
      userId: saved.userId.toString(),
    });
  }

  return saved;
};

// ── Event-specific helpers ────────────────────────────────────────────────────

/**
 * Notify a developer that a task was assigned to them.
 */
const notifyTaskAssigned = async ({ taskId, taskTitle, assignedToUserId, assignedByName }) => {
  return createAndEmit(assignedToUserId, {
    type:    "TASK_ASSIGNMENT",
    title:   "Task Assigned",
    message: `You were assigned "${taskTitle}" by ${assignedByName || "Admin"}`,
    metadata: {
      taskId,
      taskTitle,
      assignedByName: assignedByName || "Admin",
      assignedToUserId: assignedToUserId.toString(),
    },
  });
};

/**
 * Send a SYSTEM-type notification (invitation, removal, access revocation, etc.).
 * @param {{ userId, title, message, subtype?, metadata? }} param
 */
const notifySystemEvent = async ({ userId, title, message, subtype = "", metadata = {} }) => {
  return createAndEmit(userId, {
    type:    "SYSTEM",
    title,
    message,
    metadata: { subtype, ...metadata },
  });
};

/**
 * Notify a developer that their permissions were changed by an admin.
 */
const notifyPermissionsUpdate = async ({ userId, permissionKey, newValue, adminName }) => {
  return createAndEmit(userId, {
    type:    "PERMISSIONS",
    title:   "Permissions Updated",
    message: `Your permission '${permissionKey}' has been updated to ${newValue} by ${adminName || "Admin"}.`,
    metadata: { permissionKey, newValue, adminName },
  });
};

module.exports = {
  createAndEmit,
  notifyTaskAssigned,
  notifySystemEvent,
  notifyPermissionsUpdate,
};
