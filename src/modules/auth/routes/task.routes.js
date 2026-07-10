const express = require('express');
const { createDevtask, completeDevTask, getProjectFinancialsController, getAllProjectTasks, deleteAllProjectTasks } = require('../controllers/takecontrollers/task');
const { updateTask } = require('../controllers/takecontrollers/updateTask');
const { protect } = require('../../../middlewares/auth.middleware');
const authorizeTaskAccess = require('../../../middlewares/authorizeTaskAccess.middleware');
const taskRouter = express.Router();

taskRouter.post('/dev/tasks/createtask/:id',                     protect, createDevtask);
taskRouter.patch('/dev/:projectId/tasks/:taskId/complete',        protect, completeDevTask);
taskRouter.get('/dev/:projectId/financials',                      protect, getProjectFinancialsController);
taskRouter.get('/dev/tasks/getalltasks/:id',                      protect, getAllProjectTasks);
taskRouter.delete('/dev/tasks/deletealltasks/:id',                protect, deleteAllProjectTasks);

// ── Update Task ──────────────────────────────────────────────────────────────
// Chain: protect (JWT) → authorizeTaskAccess (owner|admin|teamMember|assignedDev)
//        → updateTask (Joi validation + service delegation)
// Field-level RBAC (owner vs assigned-dev fields) is enforced in the service.
taskRouter.patch('/dev/tasks/updatetask/:projectId/:taskId', protect, authorizeTaskAccess, updateTask);

module.exports = taskRouter;