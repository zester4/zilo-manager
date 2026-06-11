import type { ProgressEvent } from '../runtime/progress.js';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type JobSource = {
  type: 'manual' | 'schedule' | 'composio-trigger' | 'api';
  id?: string;
  toolkitSlug?: string;
  triggerSlug?: string;
};

export type JobMetadata = Record<string, unknown>;

export type ZilMateJob = {
  id: string;
  task: string;
  status: JobStatus;
  schedule?: string;
  source: JobSource;
  metadata: JobMetadata;
  createdAt: string;
  updatedAt: string;
  runAt?: string;
  nextRunAt?: string;
  lastRunAt?: string;
  completedAt?: string;
  attempts: number;
  maxAttempts: number;
  qstashScheduleId?: string;
  result?: string;
  error?: string;
};

export type JobLogLevel = 'info' | 'progress' | 'error' | 'result';

export type JobLog = {
  id: string;
  jobId: string;
  createdAt: string;
  level: JobLogLevel;
  message: string;
  event?: ProgressEvent;
  data?: unknown;
};

export type CreateJobInput = {
  task: string;
  schedule?: string;
  source?: JobSource;
  metadata?: JobMetadata;
  runAt?: string | Date;
  maxAttempts?: number;
};

export type ListJobsOptions = {
  status?: JobStatus;
  limit?: number;
};

export type RunJobOptions = {
  rescheduleRecurring?: boolean;
};
