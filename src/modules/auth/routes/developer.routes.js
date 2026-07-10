const express = require('express');
const {
  updateUserName,
  otpToChangePassword,
  changePassword,
  getProfileController,
  updateSettingsController,
  deleteAccountController,
} = require('../controllers/developercotroller/developer.controller');
const { protect } = require('../../../middlewares/auth.middleware');

const developerRouter = express.Router();

// ── Existing routes ────────────────────────────────────────────────────────────
developerRouter.patch('/changeusername',   protect, updateUserName);
developerRouter.post('/forgotpassword',    otpToChangePassword);
developerRouter.post('/changepassword',    changePassword);

// ── New: Profile & Account Management ─────────────────────────────────────────
// Chain: protect (JWT) → controller
developerRouter.get('/profile',            protect, getProfileController);
developerRouter.put('/settings',           protect, updateSettingsController);
developerRouter.delete('/account',         protect, deleteAccountController);

module.exports = { developerRouter };

