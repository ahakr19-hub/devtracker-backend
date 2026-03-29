const ApiError = require("../utils/apiErrors");
const { findUserById } = require("../modules/auth/repositories/auth.repository");
const { countAllProjects } = require("../modules/auth/repositories/project.repository");

const checkProjectLimit = async (req, res, next) => {
  try {
    const developerId = req.user._id;

    const dev = await findUserById(developerId);
    if (!dev) {
      return next(new ApiError(404, "Developer not found"));
    }

    const currentProjectsCount = await countAllProjects([developerId]);

    if (!dev.subscription?.isPremium && currentProjectsCount >= 3) {
      return next(new ApiError(403, "Free tier limit reached. You can only add up to 3 projects. Please upgrade for more."));
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = checkProjectLimit;