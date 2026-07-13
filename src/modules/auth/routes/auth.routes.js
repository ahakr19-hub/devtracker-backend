const express = require("express");
const { register, creatAccount } = require("../controllers/authcontrollers/register");
const { login, googleLogin, githubLogin, logout } = require("../controllers/authcontrollers/login");
const { protect } = require("../../../middlewares/auth.middleware");
const { authLimiter } = require("../../../middlewares/rateLimit.middleware");
const {
  getLinkToken,
  githubOAuthRedirect,
  githubOAuthCallback,
} = require("../../github/controllers/github.oauth.controller");

const regRouter = express.Router();

// Auth limiter applied: max 10 requests per IP per 15 min on all sensitive auth endpoints
regRouter.post('/dev/register/registerdevs', authLimiter, register);
regRouter.post('/dev/register/creatdevacc',  authLimiter, creatAccount);

regRouter.post('/dev/login/logindevs', authLimiter, login);

regRouter.post("/google-login", authLimiter, googleLogin);
regRouter.post("/github-login", authLimiter, githubLogin);

// Logout — protect ensures only an authenticated session can trigger a logout,
// preventing logout spam from unauthenticated bots.
regRouter.post("/logout", protect, logout);

// ── Agent 1: GitHub OAuth 2.0 Redirect Flow ─────────────────────────────────────────────────────
// GET /auth/github/get-link-token     → mints a 5-min link JWT (requires cookie auth)
// GET /auth/github?token=<jwt>        → redirects browser to GitHub consent screen
// GET /auth/github/callback?code=...  → exchanges code, links account, activates trial
regRouter.get("/github/get-link-token", protect, getLinkToken); // MUST be before /github/:wildcard
regRouter.get("/github", githubOAuthRedirect);
regRouter.get("/github/callback", githubOAuthCallback);

module.exports = regRouter;