/**
 * github.webhook.helper.js
 * Agent 3 (Refactor) — Webhook & Sync Architect
 *
 * Provides HMAC validation for incoming GitHub webhooks using GITHUB_WEBHOOK_SECRET.
 */

const crypto = require("crypto");
const ApiError = require("../../../utils/apiErrors");

/**
 * Validates the GitHub webhook payload using HMAC SHA-256.
 * @param {string} payloadBody - Raw request body as a string.
 * @param {string} signature - Value of the x-hub-signature-256 header.
 * @returns {boolean} True if signature is valid, false otherwise.
 */
const verifyGitHubWebhook = (payloadBody, signature) => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!secret) {
     console.warn("[WARN] GITHUB_WEBHOOK_SECRET is not set. Webhooks cannot be verified securely.");
     throw new ApiError(500, "Webhook validation misconfigured on server."); // Fail securely
  }

  if (!signature) {
      return false; // No signature provided
  }

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payloadBody);
  const calculatedSignature = `sha256=${hmac.digest("hex")}`;

  // Use timingSafeEqual to prevent timing attacks
  const signatureBuffer = Buffer.from(signature);
  const calculatedBuffer = Buffer.from(calculatedSignature);

  if (signatureBuffer.length !== calculatedBuffer.length) {
      return false;
  }

  return crypto.timingSafeEqual(signatureBuffer, calculatedBuffer);
};

module.exports = { verifyGitHubWebhook };
