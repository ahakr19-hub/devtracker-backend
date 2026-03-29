// src/modules/projects/services/project.service.js
const ApiError = require("../../../utils/apiErrors");
const { findUserById } = require("../repositories/auth.repository");
const {
  createProject,
  isProjectExists,
  completeProject,
  getArchivedProjects,
  getAllProjects,
  findAllProjects,
  deleteOneProject,
  getOneProject,
  deleteProjects,
  countAllProjects,
  countAllArchivedProjects,
} = require("../repositories/project.repository");

const createDevProject = async ({
  name,
  clientName,
  hourlyRate,
  description,
  developerId,
}) => {
  if (!developerId) throw new ApiError(404, "Developer not found");

  const dev = await findUserById(developerId);

  if (!dev) throw new ApiError(404, "Developer not found");

  if (!dev.subscription?.isPremium && dev.projectCount >= 3) {
    throw new ApiError(
      403,
      "Free tier limit reached. Please upgrade to add more than 3 projects.",
    );
  }

  const isMatchedProject = await isProjectExists(name, developerId);

  if (isMatchedProject) throw new ApiError(400, "Project already exists");

  const project = await createProject({
    name,

    clientName,

    hourlyRate,

    description,

    owner: developerId,
  });

  await incrementDeveloperProjectCount(developerId);

  return project;
};

const completedDevProject = async (developerId, projectId) => {
  if (!developerId) throw new ApiError(404, "Developer not found");
  if (!projectId) throw new ApiError(404, "Project Not Found");
  const deletedProject = await completeProject(developerId, projectId);
  if (!deletedProject)
    throw new ApiError(404, "Project not found or not authorized");

  return deletedProject;
};

const getDevProjectArchived = async (developerId, page, limit) => {
  if (!developerId) throw new ApiError(404, "Developer not found");
  const archivedProjects = await getArchivedProjects(developerId, page, limit);
  const totalHistory = await countAllArchivedProjects(developerId);

  return { archivedProjects, totalHistory };
};

const getAllDevProjects = async (developerId, page, limit) => {
  if (!developerId) throw new ApiError(404, "Developer not found"); // 1. هات بيانات المطور عشان نشوف الـ teams بتاعته

  const dev = await findUserById(developerId); // 2. تجميع كل الـ IDs اللي مسموح له يشوف مشاريعهم
  // هو يقدر يشوف مشاريع نفسه + مشاريع أي أدمن هو فيريقه
  const allowedOwners = [developerId];
  if (dev.teams && dev.teams.length > 0) {
    const adminIds = dev.teams.map((t) => t.adminId);
    allowedOwners.push(...adminIds);
  } // 3. نعدل الـ Repository عشان يدور بـ Array of IDs مش ID واحد
  // ملاحظة: لازم تعدل الـ findAllProjects في الـ repository عشان يستخدم $in

  const Projects = await findAllProjects(allowedOwners, page, limit);
  const totalActiveProjects = await countAllProjects(allowedOwners);

  return { Projects, totalActiveProjects };
};

const deleteDevProject = async (developerId, projectId) => {
  if (!developerId) throw new ApiError(404, "developer not found");
  const oneProject = await getOneProject(projectId);
  if (!oneProject) throw new ApiError(404, "project not found");
  if (oneProject.isArchived === false)
    throw new ApiError(401, "you can delete projects in history only");
  const project = await deleteOneProject(developerId, projectId);
  if (!project) throw new ApiError(404, "project not found");
  return project;
};

const deleteAllDevProject = async (developerId) => {
  if (!developerId) throw new ApiError(404, "developer not found");
  const result = await deleteProjects(developerId);

  if (result.deletedCount === 0) {
    throw new ApiError(404, "History is empty");
  }
  return deleteAllDevProject;
};

module.exports = {
  createDevProject,
  completedDevProject,
  getDevProjectArchived,
  getAllDevProjects,
  deleteDevProject,
  deleteAllDevProject,
};
