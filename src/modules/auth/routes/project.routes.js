const express = require('express');
const { createProjectDev, completedProjectDev, getAllArchivedProjects, getAllProjects, deleteProject, deleteAllProjects } = require('../controllers/projectcontroller/project');
const { protect } = require('../../../middlewares/auth.middleware');
const { deleteOneProject } = require('../repositories/project.repository');
const noBodyAllowed = require('../../../middlewares/noBody.middleware');
const checkProjectLimit = require('../../../middlewares/checkProjectLimit.middleware');
const projectRouter = express.Router();
projectRouter.post('/dev/projectdev/createprojectdev' , protect , checkProjectLimit, createProjectDev); 
projectRouter.patch('/dev/projectdev/archiveprojectdev/:id' , protect , completedProjectDev)
projectRouter.get('/dev/projectdev/archivedprojects/history'  , protect , getAllArchivedProjects)
projectRouter.get('/dev/projectdev/projects' , protect , getAllProjects )
projectRouter.delete('/dev/projectdev/deleteProject/:id' , protect ,noBodyAllowed, deleteProject)
projectRouter.delete('/dev/projectdev/clearhistory' , protect , noBodyAllowed , deleteAllProjects)
module.exports = {projectRouter}