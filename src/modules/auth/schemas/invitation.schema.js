const mongoose = require("mongoose");

const invitationSchema = new mongoose.Schema(
  {
    // Admin who sent the invitation
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Developer",
      required: true,
      index: true,
    },

    // Email of the recipient
    recipientEmail: {
      type: String,
      required: [true, "Recipient email is required"],
      trim: true,
      lowercase: true,
      index: true,                  // ← Agent 1: explicit index for RBAC queries
    },

    // Status of the invitation
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },

    // ── Agent 1: Project-Specific Sharing ─────────────────────────────────────
    // The subset of the admin's projects that this invitee is granted access to.
    // Empty array = invitation is team-only (no project access yet).
    sharedProjects: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Project",
      },
    ],

    // Optional welcome message from the admin
    message: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// Compound index — prevents duplicate pending invites from same admin to same email
invitationSchema.index({ sender: 1, recipientEmail: 1, status: 1 });

// Agent 1: Multikey index on sharedProjects for fast RBAC lookups:
//   "Which invitations include this project?" → O(log N) IXSCAN instead of COLLSCAN
invitationSchema.index({ sharedProjects: 1 });

// Agent 2: Combined index for the security query pattern:
//   find({ recipientEmail: <x>, sharedProjects: <projectId>, status: "accepted" })
invitationSchema.index({ recipientEmail: 1, sharedProjects: 1, status: 1 });

module.exports = mongoose.model("Invitation", invitationSchema);