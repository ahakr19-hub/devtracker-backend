/**
 * github.schema.js
 * Agent 3 — Sub-document schema for the github embedded object in Developer.
 *
 * Stored as `developer.github.*` — not a separate collection, keeping queries lean.
 *
 * linkedRepos item shape:
 *   { repoId, name, fullName, private, htmlUrl, language, addedAt }
 */
const mongoose = require("mongoose");

const linkedRepoSchema = new mongoose.Schema(
  {
    repoId:    { type: Number, required: true },           // GitHub numeric repo ID
    name:      { type: String, required: true },           // "my-repo"
    fullName:  { type: String, required: true },           // "user/my-repo"
    private:   { type: Boolean, default: false },
    htmlUrl:   { type: String },
    language:  { type: String, default: null },
    addedAt:   { type: Date, default: Date.now },
  },
  { _id: false }                                           // No extra _id per repo entry
);

const githubEmbeddedSchema = new mongoose.Schema(
  {
    githubId:         { type: String, index: true },       // ← Agent 3: indexed for fast lookup
    githubToken:      { type: String },                    // AES-256-GCM encrypted access token
    githubLogin:      { type: String },                    // GitHub username / login handle
    isPro:            { type: Boolean, default: false },   // Manual pro upgrade flag
    proTrialStartDate:{ type: Date },
    proTrialEndDate:  { type: Date },
    linkedRepos:      { type: [linkedRepoSchema], default: [] },
  },
  { _id: false }
);

module.exports = { githubEmbeddedSchema, linkedRepoSchema };
