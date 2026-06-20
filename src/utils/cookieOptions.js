/**
 * @file cookieOptions.js
 * @description Centralised factory for HTTP-only cookie configuration.
 *
 * Why a factory instead of a plain object?
 *  - Allows `sameSite` to be overridden per-call (OAuth needs 'lax' or
 *    occasionally 'none' when the IdP redirects cross-origin).
 *  - Keeps expiry logic in one place – change JWT_EXPIRES_IN here and
 *    the cookie lifetime updates automatically everywhere.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Parse a duration string like "7d", "24h", "30m" into milliseconds.
 * Falls back to 24 hours if the format is unrecognised.
 *
 * @param {string} duration - e.g. "7d", "24h", "30m"
 * @returns {number} milliseconds
 */
const parseDurationToMs = (duration = "24h") => {
  const unit = duration.slice(-1);
  const value = parseInt(duration.slice(0, -1), 10);

  if (isNaN(value)) return MS_PER_DAY; // safe fallback

  switch (unit) {
    case "d": return value * MS_PER_DAY;
    case "h": return value * 60 * 60 * 1000;
    case "m": return value * 60 * 1000;
    default:  return MS_PER_DAY;
  }
};

/**
 * Returns a cookie options object aligned with the JWT lifetime.
 *
 * @param {object} [overrides={}] - Optional per-call overrides (e.g. sameSite).
 * @returns {import('express').CookieOptions}
 *
 * @example
 * // Standard login – default options
 * res.cookie("token", token, getCookieOptions());
 *
 * @example
 * // OAuth callback – keep lax (default) so the browser accepts the
 * // cookie even after being redirected from the IdP domain.
 * res.cookie("token", token, getCookieOptions({ sameSite: "lax" }));
 */
const getCookieOptions = (overrides = {}) => ({
  /**
   * httpOnly: true — The cookie is NEVER accessible via document.cookie.
   * This is the single most important XSS mitigation for auth cookies.
   */
  httpOnly: true,

  /**
   * secure: true in production — Forces HTTPS transmission.
   * During local development (http://localhost) this must be false or
   * the browser will silently drop the cookie.
   */
  secure: process.env.NODE_ENV === "production",

  /**
   * sameSite: "lax" — Balances security and usability.
   *  - Blocks the cookie from being sent on cross-site POST requests (CSRF mitigation).
   *  - Still allows the cookie to be sent when a user navigates TO your site
   *    via a top-level GET (which is exactly what OAuth IdP redirects do).
   *  - "strict" would break OAuth redirects; "none" requires Secure:true and
   *    opens CSRF risk, so "lax" is the right default for most SPAs.
   */
  sameSite: "lax",

  /**
   * maxAge — Matches the JWT expiry so the cookie and token die together.
   * maxAge is in milliseconds in Express (unlike Set-Cookie header ms).
   */
  maxAge: parseDurationToMs(process.env.JWT_EXPIRES_IN || "24h"),

  // Spread caller overrides last so they can fine-tune per-route.
  ...overrides,
});

module.exports = { getCookieOptions, parseDurationToMs };
