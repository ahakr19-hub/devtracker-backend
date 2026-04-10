/**
 * github.embedded.schema.js
 * Agent 3 — Re-exports the GitHub embedded sub-document schema for use in developer.schema.js.
 * Kept as a separate file to honour the project's single-responsibility convention.
 */
const mongoose = require("mongoose");

const linkedRepoSchema = new mongoose.Schema(
  {
    repoId:   { type: Number, required: true },   // GitHub's numeric repo ID
    name:     { type: String, required: true },   // short name: "my-repo"
    fullName: { type: String, required: true },   // full slug: "user/my-repo"
    private:  { type: Boolean, default: false },
    htmlUrl:  { type: String },
    language: { type: String, default: null },
    addedAt:  { type: Date, default: Date.now },
  },
  { _id: false }
);

const githubEmbeddedSchema = new mongoose.Schema(
  {
    githubId:          { type: String },           // GitHub user numeric ID (stored as string)
    githubToken:       { type: String },           // AES-256-GCM encrypted OAuth access token
    githubLogin:       { type: String },           // GitHub username / handle
    isPro:             { type: Boolean, default: false },
    proTrialStartDate: { type: Date },
    proTrialEndDate:   { type: Date },
    linkedRepos:       { type: [linkedRepoSchema], default: [] },
  },
  { _id: false }
);

module.exports = { githubEmbeddedSchema, linkedRepoSchema };
