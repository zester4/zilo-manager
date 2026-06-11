import { randomUUID } from 'node:crypto';
import { readJson, writeJson } from '../memory/local-store.js';
import { getRedis } from '../memory/redis.js';
import { nextRunFromSchedule } from './schedule.js';
import type { CreateJobInput, JobLog, JobLogLevel, JobStatus, ListJobsOptions, ZilMateJob } from './types.js';

const jobsFile = 'jobs.json';
const logsFile = 'job-logs.json';
const jobsIndexKey = 'zilo-manager:jobs:v1';
const jobKey = (id: string) => `zilo-manager:job:${id}`;
const jobLogsKey = (id: string) => `zilo-manager:job-logs:${id}`;

function now() {
  return new Date().toISOString();
}

function normalizeLimit(limit: number | undefined) {
  return Number.isFinite(limit) && limit && limit > 0 ? Math.min(Math.floor(limit), 200) : 25;
}

async function readLocalJobs() {
  return readJson<ZilMateJob[]>(jobsFile, []);
}

async function writeLocalJobs(jobs: ZilMateJob[]) {
  await writeJson(jobsFile, jobs);
}

async function readLocalLogs() {
  return readJson<Record<string, JobLog[]>>(logsFile, {});
}

async function writeLocalLogs(logs: Record<string, JobLog[]>) {
  await writeJson(logsFile, logs);
}

export async function createJob(input: CreateJobInput) {
  const createdAt = now();
  const runAt = input.runAt instanceof Date
    ? input.runAt.toISOString()
    : input.runAt || nextRunFromSchedule(input.schedule) || createdAt;
  const job: ZilMateJob = {
    id: `job_${randomUUID()}`,
    task: input.task,
    status: 'queued',
    ...(input.schedule ? { schedule: input.schedule } : {}),
    source: input.source ?? { type: input.schedule ? 'schedule' : 'manual' },
    metadata: input.metadata ?? {},
    createdAt,
    updatedAt: createdAt,
    runAt,
    nextRunAt: runAt,
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 3,
  };

  const redis = getRedis();
  if (redis) {
    const ids = (await redis.get<string[]>(jobsIndexKey)) ?? [];
    await redis.set(jobKey(job.id), job);
    await redis.set(jobsIndexKey, [job.id, ...ids.filter((id) => id !== job.id)].slice(0, 500));
  } else {
    const jobs = await readLocalJobs();
    await writeLocalJobs([job, ...jobs.filter((item) => item.id !== job.id)].slice(0, 500));
  }

  await appendJobLog(job.id, 'info', `Queued job: ${job.task}`, { source: job.source, metadata: job.metadata });
  return job;
}

export async function listJobs(options: ListJobsOptions = {}) {
  const limit = normalizeLimit(options.limit);
  const redis = getRedis();
  let jobs: ZilMateJob[];

  if (redis) {
    const ids = (await redis.get<string[]>(jobsIndexKey)) ?? [];
    const values = await Promise.all(ids.map((id) => redis.get<ZilMateJob>(jobKey(id))));
    jobs = values.filter((job): job is ZilMateJob => Boolean(job));
  } else {
    jobs = await readLocalJobs();
  }

  return jobs
    .filter((job) => !options.status || job.status === options.status)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

export async function getJob(id: string) {
  const redis = getRedis();
  if (redis) return redis.get<ZilMateJob>(jobKey(id));
  const jobs = await readLocalJobs();
  return jobs.find((job) => job.id === id) ?? null;
}

export async function saveJob(job: ZilMateJob) {
  const updated: ZilMateJob = { ...job, updatedAt: now() };
  const redis = getRedis();
  if (redis) {
    await redis.set(jobKey(updated.id), updated);
    const ids = (await redis.get<string[]>(jobsIndexKey)) ?? [];
    await redis.set(jobsIndexKey, [updated.id, ...ids.filter((id) => id !== updated.id)].slice(0, 500));
    return updated;
  }

  const jobs = await readLocalJobs();
  await writeLocalJobs([updated, ...jobs.filter((item) => item.id !== updated.id)].slice(0, 500));
  return updated;
}

export async function updateJobStatus(id: string, status: JobStatus, patch: Partial<ZilMateJob> = {}) {
  const job = await getJob(id);
  if (!job) return null;
  return saveJob({ ...job, ...patch, status });
}

export async function appendJobLog(jobId: string, level: JobLogLevel, message: string, data?: unknown) {
  const event = data && typeof data === 'object' && 'type' in data && 'label' in data ? data as JobLog['event'] : undefined;
  const log: JobLog = {
    id: `log_${randomUUID()}`,
    jobId,
    createdAt: now(),
    level,
    message,
    ...(event ? { event } : {}),
    ...(data !== undefined ? { data } : {}),
  };

  const redis = getRedis();
  if (redis) {
    const current = (await redis.get<JobLog[]>(jobLogsKey(jobId))) ?? [];
    await redis.set(jobLogsKey(jobId), [...current, log].slice(-500));
  } else {
    const logs = await readLocalLogs();
    logs[jobId] = [...(logs[jobId] ?? []), log].slice(-500);
    await writeLocalLogs(logs);
  }

  return log;
}

export async function getJobLogs(jobId: string) {
  const redis = getRedis();
  if (redis) return (await redis.get<JobLog[]>(jobLogsKey(jobId))) ?? [];
  const logs = await readLocalLogs();
  return logs[jobId] ?? [];
}
