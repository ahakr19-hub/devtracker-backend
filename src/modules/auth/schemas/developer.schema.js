const mongoose = require("mongoose");
const { githubEmbeddedSchema } = require("./github.embedded.schema");

const developerSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "name is required"], minlength: 3 },
    email: {
      type: String,
      required: [true, "email is required"],
      unique: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please fill a valid email address",
      ],
    },
    password: {
      type: String,
      required: [true, "password is required"],
      minlength: 8,
    },
    role: {
      type: String,
      enum: ["developer", "admin"],
      default: "developer",
      lowercase: true,
    },


    subscription: {
      plan: {
        type: String,
        enum: ["free", "pro", "enterprise"],
        default: "free"
      },
      isPremium: { type: Boolean, default: false },
      stripeCustomerId: { type: String },
      status: {
        type: String,
        enum: ["trialing", "active", "past_due", "canceled", "free"],
        default: "free"
      },
      currentPeriodEnd: { type: Date },
      trialEndsAt: { type: Date },
      paymobSubscriptionId: { type: String },
      stripeSubscriptionId: { type: String },
      interval: {
        type: String,
        enum: ["monthly", "yearly"],
        default: "monthly"
      },
      currency: {
        type: String,
        enum: ["EGP", "USD"],
        default: "USD"
      },

      // ── Dynamic Expiry Tracking ───────────────────────────────────────────
      // planType drives the expiry logic: lifetime never expires.
      planType: {
        type: String,
        enum: ["monthly", "yearly", "lifetime"],
        default: "monthly"
      },
      // subscriptionStatus is the source-of-truth for access; auto-set by middleware.
      subscriptionStatus: {
        type: String,
        enum: ["active", "expired"],
        default: "expired"
      },
      // Set by the payment webhook to Date.now() + billing period duration.
      subscriptionExpiresAt: { type: Date }
    },
    projectCount: {
      type: Number,
      default: 0
    },

    // ── GitHub Integration ────────────────────────────────────────────────
    github: { type: githubEmbeddedSchema, default: () => ({}) },
    // ------------------------------------------

    resetOTP: { type: String },
    resetOTPExpires: { type: Date },
    resetOTPAttempts: {
      type: Number,
      default: 0,
    },

    teams: [{
      adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Developer"
      },
      joinedAt: {
        type: Date,
        default: Date.now
      },
      permissions: {
        canCreateProjects: { type: Boolean, default: false },
        canEditProjects: { type: Boolean, default: false },
        canDeleteProjects: { type: Boolean, default: false },
        canManageTasks: { type: Boolean, default: false },
        canSeeFinancials: { type: Boolean, default: false }
      }
    }],

    resetOTPLastRequest: {
      type: Date,
    },

    // ── User Preferences & Notifications ─────────────────────────────────────
    // Additive fields — existing documents default gracefully (no migration needed).
    notifications: {
      emailOnTaskComplete:  { type: Boolean, default: false },
      emailOnProjectUpdate: { type: Boolean, default: false },
    },

    preferences: {
      theme:    { type: String, enum: ['dark', 'light', 'system'], default: 'dark' },
      language: { type: String, enum: ['en', 'ar'],               default: 'en'   },
    },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// Sparse so docs without a githubId don't consume index space
//hello
developerSchema.index({ "github.githubId": 1 }, { sparse: true });
developerSchema.index({ "teams.adminId": 1 });

module.exports = mongoose.model("Developer", developerSchema, "developers");