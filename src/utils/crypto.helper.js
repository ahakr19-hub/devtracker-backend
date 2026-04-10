/**
 * crypto.helper.js
 * Agent 1 (Refactor) — AES-256-GCM CryptoService for DevTracker.
 * Provides:
 *   encrypt / decrypt        — generic low-level helpers
 *   encryptToken / decryptToken — domain-specific aliases for OAuth tokens
 *   validateEncryptionKey()  — startup guard (call in app.js or server.js)
 *
 * Env var required: ENCRYPTION_KEY (32-byte hex string = 64 hex chars)
 * Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
const crypto = require("crypto");

const ALGORITHM    = "aes-256-gcm";
const IV_LENGTH    = 12;  // GCM standard — 96-bit nonce
const AUTH_TAG_LENGTH = 16; // 128-bit authentication tag

/**
 * Returns the 32-byte key buffer derived from the ENCRYPTION_KEY env var.
 * Throws in production if the key is absent or wrong length.
 * Falls back to a deterministic dev-only key otherwise.
 */
const getKey = () => {
  const hexKey = process.env.ENCRYPTION_KEY;
  const isProduction = process.env.NODE_ENV === "production";

  if (!hexKey || hexKey.length !== 64) {
    if (isProduction) {
      // Hard fail — never silently accept a weak key in production
      throw new Error(
        "[FATAL] ENCRYPTION_KEY is missing or invalid. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
      );
    }
    console.warn(
      "[WARN] ENCRYPTION_KEY not set or invalid (expected 64 hex chars). " +
      "Using insecure fallback — DO NOT use in production."
    );
    // Dev/test deterministic fallback — 32 bytes
    return Buffer.alloc(32, "devfallbackkey");
  }
  return Buffer.from(hexKey, "hex");
};

/**
 * Startup guard — call once during app initialisation to catch misconfiguration early.
 * Does nothing in dev (just warns). Throws in production.
 */
const validateEncryptionKey = () => {
  getKey(); // will throw in prod if invalid
};

/**
 * Encrypts a plaintext string.
 * @param {string} plaintext
 * @returns {string} Base64-encoded payload: iv:authTag:ciphertext
 */
const encrypt = (plaintext) => {
  if (!plaintext) return null;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Encode all parts as base64 and join with ":"
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
};

/**
 * Decrypts a payload produced by `encrypt()`.
 * @param {string} payload  Base64 "iv:authTag:ciphertext"
 * @returns {string} Decrypted plaintext
 */
const decrypt = (payload) => {
  if (!payload) return null;
  try {
    const [ivB64, authTagB64, encryptedB64] = payload.split(":");
    if (!ivB64 || !authTagB64 || !encryptedB64) throw new Error("Malformed payload");

    const key = getKey();
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const encrypted = Buffer.from(encryptedB64, "base64");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null; // Tampered or corrupted payload — treat as missing
  }
};

// ─── Domain-specific aliases (Agent 1 requirement) ───────────────────────────

/**
 * Encrypts a raw GitHub OAuth access token before DB persistence.
 * @param {string} rawToken
 * @returns {string|null} Encrypted payload string
 */
const encryptToken = (rawToken) => encrypt(rawToken);

/**
 * Decrypts a stored encrypted GitHub token for API calls.
 * Returns null if the payload is missing, tampered, or corrupted.
 * @param {string} encryptedPayload
 * @returns {string|null} Raw GitHub access token
 */
const decryptToken = (encryptedPayload) => decrypt(encryptedPayload);

module.exports = { encrypt, decrypt, encryptToken, decryptToken, validateEncryptionKey };
