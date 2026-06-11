import { env, hasQStash } from '../config/env.js';
import { qstashCron } from './schedule.js';
import { appendJobLog, saveJob } from './store.js';
import type { ZilMateJob } from './types.js';

export async function registerQStashSchedule(job: ZilMateJob) {
  if (!hasQStash() || !job.schedule) return job;
  const cron = qstashCron(job.schedule);
  if (!cron) {
    await appendJobLog(job.id, 'info', `QStash skipped; schedule "${job.schedule}" is local-only.`);
    return job;
  }

  const endpoint = env.zilmatePublicJobWebhookUrl!;
  const url = `https://qstash.upstash.io/v2/schedules/${encodeURIComponent(endpoint)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.upstashQstashToken}`,
      'Content-Type': 'application/json',
      'Upstash-Cron': cron,
      ...(env.zilmateJobWebhookSecret ? { 'ZilMate-Webhook-Secret': env.zilmateJobWebhookSecret } : {}),
    },
    body: JSON.stringify({ jobId: job.id }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    await appendJobLog(job.id, 'error', `QStash registration failed: ${detail}`);
    return job;
  }

  const result = await response.json().catch(() => ({})) as { scheduleId?: string };
  const updated = await saveJob({
    ...job,
    ...(result.scheduleId ? { qstashScheduleId: result.scheduleId } : {}),
  });
  await appendJobLog(job.id, 'info', result.scheduleId ? `QStash schedule registered: ${result.scheduleId}` : 'QStash schedule registered.');
  return updated;
}
