const ApiError = require("../../../utils/apiErrors");
const { findUserById } = require("../repositories/auth.repository");
const { 
  createProject, 
  isProjectExists, 
  completeProject, 
  getArchivedProjects, 
  findAllProjects, 
  deleteOneProject, 
  getOneProject, 
  deleteProjects, 
  countAllProjects, 
  countAllArchivedProjects 
} = require("../repositories/project.repository");

const { incrementDeveloperProjectCount } = require("../repositories/auth.repository");

const createDevProject = async ({ name, clientName, hourlyRate, description, developerId }) => {
  if (!developerId) throw new ApiError(404, "Developer not found");

  const dev = await findUserById(developerId);
  if (!dev) throw new ApiError(404, "Developer not found");

  if (!dev.subscription?.isPremium && dev.projectCount >= 3) {
    throw new ApiError(403, "Free tier limit reached. Please upgrade to add more than 3 projects.");
  }

  const isMatchedProject = await isProjectExists(name, developerId);
  if (isMatchedProject) throw new ApiError(400, "Project already exists");

  const project = await createProject({ 
    name, 
    clientName, 
    hourlyRate, 
    description, 
    owner: developerId 
  });

  await incrementDeveloperProjectCount(developerId);

  return project;
};

const completedDevProject = async (developerId, projectId) => {
  if (!developerId) throw new ApiError(404, "Developer not found");
  if (!projectId) throw new ApiError(404, "Project ID is required");

  const deletedProject = await completeProject(developerId, projectId);
  if (!deletedProject) throw new ApiError(404, "Project not found or unauthorized");

  return deletedProject;
};

const getDevProjectArchived = async (developerId, page, limit) => {
  if (!developerId) throw new ApiError(404, "Developer not found");

  const archivedProjects = await getArchivedProjects(developerId, page, limit);
  const totalHistory = await countAllArchivedProjects(developerId);

  return { archivedProjects, totalHistory };
};

const getAllDevProjects = async (developerId, page, limit) => {
  if (!developerId) throw new ApiError(404, "Developer not found");

  const dev = await findUserById(developerId);
  const allowedOwners = [developerId];

  if (dev.teams && dev.teams.length > 0) {
    const adminIds = dev.teams.map(t => t.adminId);
    allowedOwners.push(...adminIds);
  }

  const Projects = await findAllProjects(allowedOwners, page, limit);
  const totalActiveProjects = await countAllProjects(allowedOwners);

  return { Projects, totalActiveProjects };
};

const deleteDevProject = async (developerId, projectId) => {
  if (!developerId) throw new ApiError(404, "Developer not found");

  const oneProject = await getOneProject(projectId);
  if (!oneProject) throw new ApiError(404, "Project not found");

  if (oneProject.isArchived === false) {
    throw new ApiError(401, "Only archived projects can be deleted from history");
  }

  const project = await deleteOneProject(developerId, projectId);
  if (!project) throw new ApiError(404, "Project not found");

  return project;
};

const deleteAllDevProject = async (developerId) => {
  if (!developerId) throw new ApiError(404, "Developer not found");

  const result = await deleteProjects(developerId);
  if (result.deletedCount === 0) {
    throw new ApiError(404, "No archived projects found to delete");
  }

  return result;
};

module.exports = { 
  createDevProject, 
  completedDevProject, 
  getDevProjectArchived, 
  getAllDevProjects, 
  deleteDevProject, 
  deleteAllDevProject 
};