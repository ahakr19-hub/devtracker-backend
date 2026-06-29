const ApiError = require("../utils/apiErrors");
const { countAllProjects } = require("../modules/auth/repositories/project.repository");

const checkProjectLimit = async (req, res, next) => {
  try {
    // req.user is already populated by the protect() middleware — no extra DB query needed.
    // Previously this middleware re-fetched the same developer from MongoDB (wasted round-trip).
    const dev = req.user;

    const currentProjectsCount = await countAllProjects([dev._id]);

    if (!dev.subscription?.isPremium && currentProjectsCount >= 3) {
      return next(
        new ApiError(
          403,
          "Free tier limit reached. You can only add up to 3 projects. Please upgrade for more."
        )
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = checkProjectLimit;