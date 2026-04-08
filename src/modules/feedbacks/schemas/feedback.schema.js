const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
  {
    developer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Developer",
      required: [true, "developer is required"],
      index: true,
    },

    type: {
      type: String,
      enum: ["bug", "feature_request", "general", "improvement"],
      default: "general",
      lowercase: true,
    },

    subject: {
      type: String,
      required: [true, "subject is required"],
      trim: true,
      minlength: 3,
      maxlength: 120,
    },

    message: {
      type: String,
      required: [true, "message is required"],
      trim: true,
      minlength: 10,
      maxlength: 2000,
    },

    rating: {
      type: Number,
      min: 1,
      max: 5,
    },

    status: {
      type: String,
      enum: ["pending", "under_review", "resolved", "closed"],
      default: "pending",
      lowercase: true,
    },

    adminNote: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    resolvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("Feedback", feedbackSchema, "feedbacks");
