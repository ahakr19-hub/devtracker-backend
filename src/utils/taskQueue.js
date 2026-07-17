const { Queue, Worker } = require('bullmq');
const redis = require('../config/redis');

// Reuse connection options from config/redis to avoid config drift and support unified REDIS_URL configurations
const { redisConnectionOptions: connection } = require('../config/redis');

// 1. Queue for auto-completion (Delayed Jobs)
const autoCompleteQueue = new Queue('autoCompleteQueue', { connection });

autoCompleteQueue.on('error', (err) => {
  console.error('Auto Complete Queue Error:', err.message);
});

// 2. Queue for synchronizing Redis task state to MongoDB safely in background
const taskSyncQueue = new Queue('taskSyncQueue', { connection });

taskSyncQueue.on('error', (err) => {
  console.error('Task Sync Queue Error:', err.message);
});

// Auto Completion Worker
// This runs when a task's timer expires
const autoCompleteWorker = new Worker('autoCompleteQueue', async (job) => {
  const { developerId, projectId, taskId } = job.data;
  console.log(`[Queue] Timer expired for Task: ${taskId}. Auto-completing...`);

  try {
    // 1. Fetch current redis state
    const redisKey = `task:${taskId}`;
    const taskState = await redis.hgetall(redisKey);

    // If the task was paused manually, the job should have been removed,
    // but just in case, verify it's still active.
    if (!taskState || taskState.status !== 'active') {
      console.log(`[Queue] Task ${taskId} is no longer active. Auto-complete aborted.`);
      return;
    }

    // 2. Update Redis status
    await redis.hset(redisKey, {
      status: 'completed',
      accumulatedDuration: taskState.estimatedDuration || 0
    });
    await redis.hdel(redisKey, 'startTime');
    await redis.hdel(redisKey, 'bullJobId');

    // 3. Queue a sync job to MongoDB
    await taskSyncQueue.add('sync-end', {
      developerId,
      projectId,
      taskId,
      type: 'END',
      source: 'TIMER'
    });

  } catch (error) {
    console.error(`[Queue Error] Failed to auto-complete ${taskId}:`, error.message);
  }
}, { connection });

autoCompleteWorker.on('error', async err => {
  console.error('Auto Complete Worker Error:', err.message);
  if (err.message.includes('limit exceeded')) {
    console.warn("⏸️ Upstash limit exceeded. Pausing Auto Complete Worker to prevent spam.");
    await autoCompleteWorker.pause();
  }
});

// Background DB Sync Worker 
const taskSyncWorker = new Worker('taskSyncQueue', async (job) => {
  try {
    const { developerId, projectId, taskId, type, source } = job.data;
    const TaskActivityRepo = require('../modules/auth/repositories/taskActivty.repository');

    if (type === 'START') {
      await TaskActivityRepo.createStart({ developerId, projectId, taskId, source });
    } else if (type === 'END') {
      await TaskActivityRepo.createEnd({ developerId, projectId, taskId, source });

      if (source === 'TIMER' || source === 'AUTO') {
        // Also update the Task document to "done"
        const Task = require('../modules/auth/schemas/task.schema');
        await Task.findByIdAndUpdate(taskId, { status: 'done' });
      }
    }
  } catch (error) {
    console.error(`[Queue Error] DB Sync failed for job ${job.id}:`, error.message);
  }
}, { connection });

taskSyncWorker.on('error', async err => {
  console.error('Task Sync Worker Error:', err.message);
  if (err.message.includes('limit exceeded')) {
    console.warn("⏸️ Upstash limit exceeded. Pausing Task Sync Worker to prevent spam.");
    await taskSyncWorker.pause();
  }
});

module.exports = { autoCompleteQueue, taskSyncQueue };