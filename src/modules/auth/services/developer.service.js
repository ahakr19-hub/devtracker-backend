const bcrypt = require('bcrypt');
const ApiError = require("../../../utils/apiErrors");
const {
  changeDeveloperName,
  getProfileById,
  updateDeveloperSettings,
  findDeveloperWithPassword,
  deleteById,
} = require("../repositories/developer.repository");
const Project = require("../schemas/project.schema");
const Task    = require("../schemas/task.schema");

// ── Existing ──────────────────────────────────────────────────────────────────
const changeUserName = async (developerId, name) => {
  if (!developerId) throw new ApiError(404, 'Developer not found');
  if (!name) throw new ApiError(400, 'name is required');
  const updatedDeveloper = await changeDeveloperName(developerId, name);
  return updatedDeveloper;
};

// ── Get Profile ───────────────────────────────────────────────────────────────
const getProfile = async (developerId) => {
  if (!developerId) throw new ApiError(401, 'Unauthorized');
  const profile = await getProfileById(developerId);
  if (!profile) throw new ApiError(404, 'Developer profile not found');
  return profile;
};

// ── Update Settings ───────────────────────────────────────────────────────────
// Allowed top-level fields whitelist — prevents mass-assignment at the service layer.
const ALLOWED_SETTINGS_FIELDS = ['name', 'notifications', 'preferences'];

const _pick = (obj, keys) =>
  keys.reduce((acc, k) => {
    if (obj[k] !== undefined) acc[k] = obj[k];
    return acc;
  }, {});

const updateSettings = async (developerId, rawUpdates) => {
  if (!developerId) throw new ApiError(401, 'Unauthorized');

  // Mass-assignment guard: only allow whitelisted top-level keys
  const safeUpdates = _pick(rawUpdates, ALLOWED_SETTINGS_FIELDS);
  if (Object.keys(safeUpdates).length === 0)
    throw new ApiError(400, 'No valid fields provided for update');

  const updatedDev = await updateDeveloperSettings(developerId, safeUpdates);
  if (!updatedDev) throw new ApiError(404, 'Developer not found');

  return updatedDev;
};

// ── Delete Account ────────────────────────────────────────────────────────────
// Security: re-verifies the user's password before deleting anything.
// Cascade: removes all owned projects and all tasks within those projects.
const deleteAccount = async (developerId, password) => {
  if (!developerId) throw new ApiError(401, 'Unauthorized');
  if (!password)    throw new ApiError(400, 'Password is required for account deletion');

  // 1. Fetch the developer WITH the password hash for comparison
  const developer = await findDeveloperWithPassword(developerId);
  if (!developer) throw new ApiError(404, 'Developer not found');

  // 2. Re-verify password — prevents CSRF-style account wipes
  const passwordMatches = await bcrypt.compare(password, developer.password);
  if (!passwordMatches)
    throw new ApiError(401, 'Incorrect password. Account deletion aborted.');

  // 3. Cascade delete: find all owned projects, delete their tasks, then the projects
  const ownedProjects = await Project.find({ owner: developerId }).select('_id').lean();
  const projectIds = ownedProjects.map(p => p._id);

  await Promise.all([
    Task.deleteMany({ project: { $in: projectIds } }),  // all tasks in owned projects
    Project.deleteMany({ owner: developerId }),          // all owned projects
  ]);

  // 4. Delete the developer account itself
  await deleteById(developerId);

  return { message: 'Account and all associated data deleted successfully' };
};

module.exports = {
  changeUserName,
  getProfile,
  updateSettings,
  deleteAccount,
};