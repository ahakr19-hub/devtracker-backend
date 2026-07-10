const joi = require("joi");
const registerSchema = joi.object({
  name: joi.string().min(3).max(50).required(),
  email: joi.string().email().required(),
  password: joi.string().min(8).required(),
});

const otpSchema = joi.object({
  // Must be a string — validating as number coerces "012345" → 12345,
  // meaning two different OTP strings can pass as equal (leading-zero bypass).
  // Exact 6-digit string pattern is the safe, unambiguous format.
  otp: joi.string().length(6).pattern(/^\d{6}$/).required(),
  email: joi.string().email().required(),
});

const loginSchema = joi.object({
  email: joi.string().email().required(),
  password: joi.string().min(8).required(),
});

const createProjectSchema = joi.object({
  name: joi.string().min(3).max(255).required(),
  clientName: joi.string().min(2).max(255).required(),
  hourlyRate: joi.number().min(0).required(),
  description: joi.string().allow("", null),
});

const updateProjectSchema = joi.object({
  name: joi.string().min(3).max(255),
  clientName: joi.string().min(2).max(255),
  hourlyRate: joi.number().min(0),
  description: joi.string().allow("", null),
  status: joi.string().valid("active", "paused", "completed"),
});

const createTaskSchema = joi.object({
  title: joi.string().min(3).max(255).required(),
  estimatedHours: joi.number().min(0).optional(),
  deadline: joi.date().greater("now"),
});

// ── Task Update — split by role in the controller, validated together here ──
// Owner/Admin fields: title, estimatedHours, deadline, assignedTo
// Assigned-developer fields: status, progress
const updateTaskSchema = joi.object({
  title: joi.string().min(3).max(255),
  estimatedHours: joi.number().min(0),
  deadline: joi.date(),
  assignedTo: joi
    .string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .message('"assignedTo" must be a valid MongoDB ObjectId'),
  status: joi.string().valid("todo", "in-progress", "done"),
  progress: joi.number().min(0).max(100),
}).min(1).messages({
  'object.min': 'Request body must contain at least one field to update.',
});

const changUser = joi.object({
  name: joi.string().min(3).max(30).required(),
});

const changPass = joi.object({
  password: joi.string().min(8).required(),
});

// ── Settings / Account ───────────────────────────────────────────────────────
// updateSettingsSchema: all fields optional but at least one must be sent.
const updateSettingsSchema = joi.object({
  name: joi.string().min(3).max(50).trim(),
  // Future preference fields can be added here (theme, notifications, etc.)
  notifications: joi.object({
    emailOnTaskComplete: joi.boolean(),
    emailOnProjectUpdate: joi.boolean(),
  }),
  preferences: joi.object({
    theme: joi.string().valid('dark', 'light', 'system'),
    language: joi.string().valid('en', 'ar'),
  }),
}).min(1).messages({
  'object.min': 'Request body must contain at least one field to update.',
});

// deleteAccountSchema: requires the user to re-enter their current password.
const deleteAccountSchema = joi.object({
  password: joi.string().min(8).required().messages({
    'string.min': 'Password must be at least 8 characters.',
    'any.required': 'Password confirmation is required to delete your account.',
  }),
});

const mailSchema = joi.object({
  email: joi.string().email().required(),
});

const changePassSchema = joi.object({
  email: joi.string().email().required(),
  otp: joi.string().min(3).max(50).required(),

  newPassword: joi.string().min(8).required(),
});
const createFeedbackSchema = joi.object({
  developerId: joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
  type: joi.string().valid("bug", "feature", "improvement", "other").required(),
  subject: joi.string().min(5).max(100).trim().required(),
  message: joi.string().min(10).max(1000).trim().required(),
  rating: joi.number().integer().min(1).max(5).required(),
});

const updateFeedbackSchema = joi.object({
  type: joi.string().valid("bug", "feature", "improvement", "other"),
  subject: joi.string().min(5).max(100).trim(),
  message: joi.string().min(10).max(1000).trim(),
  rating: joi.number().integer().min(1).max(5),
}).min(1);

module.exports = {
  registerSchema,
  loginSchema,
  createProjectSchema,
  updateProjectSchema,
  createTaskSchema,
  updateTaskSchema,
  changUser,
  changPass,
  changePassSchema,
  mailSchema,
  createFeedbackSchema,
  updateFeedbackSchema,
  updateSettingsSchema,
  deleteAccountSchema,
};
