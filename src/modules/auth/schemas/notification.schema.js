/**
 * notification.schema.js
 *
 * Persists every notification delivered to a user.
 * The backend saves here FIRST, then emits `notification:received`
 * via Socket.io so the client always receives a document with a real _id.
 *
 * Types:
 *   TASK_ASSIGNMENT — task was assigned to this user
 *   SYSTEM          — team events: invitation, removal, access revocation
 *   PERMISSIONS     — a team admin changed this user's permissions
 */

const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Developer",
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      enum: ["TASK_ASSIGNMENT", "SYSTEM", "PERMISSIONS"],
      required: true,
    },

    isRead: {
      type: Boolean,
      default: false,
    },

    /**
     * Free-form extras keyed by event type:
     *   TASK_ASSIGNMENT → { taskId, taskTitle, assignedByName, assignedToUserId }
     *   SYSTEM          → { subtype, revokedProjectIds, adminName }
     *   PERMISSIONS     → { permissionKey, newValue, adminId }
     */
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,   // createdAt, updatedAt
    versionKey: false,
  }
);

// ── Compound index for the primary read query ──────────────────────────────────
// GET /api/notifications → find({ userId }) sorted by createdAt DESC
notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
