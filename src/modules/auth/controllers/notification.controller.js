/**
 * notification.controller.js
 *
 * Handles HTTP endpoints for the notifications resource:
 *
 *   GET  /api/notifications        — list user's notifications (newest first)
 *   PATCH /api/notifications/:id/read — mark one notification as read
 */

const ApiError  = require("../../../utils/apiErrors");
const {
  findByUserId,
  markOneAsRead,
} = require("../repositories/notification.repository");

// ── GET /api/notifications ─────────────────────────────────────────────────────

const getNotifications = async (req, res, next) => {
  try {
    const userId        = req.user._id;
    const notifications = await findByUserId(userId);

    res.status(200).json({
      status: "success",
      results: notifications.length,
      data: notifications,
    });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/notifications/:id/read ─────────────────────────────────────────

const markNotificationRead = async (req, res, next) => {
  try {
    const { id }    = req.params;
    const userId    = req.user._id;

    const updated = await markOneAsRead(id, userId);

    if (!updated) {
      // Either doesn't exist or belongs to a different user
      return next(new ApiError(404, "Notification not found"));
    }

    res.status(200).json({
      status: "success",
      data:   updated,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getNotifications,
  markNotificationRead,
};
