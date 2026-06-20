const express = require("express");
const { register, creatAccount } = require("../controllers/authcontrollers/register");
const { login, googleLogin, githubLogin, logout } = require("../controllers/authcontrollers/login");
const { protect } = require("../../../middlewares/auth.middleware");
const {
  githubOAuthRedirect,
  githubOAuthCallback,
} = require("../../github/controllers/github.oauth.controller");

const regRouter = express.Router();

regRouter.post('/dev/register/registerdevs', register);
regRouter.post('/dev/register/creatdevacc', creatAccount);

regRouter.post('/dev/login/logindevs', login);


regRouter.post("/google-login", googleLogin);
regRouter.post("/github-login", githubLogin);

// Logout — protect ensures only an authenticated session can trigger a logout,
// preventing logout spam from unauthenticated bots.
regRouter.post("/logout", protect, logout);

// ── Agent 1: GitHub OAuth 2.0 Redirect Flow ─────────────────────────────────────────
// GET /auth/github?token=<jwt>        → redirects browser to GitHub consent screen
// GET /auth/github/callback?code=...  → exchanges code, links account, activates trial
regRouter.get("/github", githubOAuthRedirect);
regRouter.get("/github/callback", githubOAuthCallback);

module.exports = regRouter;