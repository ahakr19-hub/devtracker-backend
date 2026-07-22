const ApiError = require("../../../utils/apiErrors");
const { findUserById } = require("../repositories/auth.repository");
const { getOneActiveProjects } = require("../repositories/project.repository");
const {
  creatTaske,
  findTaskById,
  getProjectFinancials,
  findAllTasksByProjectId,
  deleteCompletedTasks,
  updateTaskById,
  findTaskWithProject,
} = require("../repositories/task.repository");
const projectSchema = require("../schemas/project.schema");
const taskActivityService = require('./taskAvtivity.service');
const notifService = require('./notification.service');

const createTaskService = async (developerId, projectId, data) => {
  if (!developerId || !projectId)
    throw new ApiError(401, "Unauthorized: missing developer or project id");

  // 1. نجيب المشروع
  const project = await projectSchema.findById(projectId);
  if (!project) throw new ApiError(404, "Project not found");

  // 2. التحقق من الصلاحية
  const isOwner = project.owner.toString() === developerId.toString();
  
  const user = await findUserById(developerId);
  // بندور هل المطور ده عضو في تيم صاحب المشروع؟
  const teamContext = user.teams.find(t => t.adminId.toString() === project.owner.toString());

  // لو مش صاحب المشروع ومش عضو في التيم ومعاه صلاحية إدارة التاكات.. ارفض
  if (!isOwner && (!teamContext || !teamContext.permissions.canManageTasks)) {
    throw new ApiError(403, "You don't have permission to add tasks to this project");
  }

  // 3. إنشاء التاسك
  const task = await creatTaske({ ...data, project: projectId });
  return task;
};


const completeTaskService = async (developerId, projectId, taskId) => {
  const task = await findTaskById(taskId);
  if (!task) throw new ApiError(404, "Task not found");

  // التأكد إن التاسك تابعة للمشروع ده أصلاً
  if (String(task.project._id) !== String(projectId)) {
    throw new ApiError(400, "Task does not belong to this project");
  }

  // التحقق من الصلاحية
  const isOwner = task.project.owner.toString() === developerId.toString();
  const user = await findUserById(developerId);
  const teamContext = user.teams.find(t => t.adminId.toString() === task.project.owner.toString());

  if (!isOwner && (!teamContext || !teamContext.permissions.canManageTasks)) {
    throw new ApiError(403, "Access denied: You cannot modify tasks in this team");
  }

  // الـ Logic بتاع الـ Activity اللي إنت عامله (جميل جداً)
  const status = await taskActivityService.getTaskStatus({ developerId, taskId });
  if (status.isWorking) {
    await taskActivityService.endTask({
      developerId,
      projectId,
      taskId,
      source: "STATUS_CHANGE"
    });
  }

  task.status = "done";
  task.completedAt = new Date();
  
  // ملاحظة: لو المطور مش هو الأونر، هل مسموح له يشوف الـ hourlyRate؟ 
  // إنت عامل في الـ Schema صلاحية canSeeFinancials، ممكن تستخدمها هنا
  if (isOwner || (teamContext && teamContext.permissions.canSeeFinancials)) {
     task.earnedMoney = (task.spentHours || 0) * task.project.hourlyRate;
  }

  await task.save();
  return task;
};

// services/project.service.js
const getProjectFinancialsService = async (projectId, developerId) => {
  if (!developerId || !projectId)
    throw new ApiError(401, "Unauthorized: missing ids");

  // 1. نجيب المشروع عشان نعرف الأونر
  const project = await projectSchema.findById(projectId);
  if (!project) throw new ApiError(404, "Project not found");

  // 2. التحقق من الصلاحية
  const isOwner = project.owner.toString() === developerId.toString();
  
  const user = await findUserById(developerId);
  // بندور هل المطور ده في تيم الأونر ومسموح له يشوف الفلوس؟
  const teamContext = user.teams.find(t => t.adminId.toString() === project.owner.toString());

  // لو مش صاحب المشروع ومعندوش صلاحية canSeeFinancials
  if (!isOwner && (!teamContext || !teamContext.permissions.canSeeFinancials)) {
    throw new ApiError(403, "Access Denied: You don't have permission to view project financials");
  }

  // 3. لو الصلاحية تمام.. نكلم الـ Repository يجيب الداتا
  return await getProjectFinancials(projectId);
};

const getAllTasks = async (projectId, developerId) => {
    if (!developerId || !projectId)
        throw new ApiError(401, "Unauthorized: missing developer or project id");

    // 1. نجيب المشروع الأول عشان نعرف مين صاحبه
    const project = await projectSchema.findById(projectId);

    if (!project) {
        throw new ApiError(404, "Project not found");
    }

    // 2. التحقق من الصلاحية: هل هو الصاحب؟ أو عضو في فريق الصاحب؟
    const isOwner = project.owner.toString() === developerId.toString();
    
    // نجيب بيانات المطور عشان نشوف الفرق بتاعته
    const developer = await findUserById(developerId);
    const isMember = developer.teams.some(t => t.adminId.toString() === project.owner.toString());

    if (!isOwner && !isMember) {
        throw new ApiError(403, "You don't have permission to access tasks for this project");
    }

    // 3. لو عدى من الـ Check، هات التاكات عادي
    const tasks = await findAllTasksByProjectId(projectId);
    return tasks;
}
const deleteAllTasks = async(projectId, developerId) => {
    if (!developerId || !projectId)
    throw new ApiError(401, "Unauthorized: missing developer or project id");
    
    const project = await projectSchema.findOne({ 
        _id: projectId,   
        owner: developerId 
    });

    if (!project) {
        throw new ApiError(403, "You don't have permission to access tasks for this project");
    }
    const deletedTask = await deleteCompletedTasks(projectId);
    
    return deletedTask;
};

