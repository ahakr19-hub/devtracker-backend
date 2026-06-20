const jwt = require("jsonwebtoken");
const ApiError = require("../utils/apiErrors");
const Developer = require("../modules/auth/schemas/developer.schema");

// ─────────────────────────────────────────────
// protect — Route-level authentication middleware
//
// Reads the JWT exclusively from the HTTP-only cookie set at login.
// Using cookies (instead of Authorization headers) means the token is
// NEVER accessible from JavaScript, eliminating the XSS token-theft vector.
// ─────────────────────────────────────────────
const protect = async (req, res, next) => {
  // cookie-parser must be mounted in app.js before this runs (it already is).
  const token = req.cookies?.token;

  // 1️⃣ Guard: no cookie present at all → user is not authenticated.
  if (!token) {
    return next(new ApiError(401, "Not authenticated. Please log in to access this resource."));
  }

  try {
    // 2️⃣ Verify signature + expiry in one call.
    //    jwt.verify throws JsonWebTokenError  → tampered / invalid signature.
    //    jwt.verify throws TokenExpiredError  → valid token but past expiry.
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3️⃣ Re-fetch the developer so we catch accounts deleted after token issuance.
    //    Omit the password hash from every downstream req.user reference.
    const developer = await Developer.findById(decoded.id).select("-password");
    if (!developer) {
      // Token was valid but the account no longer exists — treat as unauthorised.
      return next(new ApiError(401, "The account belonging to this token no longer exists."));
    }

    // 4️⃣ Attach to request so downstream handlers/controllers can use it.
    req.user = developer;
    next();
  } catch (err) {
    // Distinguish between the two most common JWT failure modes so the
    // client can react appropriately (e.g. show "session expired" vs "invalid session").
    if (err.name === "TokenExpiredError") {
      return next(new ApiError(401, "Your session has expired. Please log in again."));
    }
    // JsonWebTokenError, NotBeforeError, or any other jwt failure → likely tampered.
    return next(new ApiError(401, "Invalid authentication token. Please log in again."));
  }
};

// ─────────────────────────────────────────────
// auth — Role-level authorisation middleware (admin-only routes)
// Must be used AFTER protect so req.user is guaranteed to exist.
// ─────────────────────────────────────────────
const auth = (req, res, next) => {
  if (req.user.role !== "admin") {
    return next(new ApiError(403, "You do not have permission to perform this action."));
  }
  next();
};

module.exports = { protect, auth };
