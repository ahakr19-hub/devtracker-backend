const ApiError = require("../../../utils/apiErrors");
const Project = require("../schemas/project.schema");
const Developer = require("../schemas/developer.schema");
const mongoose = require("mongoose")
const createProject = async ({
  name,
  clientName,
  hourlyRate,
  description,
  owner,
}) => {
  return await Project.create({
    name,
    clientName,
    hourlyRate,
    description,
    owner,
  });
};
const isProjectExists = async (name, ownerId) => {
  const isExists = await Project.findOne({ name, owner: ownerId });
  return isExists;
};

const completeProject = async (ownerId, projectId) => {
  const project = await Project.findOneAndUpdate(
    { _id: projectId, owner: ownerId },
    {
      status: "completed",
      isArchived: true,
      archivedAt: new Date(),
    },
    { new: true },
  );

  if (!project) throw new ApiError(404, "Project not found or not authorized");

  return project;
};

const getArchivedProjects = async (ownerId, page, limit) => {
  // Clamp limit: minimum 1, maximum 100 — prevents client from scanning unbounded docs
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 10), 100);
  // Clamp page: minimum 0 (zero-indexed for skip calculation)
  const safePage  = Math.max(0, parseInt(page) || 0);

  return await Project.find({
    owner: ownerId,
    isArchived: true,
  })
    .sort({ archivedAt: -1 })
    .skip(safePage * safeLimit)
    .limit(safeLimit)
    .lean(); // .lean() returns plain objects — faster when we don't need Mongoose doc methods
};

const findAllProjects = async (ownerIds, page, limit) => {
  // 🔥 التأمين هنا: بنضمن إن الـ page مش أقل من 1، والـ limit مش أقل من 1
  const safePage = Math.max(1, parseInt(page) || 1);
  const safeLimit = Math.max(1, parseInt(limit) || 10);

  // حساب الـ skip بناءً على القيم المتأمنة
  const skip = (safePage - 1) * safeLimit;

  const [projects, totalActiveProjects] = await Promise.all([
    Project.find({
      owner: { $in: ownerIds },
      isArchived: false,
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate({
        path: 'owner',
        select: 'name email avatar',
      })
      .lean(),

    Project.countDocuments({
      owner: { $in: ownerIds },
      isArchived: false,
    })
  ]);

  return { projects, totalActiveProjects };
};

const deleteOneProject = async (ownerId, projectId) => {
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    throw new ApiError(400, "Invalid Project ID");
  }

  const project = await Project.findOneAndDelete({
    _id: projectId,
    owner: ownerId,
  },


  );

  return project;
};

// src/modules/projects/repositories/auth.repository.js

const incrementDeveloperProjectCount = async (developerId) => {
  return await Developer.findByIdAndUpdate(
    developerId,
    { $inc: { projectCount: 1 } },
    { new: true }
  );
};
const countAllProjects = async (developerId) => {
  return await Project.countDocuments({
    owner: developerId,
    isArchived: false
  })
}

const countAllArchivedProjects = async (developerId) => {
  return await Project.countDocuments({
    owner: developerId,
    isArchived: true
  })
}

const getOneProject = async (projectId) => {
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    throw new ApiError(400, "Invalid Project ID");
  }

  const project = await Project.findById(projectId)
  return project;
}

const getOneActiveProjects = async (developerId, projectId) => {
  const project = await Project.findOne({
    _id: projectId,
    owner: developerId,
    isArchived: false,
  });

  return project
}

const deleteProjects = async (ownerId) => {
  const deletedProjects = await Project.deleteMany({ owner: ownerId, isArchived: true, })
  return deletedProjects;
}

/**
 * updateProjectById
 * 
 * Atomically updates a project, enforcing ownership at the DB level.
 * - Filtering on both _id AND owner prevents any IDOR / privilege escalation:
 *   a document is only mutated when it belongs to the requesting owner.
 * - runValidators: true re-runs schema validators on the updated fields.
 * - .select() keeps the response payload minimal — only fields the client needs.
 *
 * @param {string} ownerId   - ObjectId of the authenticated owner (from req.user._id)
 * @param {string} projectId - ObjectId of the project to update (from req.params)
 * @param {object} updates   - Sanitised key/value pairs to apply
 * @returns {Promise<Document|null>} The updated project or null if not found/unauthorised
 */
const updateProjectById = async (ownerId, projectId, updates) => {
  return await Project.findOneAndUpdate(
    { _id: projectId, owner: ownerId }, // ← auth enforced at query level
    { $set: updates },
    { new: true, runValidators: true }
  ).select("name clientName hourlyRate description status isArchived updatedAt");
};

/**
 * getOneProjectWithOwner
 *
 * Lightweight fetch used by the authorisation middleware.
 * Only retrieves the `owner` field — avoids loading the full document
 * just to do an ownership check.
 */
const getOneProjectWithOwner = async (projectId) => {
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    throw new ApiError(400, "Invalid Project ID");
  }
  return await Project.findById(projectId).select("owner").lean();
};

module.exports = {
  createProject,
  isProjectExists,
  completeProject,
  getArchivedProjects,
  findAllProjects,
  deleteOneProject,
  getOneProject,
  deleteProjects,
  countAllProjects,
  countAllArchivedProjects,
  getOneActiveProjects,
  incrementDeveloperProjectCount,
  updateProjectById,
  getOneProjectWithOwner,
};
