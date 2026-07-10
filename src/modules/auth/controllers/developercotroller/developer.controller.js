const ApiError = require("../../../../utils/apiErrors");
const { changeDeveloperName } = require("../../repositories/developer.repository");
const {
  changUser, changPass, mailSchema, changePassSchema,
  updateSettingsSchema, deleteAccountSchema,
} = require("../../schemas/auth.schema");
const { forgotPasswordDev, changeDeveloperPassword } = require("../../services/auth.service");
const { changeUserName, getProfile, updateSettings, deleteAccount } = require("../../services/developer.service");

// ── Existing: Change Username ─────────────────────────────────────────────────
const updateUserName = async (req, res, next) => {
  try {
    const { error } = changUser.validate(req.body);
    if (error) return next(new ApiError(400, error.details[0].message));
    const developerId = req.user._id;
    const { name } = req.body;
    const changedUser = await changeUserName(developerId, name);
    res.status(200).json({
      message: 'name updated successfully',
      developer: {
        id: changedUser._id,
        name: changedUser.name,
        email: changedUser.email,
        role: changedUser.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ── Existing: Forgot Password ─────────────────────────────────────────────────
const otpToChangePassword = async (req, res, next) => {
  try {
    const { error } = mailSchema.validate(req.body);
    if (error) return next(new ApiError(400, error.details[0].message));
    const { email } = req.body;
    const { message } = await forgotPasswordDev(email);
    res.status(200).json({ message });
  } catch (error) {
    next(error);
  }
};

// ── Existing: Change Password ─────────────────────────────────────────────────
const changePassword = async (req, res, next) => {
  try {
    const { error } = changePassSchema.validate(req.body);
    if (error) return next(new ApiError(400, error.details[0].message));
    const { email, otp, newPassword } = req.body;
    const message = await changeDeveloperPassword(email, otp, newPassword);
    res.status(200).json({ message });
  } catch (error) {
    next(error);
  }
};

// ── NEW: Get Profile ──────────────────────────────────────────────────────────
// GET /developerSettings/profile
// Returns the authenticated user's profile without sensitive fields.
const getProfileController = async (req, res, next) => {
  try {
    const developerId = req.user._id;
    const profile = await getProfile(developerId);
    res.status(200).json({
      status: 'success',
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};

// ── NEW: Update Settings ──────────────────────────────────────────────────────
// PUT /developerSettings/settings
// Updates profile name, notification preferences, and UI preferences.
const updateSettingsController = async (req, res, next) => {
  try {
    const { error, value } = updateSettingsSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      const message = error.details.map(d => d.message).join('; ');
      return next(new ApiError(400, message));
    }

    const developerId = req.user._id;
    const updatedDev = await updateSettings(developerId, value);

    res.status(200).json({
      status: 'success',
      message: 'Settings updated successfully',
      data: updatedDev,
    });
  } catch (error) {
    next(error);
  }
};

// ── NEW: Delete Account ───────────────────────────────────────────────────────
// DELETE /developerSettings/account
// Requires password re-confirmation. Cascade-deletes all user data.
// Clears the HttpOnly cookie server-side to immediately invalidate the session.
const deleteAccountController = async (req, res, next) => {
  try {
    const { error } = deleteAccountSchema.validate(req.body);
    if (error) return next(new ApiError(400, error.details[0].message));

    const developerId = req.user._id;
    const { password } = req.body;

    const result = await deleteAccount(developerId, password);

    // Clear the HttpOnly JWT cookie — the session is now dead server-side too
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
    });

    res.status(200).json({
      status: 'success',
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  updateUserName,
  otpToChangePassword,
  changePassword,
  getProfileController,
  updateSettingsController,
  deleteAccountController,
};

