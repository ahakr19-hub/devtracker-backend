const joi = require("joi");
const registerSchema = joi.object({
  name: joi.string().min(3).max(50).required(),
  email: joi.string().email().required(),
  password: joi.string().min(8).required(),
});

const otpSchema = joi.object({
  otp: joi.number().required(),
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

const changUser = joi.object({
  name: joi.string().min(3).max(30).required(),
});

const changPass = joi.object({
  password: joi.string().min(8).required(),
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
  changUser,
  changPass,
  changePassSchema,
  mailSchema,
  createFeedbackSchema,
  updateFeedbackSchema,
};
