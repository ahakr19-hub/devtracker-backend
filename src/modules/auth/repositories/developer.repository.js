const Developer = require('../schemas/developer.schema');

// ── Existing ──────────────────────────────────────────────────────────────────
const changeDeveloperName = async (developerId, newName) => {
  const updatedDev = await Developer.findByIdAndUpdate(
    developerId,
    { name: newName },
    { new: true, runValidators: true }
  );
  return updatedDev;
};

// ── Get Profile ───────────────────────────────────────────────────────────────
// Projection excludes password hash and OTP fields — never sent to the client.
const getProfileById = async (developerId) => {
  return await Developer.findById(developerId)
    .select('-password -resetOTP -resetOTPExpires -resetOTPAttempts -resetOTPLastRequest')
    .lean();
};

// ── Update Settings ───────────────────────────────────────────────────────────
// Uses $set so only the fields in `updates` are touched — atomic and safe.
// Returns only the fields the client needs (no password hash leakage).
const updateDeveloperSettings = async (developerId, updates) => {
  return await Developer.findByIdAndUpdate(
    developerId,
    { $set: updates },
    { new: true, runValidators: true }
  ).select('-password -resetOTP -resetOTPExpires -resetOTPAttempts -resetOTPLastRequest');
};

// ── Delete Account ────────────────────────────────────────────────────────────
// Returns the full developer doc (with password) so the service can bcrypt-compare
// the provided password before actually deleting anything.
const findDeveloperWithPassword = async (developerId) => {
  return await Developer.findById(developerId).select('+password');
};

const deleteById = async (developerId) => {
  return await Developer.findByIdAndDelete(developerId);
};

module.exports = {
  changeDeveloperName,
  getProfileById,
  updateDeveloperSettings,
  findDeveloperWithPassword,
  deleteById,
};