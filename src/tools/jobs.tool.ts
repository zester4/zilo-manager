import { tool } from 'ai';
import { z } from 'zod';
import { requestConfirmation } from '../runtime/confirm.js';
import { emitProgress } from '../runtime/progress.js';
import { registerQStashSchedule } from '../jobs/qstash.js';
import { appendJobLog, createJob, getJob, getJobLogs, listJobs, updateJobStatus } from '../jobs/store.js';

const jobStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']);
const metadataSchema = z.record(z.string(), z.unknown());

async function confirmJobAction(action: string, details: string[]) {
  return requestConfirmation({
    toolkitSlug: 'ZILMATE',
    toolSlug: 'JOBS',
    action,
    access: 'Write',
    targetTools: ['ZILMATE_JOBS'],
    details,
    summary: details.join('; '),
  });
}

export const jobTools = {
  createJob: tool({
    description: 'Queue a ZilMate background job. Use this when the user asks ZilMate to keep working after chat, schedule a task, prepare a report later, monitor something, or follow up. Requires confirmation.',
    inputSchema: z.object({
      task: z.string().min(3),
      schedule: z.string().min(1).optional().describe('Optional schedule such as daily, hourly, every 15 minutes, or cron:0 9 * * *.'),
      runAt: z.string().min(1).optional().describe('Optional ISO date/time or parseable date for the first run.'),
      metadata: metadataSchema.optional(),
    }),
    execute: async ({ task, schedule, runAt, metadata }) => {
      const approved = await confirmJobAction('Create background job', [
        `Task: ${task}`,
        ...(schedule ? [`Schedule: ${schedule}`] : []),
        ...(runAt ? [`Run at: ${runAt}`] : []),
      ]);
      if (!approved) throw new Error('Blocked job creation. Ask the user to approve creating the background job.');

      emitProgress({ type: 'tool:start', label: 'Creating job', detail: task });
      const job = await createJob({
        task,
        ...(schedule ? { schedule } : {}),
        ...(runAt ? { runAt } : {}),
        source: schedule ? { type: 'schedule' } : { type: 'manual' },
        metadata: metadata ?? {},
      });
      const registered = await registerQStashSchedule(job);
      emitProgress({ type: 'tool:end', label: 'Job queued', detail: registered.id });
      return registered;
    },
  }),

  listJobs: tool({
    description: 'List ZilMate background jobs by status. Use this to help the user see queued, running, completed, failed, or cancelled work.',
    inputSchema: z.object({
      status: jobStatusSchema.optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    execute: async ({ status, limit }) => {
      emitProgress(status ? { type: 'fetch:start', label: 'Listing jobs', detail: status } : { type: 'fetch:start', label: 'Listing jobs' });
      const jobs = await listJobs({ ...(status ? { status } : {}), limit: limit ?? 25 });
      emitProgress({ type: 'fetch:end', label: 'Jobs listed', detail: `${jobs.length} job${jobs.length === 1 ? '' : 's'}` });
      return jobs;
    },
  }),

  showJob: tool({
    description: 'Show one ZilMate background job by id.',
    inputSchema: z.object({
      id: z.string().min(3),
    }),
    execute: async ({ id }) => {
      emitProgress({ type: 'fetch:start', label: 'Loading job', detail: id });
      const job = await getJob(id);
      emitProgress({ type: 'fetch:end', label: job ? 'Job loaded' : 'Job not found', detail: id });
      return job;
    },
  }),

  listJobLogs: tool({
    description: 'Show logs, progress events, results, and errors for one ZilMate background job.',
    inputSchema: z.object({
      id: z.string().min(3),
    }),
    execute: async ({ id }) => {
      emitProgress({ type: 'fetch:start', label: 'Loading job logs', detail: id });
      const logs = await getJobLogs(id);
      emitProgress({ type: 'fetch:end', label: 'Job logs loaded', detail: `${logs.length} log${logs.length === 1 ? '' : 's'}` });
      return logs;
    },
  }),

  cancelJob: tool({
    description: 'Cancel one ZilMate background job by id. Requires confirmation.',
    inputSchema: z.object({
      id: z.string().min(3),
    }),
    execute: async ({ id }) => {
      const approved = await confirmJobAction('Cancel job', [`Job: ${id}`]);
      if (!approved) throw new Error('Blocked cancelling job. Ask the user to approve cancelling it.');

      emitProgress({ type: 'tool:start', label: 'Cancelling job', detail: id });
      const job = await updateJobStatus(id, 'cancelled', { completedAt: new Date().toISOString() });
      if (job) await appendJobLog(id, 'info', 'Job cancelled by agent.');
      emitProgress({ type: 'tool:end', label: job ? 'Job cancelled' : 'Job not found', detail: id });
      return job;
    },
  }),
};
