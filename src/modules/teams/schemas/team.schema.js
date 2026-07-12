const mongoose = require("mongoose");

/**
 * TeamSchema — dedicated Team collection.
 *
 * Design rationale:
 *   - A Team is a first-class resource (not embedded in Developer).
 *   - Each team has exactly one owner and N members.
 *   - Two compound indexes ensure the "my-teams" query (owner OR member)
 *     never triggers a COLLSCAN: O(log N) B-tree lookups on each branch.
 *   - The schema deliberately excludes any password, token, or billing field.
 */
const teamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Team name is required"],
      trim: true,
      minlength: 2,
      maxlength: 80,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },

    // The developer who created/owns the team.
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Developer",
      required: [true, "Team owner is required"],
    },

    // All non-owner members of the team.
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Developer",
      },
    ],

    // Visual identifier — e.g. "engineering", "design", "marketing"
    category: {
      type: String,
      trim: true,
      maxlength: 50,
      default: "general",
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// ── Production Indexes ────────────────────────────────────────────────────────
//
// These two indexes are the core of the "my-teams" query optimisation.
// Without them, MongoDB executes a full collection scan (COLLSCAN) on every
// GET /api/teams/my-teams request — fatal at scale.
//
// With them, each branch of the $or predicate hits its own IXSCAN in O(log N),
// and MongoDB merges the two result sets efficiently.
//
// owner index — for teams where the user is the owner
teamSchema.index({ owner: 1 });

// members index — for teams where the user appears in the members array
// MongoDB automatically handles multi-key indexing for array fields.
teamSchema.index({ members: 1 });

// Compound index that accelerates "active teams by owner" queries used
// in admin dashboards (selectivity: isActive=true filters out archived teams).
teamSchema.index({ owner: 1, isActive: 1 });

module.exports = mongoose.model("Team", teamSchema, "teams");
