import { tool } from 'ai';
import { z } from 'zod';
import { forget, listMemories, recall, remember } from '../memory/long-term.js';
import { emitProgress } from '../runtime/progress.js';

export const memoryTools = {
  rememberMemory: tool({
    description: 'Save a durable long-term memory for ZilMate. Use for stable user preferences, durable project facts, and recurring context.',
    inputSchema: z.object({
      text: z.string().min(3).max(2000),
      tags: z.array(z.string().min(1).max(40)).max(8).optional(),
    }),
    execute: async ({ text, tags }) => {
      emitProgress({ type: 'fetch:start', label: 'Saving memory' });
      const memory = await remember(text, tags ?? []);
      emitProgress({ type: 'fetch:end', label: 'Memory saved', detail: memory.id });
      return memory;
    },
  }),
  recallMemory: tool({
    description: 'Recall durable long-term ZilMate memories by query. Use before answering when user preferences or recurring project facts may matter.',
    inputSchema: z.object({
      query: z.string().max(500).optional(),
      limit: z.number().int().min(1).max(12).optional(),
    }),
    execute: async ({ query, limit }) => {
      emitProgress(query ? { type: 'fetch:start', label: 'Recalling memory', detail: query } : { type: 'fetch:start', label: 'Recalling memory' });
      const memories = await recall(query ?? '', limit ?? 8);
      emitProgress({ type: 'fetch:end', label: 'Memory recalled', detail: `${memories.length} item${memories.length === 1 ? '' : 's'}` });
      return memories;
    },
  }),
  listMemory: tool({
    description: 'List all durable long-term memories saved for ZilMate.',
    inputSchema: z.object({}),
    execute: async () => {
      emitProgress({ type: 'fetch:start', label: 'Listing memory' });
      const memories = await listMemories();
      emitProgress({ type: 'fetch:end', label: 'Memory listed', detail: `${memories.length} item${memories.length === 1 ? '' : 's'}` });
      return memories;
    },
  }),
  forgetMemory: tool({
    description: 'Forget one durable long-term memory by id.',
    inputSchema: z.object({ id: z.string().min(1) }),
    execute: async ({ id }) => {
      emitProgress({ type: 'fetch:start', label: 'Forgetting memory', detail: id });
      const deleted = await forget(id);
      emitProgress({ type: 'fetch:end', label: deleted ? 'Memory forgotten' : 'Memory not found', detail: id });
      return { id, deleted };
    },
  }),
};