// ─────────────────────────────────────────────────────────────────────────────
// updateTaskService
//
// RBAC field filtering is the core responsibility here:
//   • Owner / team-admin with canManageTasks  → can update ALL fields
//   • The assigned developer                  → can ONLY update status & progress
//
// A single pick() call strips any fields the caller is not allowed to set
// before the update object reaches the repository (mass-assignment prevention).
// ─────────────────────────────────────────────────────────────────────────────

/** Fields an owner or team-admin (canManageTasks) may modify */
const OWNER_FIELDS  = ["title", "estimatedHours", "deadline", "assignedTo", "status", "progress"];
/** Fields a task's assigned developer may modify */
const DEVELOPER_FIELDS = ["status", "progress"];

const _pick = (obj, keys) =>
  keys.reduce((acc, k) => {
    if (obj[k] !== undefined) acc[k] = obj[k];
    return acc;
  }, {});

/**
 * updateTaskService
 *
 * @param {string}  requesterId  - req.user._id
 * @param {string}  projectId    - req.params.projectId
 * @param {string}  taskId       - req.params.taskId
 * @param {object}  rawUpdates   - req.body (pre-validated by Joi, not yet filtered)
 * @param {boolean} isAdmin      - true when req.user.role === 'admin'
 */
const updateTaskService = async (requesterId, projectId, taskId, rawUpdates, isAdmin = false) => {
  if (!requesterId || !projectId || !taskId)
    throw new ApiError(400, "Missing requester, project, or task identifier");

  // 1. Fetch task + project owner in one query (minimal projection)
  const task = await findTaskWithProject(taskId);
  if (!task) throw new ApiError(404, "Task not found");

  // Ensure the task actually belongs to the stated project
  if (String(task.project._id) !== String(projectId))
    throw new ApiError(400, "Task does not belong to the specified project");

  const projectOwnerId = task.project.owner.toString();
  const callerId        = requesterId.toString();

  // 2. Determine the caller’s role relative to this task’s project
  const isOwner = callerId === projectOwnerId;

  let isTeamAdminWithPermission = false;
  if (!isOwner && !isAdmin) {
    const caller = await findUserById(requesterId);
    const teamCtx = caller.teams?.find(
      (t) => t.adminId.toString() === projectOwnerId
    );
    isTeamAdminWithPermission = !!(teamCtx?.permissions?.canManageTasks);
  }

  const isAssignedDev =
    task.assignedTo && task.assignedTo.toString() === callerId;

  // 3. Gate access: must be at least ONE of the above roles
  const hasFullAccess  = isAdmin || isOwner || isTeamAdminWithPermission;
  const hasLimitedAccess = isAssignedDev;

  if (!hasFullAccess && !hasLimitedAccess)
    throw new ApiError(403, "Access denied: you do not have permission to update this task");

  // 4. Field-level filtering (mass-assignment guard)
  //    Full-access callers get all allowed fields; assigned-devs get the subset.
  const allowedFields = hasFullAccess ? OWNER_FIELDS : DEVELOPER_FIELDS;
  const safeUpdates   = _pick(rawUpdates, allowedFields);

  if (Object.keys(safeUpdates).length === 0)
    throw new ApiError(400, "No valid (or permitted) fields provided for update");

  // 5. Atomic update — scoped to project to prevent cross-project manipulation
  const updatedTask = await updateTaskById(taskId, projectId, safeUpdates);
  if (!updatedTask)
    throw new ApiError(404, "Task not found or could not be updated");

  // 6. Fire a DB-backed notification if assignedTo changed
  //    We compare the PREVIOUS assignee (from the fetched task) to the NEW one.
  //    Fire-and-forget — does NOT block the response.
  if (
    safeUpdates.assignedTo &&
    String(safeUpdates.assignedTo) !== String(task.assignedTo)
  ) {
    const requester = await findUserById(requesterId);
    notifService.notifyTaskAssigned({
      taskId:           taskId.toString(),
      taskTitle:        updatedTask.title,
      assignedToUserId: safeUpdates.assignedTo.toString(),
      assignedByName:   requester?.name || "Admin",
    }).catch((e) => console.error("[notifService] task assignment notification failed:", e.message));
  }

  return updatedTask;
};

module.exports = {
  createTaskService,
  completeTaskService,
  getProjectFinancialsService,
  getAllTasks,
  deleteAllTasks,
  updateTaskService,
};
