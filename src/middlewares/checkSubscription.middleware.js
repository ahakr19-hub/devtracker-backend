const Developer = require("../modules/auth/schemas/developer.schema");

/**
 * checkSubscription(requiresPremium)
 *
 * Dynamic plan/expiry validation — replaces the old boolean isPremium check.
 *
 * Logic:
 *  1. planType === 'lifetime'  → always PASS (never expires)
 *  2. planType === 'monthly' | 'yearly' → check subscriptionExpiresAt
 *     - If now > expiresAt → auto-downgrade, reject with 403 subscription_expired
 *     - Otherwise → PASS
 *  3. requiresPremium && !isPremium → 403 upgrade_required
 */
const checkSubscription = (requiresPremium = false) => {
  return async (req, res, next) => {
    try {
      const user = req.user;

      if (!user?.subscription) {
        return res.status(403).json({ error: "subscription_required" });
      }

      const sub = user.subscription;
      const now = Date.now();

      // ── Gate 1: Lifetime — unconditional access ──────────────────────────
      if (sub.planType === "lifetime") {
        return next();
      }

      // ── Gate 2: Timed plans — expiry check ──────────────────────────────
      if (
        (sub.planType === "monthly" || sub.planType === "yearly") &&
        sub.isPremium
      ) {
        if (sub.subscriptionExpiresAt && now > new Date(sub.subscriptionExpiresAt).getTime()) {
          // Auto-downgrade: mark expired in DB without blocking the request chain
          await Developer.findByIdAndUpdate(user._id, {
            $set: {
              "subscription.isPremium": false,
              "subscription.subscriptionStatus": "expired",
            },
          });

          return res.status(403).json({
            error: "subscription_expired",
            message: "Your subscription has expired. Please renew to continue.",
            expiredAt: sub.subscriptionExpiresAt,
          });
        }

        // Active timed subscription → PASS
        return next();
      }

      // ── Gate 3: Legacy trial check (backward-compat) ─────────────────────
      if (sub.status === "trialing" && sub.trialEndsAt && sub.trialEndsAt < new Date(now)) {
        await Developer.findByIdAndUpdate(user._id, {
          $set: { "subscription.status": "canceled" },
        });
        return res.status(403).json({
          error: "trial_expired",
          message: "Your trial has ended. Please subscribe.",
        });
      }

      if (sub.status === "canceled" || sub.status === "past_due") {
        return res.status(403).json({ error: "subscription_required" });
      }

      // ── Gate 4: Premium-only routes ──────────────────────────────────────
      if (requiresPremium && !sub.isPremium) {
        return res.status(403).json({ error: "upgrade_required" });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = checkSubscription;
