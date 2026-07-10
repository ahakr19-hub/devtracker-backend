const mongoose = require("mongoose");
const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["todo", "in-progress", "done"],
      default: "todo",
    },

    estimatedHours: {
      type: Number,
      min: 0,
    },

    spentHours: {
      type: Number,
      min: 0,
      default: 0,
    },

    deadline: {
      type: Date,
    },

    earnedMoney: {
      type: Number,
      default: 0,
    },

    // The developer this task is assigned to (used for RBAC on updates)
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Developer",
      default: null,
      index: true,
    },

    // Completion percentage — assignedDev can update this; owners can update everything
    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

module.exports = mongoose.model("Tasks", taskSchema);
