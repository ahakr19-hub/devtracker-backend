const taskSchema = require("../schemas/task.schema");
const mongoose = require("mongoose");

const creatTaske = (data) => {
  return taskSchema.create(data);
};

const completeTaskById = (taskId) => {
  return taskSchema.findByIdAndUpdate(
    taskId,
    { status: "done" },
    { new: true },
  );
};

const findTaskById = (taskId) =>
  taskSchema.findById(taskId).populate("project");

// repositories/task.repository.js
const getProjectFinancials = async (projectId) => {
  const result = await taskSchema.aggregate([
    {
      $match: {
        project: new mongoose.Types.ObjectId(projectId),
      },
    },
    {
      $lookup: {
        from: "projects",
        localField: "project",
        foreignField: "_id",
        as: "projectData",
      },
    },
    { $unwind: "$projectData" },
    {
      $group: {
        _id: "$project",
        earned: {
          $sum: {
            $cond: [
              { $eq: ["$status", "done"] },
              { $multiply: ["$estimatedHours", "$projectData.hourlyRate"] },
              0,
            ],
          },
        },
        remaining: {
          $sum: {
            $cond: [
              { $ne: ["$status", "done"] },
              { $multiply: ["$estimatedHours", "$projectData.hourlyRate"] },
              0,
            ],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        earned: 1,
        remaining: 1,
        total: { $add: ["$earned", "$remaining"] },
      },
    },
  ]);

  return result[0] || { earned: 0, remaining: 0, total: 0 };
};

const findAllTasksByProjectId = (projectId) => {
  return taskSchema.find({ project: projectId })
    .sort({ createdAt: -1 }); 
};

const deleteCompletedTasks = async (projectId) => {
  return taskSchema.deleteMany({
    project: projectId,
    status: 'done'
  });
};

/**
 * updateTaskById
 *
 * Atomically patches a task. Filters on both _id and project to ensure
 * the task actually belongs to the stated project (prevents cross-project
 * manipulation). runValidators re-runs schema-level min/max constraints.
 * .select() returns only the fields the client needs — avoids heavy payloads.
 *
 * @param {string} taskId   - The task's ObjectId
 * @param {string} projectId - The project the task must belong to
 * @param {object} updates  - Sanitised update fields (already filtered by RBAC)
 * @returns {Promise<Document|null>}
 */
const updateTaskById = async (taskId, projectId, updates) => {
  return await taskSchema.findOneAndUpdate(
    { _id: taskId, project: projectId },  // ← scope to project prevents IDOR
    { $set: updates },
    { new: true, runValidators: true }
  ).select("title status progress estimatedHours deadline assignedTo project updatedAt");
};

/**
 * findTaskWithProject
 *
 * Fetches a task and populates only the `owner` and `hourlyRate` from
 * the related Project. Used exclusively by the RBAC middleware to avoid
 * loading the entire project document for a simple ownership check.
 *
 * @param {string} taskId
 * @returns {Promise<Document|null>}
 */
const findTaskWithProject = (taskId) =>
  taskSchema
    .findById(taskId)
    .populate({ path: "project", select: "owner hourlyRate" });

module.exports = {
  creatTaske,
  completeTaskById,
  findTaskById,
  getProjectFinancials,
  findAllTasksByProjectId,
  deleteCompletedTasks,
  updateTaskById,
  findTaskWithProject,
};
