import type { IncomingTriggerPayload } from '@composio/core';
import { env } from '../config/env.js';
import { createJob } from './store.js';
import type { CreateJobInput, JobMetadata } from './types.js';

function compact(value: unknown, max = 1200) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function taskForTrigger(event: IncomingTriggerPayload) {
  const toolkit = event.toolkitSlug?.toLowerCase() || 'external app';
  const payload = compact(event.payload ?? {});
  const trigger = event.triggerSlug || 'unknown trigger';

  if (toolkit.includes('gmail')) {
    return `A Gmail trigger fired (${trigger}). Summarize the event, identify whether a reply or follow-up is needed, and draft a concise next action. Payload: ${payload}`;
  }
  if (toolkit.includes('github')) {
    return `A GitHub trigger fired (${trigger}). Summarize the repository event, explain what changed, and suggest any follow-up work. Payload: ${payload}`;
  }
  if (toolkit.includes('slack')) {
    return `A Slack trigger fired (${trigger}). Summarize the message/event, decide whether a response is needed, and draft a short reply if helpful. Payload: ${payload}`;
  }
  if (toolkit.includes('calendar')) {
    return `A calendar trigger fired (${trigger}). Prepare a useful briefing and any reminders or follow-up steps. Payload: ${payload}`;
  }

  return `An external app trigger fired (${trigger} from ${toolkit}). Summarize it and recommend the next action. Payload: ${payload}`;
}

export function triggerWorkflowsEnabled() {
  return env.zilmateTriggerWorkflowsEnabled;
}

export async function createJobFromComposioTrigger(event: IncomingTriggerPayload) {
  if (!triggerWorkflowsEnabled()) return null;
  const metadata: JobMetadata = {
    triggerId: event.id,
    triggerSlug: event.triggerSlug,
    toolkitSlug: event.toolkitSlug,
    userId: event.userId,
    payload: event.payload,
  };
  const input: CreateJobInput = {
    task: taskForTrigger(event),
    source: {
      type: 'composio-trigger',
      id: event.id,
      toolkitSlug: event.toolkitSlug,
      triggerSlug: event.triggerSlug,
    },
    metadata,
  };
  return createJob(input);
}
