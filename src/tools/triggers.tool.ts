import { tool } from 'ai';
import { z } from 'zod';
import { env } from '../config/env.js';
import { getComposioTriggerClient, parseLimit } from '../cli/triggers.js';
import { requestConfirmation } from '../runtime/confirm.js';
import { emitProgress } from '../runtime/progress.js';

const triggerConfigSchema = z.record(z.string(), z.unknown());

function compactJson(value: unknown) {
  const text = JSON.stringify(value);
  return text.length > 220 ? `${text.slice(0, 217)}...` : text;
}

export const triggerTools = {
  listTriggerTypes: tool({
    description: 'List available Composio trigger types, optionally filtered by toolkit slug such as github, gmail, or slack. Use this before creating triggers; do not guess trigger slugs.',
    inputSchema: z.object({
      toolkit: z.string().min(1).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    execute: async ({ toolkit, limit }) => {
      emitProgress(toolkit
        ? { type: 'search:start', label: 'Listing trigger types', detail: toolkit }
        : { type: 'search:start', label: 'Listing trigger types' });
      const client = getComposioTriggerClient();
      const result = await client.triggers.listTypes({
        limit: parseLimit(limit, 25),
        ...(toolkit ? { toolkits: [toolkit] } : {}),
      });
      emitProgress({ type: 'search:end', label: 'Trigger types listed', detail: `${result.items.length} item${result.items.length === 1 ? '' : 's'}` });
      return result;
    },
  }),

  showTriggerType: tool({
    description: 'Show one Composio trigger type schema, including required config and event payload. Use before creating a trigger.',
    inputSchema: z.object({
      triggerSlug: z.string().min(3),
    }),
    execute: async ({ triggerSlug }) => {
      emitProgress({ type: 'fetch:start', label: 'Loading trigger schema', detail: triggerSlug });
      const client = getComposioTriggerClient();
      const result = await client.triggers.getType(triggerSlug);
      emitProgress({ type: 'fetch:end', label: 'Trigger schema loaded', detail: result.toolkit.slug });
      return result;
    },
  }),

  listTriggers: tool({
    description: 'List active Composio trigger instances for this ZilMate user/project.',
    inputSchema: z.object({
      limit: z.number().int().min(1).max(100).optional(),
      showDisabled: z.boolean().optional(),
    }),
    execute: async ({ limit, showDisabled }) => {
      emitProgress({ type: 'fetch:start', label: 'Listing trigger instances' });
      const client = getComposioTriggerClient();
      const result = await client.triggers.listActive({
        limit: parseLimit(limit, 25),
        ...(showDisabled ? { showDisabled: true } : {}),
      });
      emitProgress({ type: 'fetch:end', label: 'Trigger instances listed', detail: `${result.items.length} item${result.items.length === 1 ? '' : 's'}` });
      return result;
    },
  }),

  createTrigger: tool({
    description: 'Create a Composio trigger instance after inspecting trigger schema. Requires user confirmation unless dryRun is true.',
    inputSchema: z.object({
      triggerSlug: z.string().min(3),
      triggerConfig: triggerConfigSchema.optional(),
      connectedAccountId: z.string().min(1).optional(),
      dryRun: z.boolean().optional(),
    }),
    execute: async ({ triggerSlug, triggerConfig, connectedAccountId, dryRun }) => {
      if (!env.zilmateUserId) throw new Error('Missing ZILMATE_USER_ID. Run `zilmate setup` first.');
      const payload = {
        userId: env.zilmateUserId,
        triggerSlug,
        ...(connectedAccountId ? { connectedAccountId } : {}),
        ...(triggerConfig && Object.keys(triggerConfig).length > 0 ? { triggerConfig } : {}),
      };

      if (dryRun) return { dryRun: true, ...payload };

      const approved = await requestConfirmation({
        toolkitSlug: 'COMPOSIO',
        toolSlug: 'CREATE_TRIGGER',
        action: `Create trigger ${triggerSlug}`,
        access: 'Write',
        targetTools: ['CREATE_TRIGGER'],
        details: [
          `Trigger: ${triggerSlug}`,
          ...(connectedAccountId ? [`Connected account: ${connectedAccountId}`] : []),
          `Config: ${compactJson(triggerConfig ?? {})}`,
        ],
        summary: compactJson(payload),
      });

      if (!approved) {
        throw new Error(`Blocked trigger creation for ${triggerSlug}. Run interactively and answer y to approve it.`);
      }

      emitProgress({ type: 'tool:start', label: 'Creating trigger', detail: triggerSlug });
      const client = getComposioTriggerClient();
      const result = await client.triggers.create(env.zilmateUserId, triggerSlug, {
        ...(connectedAccountId ? { connectedAccountId } : {}),
        ...(triggerConfig && Object.keys(triggerConfig).length > 0 ? { triggerConfig } : {}),
      });
      emitProgress({ type: 'tool:end', label: 'Trigger created', detail: result.triggerId });
      return result;
    },
  }),
};
