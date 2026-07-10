const express = require('express');
const { createProjectDev, completedProjectDev, getAllArchivedProjects, getAllProjects, deleteProject, deleteAllProjects } = require('../controllers/projectcontroller/project');
const { updateProject } = require('../controllers/projectcontroller/updateProject');
const { protect } = require('../../../middlewares/auth.middleware');
const noBodyAllowed = require('../../../middlewares/noBody.middleware');
const checkProjectLimit = require('../../../middlewares/checkProjectLimit.middleware');
const authorizeProjectAccess = require('../../../middlewares/authorizeProjectAccess.middleware');
const projectRouter = express.Router();
projectRouter.post('/dev/projectdev/createprojectdev',   protect, checkProjectLimit, createProjectDev);
projectRouter.patch('/dev/projectdev/archiveprojectdev/:id', protect, completedProjectDev);
projectRouter.get('/dev/projectdev/archivedprojects/history', protect, getAllArchivedProjects);
projectRouter.get('/dev/projectdev/projects',                protect, getAllProjects);
projectRouter.delete('/dev/projectdev/deleteProject/:id',   protect, noBodyAllowed, deleteProject);
projectRouter.delete('/dev/projectdev/clearhistory',        protect, noBodyAllowed, deleteAllProjects);

// ── Update Project ────────────────────────────────────────────────────────────
// Chain: protect (JWT) → authorizeProjectAccess (owner | admin) → updateProject
// The middleware handles auth & ownership; the controller handles validation & response.
projectRouter.patch('/dev/projectdev/updateproject/:id', protect, authorizeProjectAccess, updateProject);

module.exports = { projectRouter };