/**
 * notification.routes.js
 *
 * All routes are protected by the `protect` middleware (JWT from HttpOnly cookie).
 *
 *   GET  /api/notifications           — fetch all notifications for req.user
 *   PATCH /api/notifications/:id/read — mark one notification isRead=true
 */

const express = require("express");
const { protect } = require("../../../middlewares/auth.middleware");
const {
  getNotifications,
  markNotificationRead,
} = require("../controllers/notification.controller");

const notificationRouter = express.Router();

notificationRouter.get("/",              protect, getNotifications);
notificationRouter.patch("/:id/read",   protect, markNotificationRead);

module.exports = notificationRouter;
