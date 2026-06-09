import { Composio, type SessionMetaToolOptions } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { env, hasComposio } from '../config/env.js';
import { loadComposioSession, saveComposioSession } from '../memory/composio-session.js';
import { requestConfirmation } from '../runtime/confirm.js';
import { emitProgress } from '../runtime/progress.js';

const safeMetaTools = new Set([
  'COMPOSIO_SEARCH_TOOLS',
  'COMPOSIO_GET_TOOL_SCHEMAS',
  'COMPOSIO_MANAGE_CONNECTIONS',
]);

const readPrefixes = ['GET', 'LIST', 'SEARCH', 'READ', 'FETCH', 'RETRIEVE', 'INSPECT'];
const writeFragments = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'SEND',
  'POST',
  'PUBLISH',
  'INVITE',
  'TRANSFER',
  'CHARGE',
  'REFUND',
  'CANCEL',
  'APPROVE',
  'REVOKE',
  'EXECUTE',
  'WORKBENCH',
  'BASH',
];

type ComposioClient = Composio<VercelProvider>;

let client: ComposioClient | undefined;

function getClient() {
  if (client) return client;
  client = new Composio({
    provider: new VercelProvider(),
    apiKey: env.composioApiKey ?? null,
  });
  return client;
}

function actionPart(toolSlug: string) {
  return toolSlug.toUpperCase().split('_').slice(1).join('_') || toolSlug.toUpperCase();
}

function isReadOnlyTool(toolSlug: string) {
  if (safeMetaTools.has(toolSlug.toUpperCase())) return true;
  const action = actionPart(toolSlug);
  return readPrefixes.some((prefix) => action === prefix || action.startsWith(`${prefix}_`));
}

function isWriteLikeTool(toolSlug: string) {
  const upper = toolSlug.toUpperCase();
  if (upper.includes('REMOTE_WORKBENCH') || upper.includes('REMOTE_BASH')) return true;
  return writeFragments.some((fragment) => upper.includes(fragment));
}

function findToolSlugs(value: unknown): string[] {
  if (typeof value === 'string') return /^[A-Z0-9]+_[A-Z0-9_]+$/.test(value) ? [value] : [];
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(findToolSlugs);

  const record = value as Record<string, unknown>;
  const direct = ['toolSlug', 'tool_slug', 'slug', 'tool'];
  const matches = direct.flatMap((field) => findToolSlugs(record[field]));
  return [...matches, ...Object.values(record).flatMap(findToolSlugs)];
}

function classifyTool(toolSlug: string, params: unknown) {
  const upper = toolSlug.toUpperCase();
  if (safeMetaTools.has(upper)) return 'read';
  if (upper === 'COMPOSIO_MULTI_EXECUTE_TOOL') {
    const slugs = [...new Set(findToolSlugs(params))].filter((slug) => slug.toUpperCase() !== upper);
    if (slugs.length === 0) return 'write';
    return slugs.every(isReadOnlyTool) ? 'read' : 'write';
  }
  if (isWriteLikeTool(upper)) return 'write';
  if (isReadOnlyTool(upper)) return 'read';
  return 'write';
}

function summarizeParams(params: unknown) {
  try {
    const json = JSON.stringify(params);
    if (!json) return 'External app action';
    return json.length > 180 ? `${json.slice(0, 177)}...` : json;
  } catch {
    return 'External app action';
  }
}

async function getOrCreateSession(chatSessionId: string) {
  const composio = getClient();
  const saved = await loadComposioSession(chatSessionId);

  if (saved?.sessionId) {
    try {
      const session = await composio.use(saved.sessionId);
      return { session, reused: true };
    } catch {
      emitProgress({ type: 'tool:error', label: 'Composio session reuse failed', detail: 'Creating a fresh session' });
    }
  }

  const session = await composio.create(env.zilmateUserId!);
  await saveComposioSession(chatSessionId, session.sessionId);
  return { session, reused: false };
}

function executionGuard(): SessionMetaToolOptions {
  return {
    beforeExecute: async ({ toolSlug, toolkitSlug, params }) => {
      const classification = classifyTool(toolSlug, params);
      if (classification === 'read') return params;

      const approved = await requestConfirmation({
        toolkitSlug,
        toolSlug,
        summary: summarizeParams(params),
      });

      if (!approved) {
        throw new Error(`Blocked Composio write-like action ${toolkitSlug}/${toolSlug}. Run interactively and answer y to approve it.`);
      }

      return params;
    },
  };
}

export async function createComposioTools(chatSessionId = 'default') {
  if (!hasComposio()) return {};

  emitProgress({ type: 'tool:start', label: 'Loading Composio tools', detail: chatSessionId });
  const { session, reused } = await getOrCreateSession(chatSessionId);
  const tools = await session.tools(executionGuard());
  emitProgress({ type: 'tool:end', label: reused ? 'Composio session reused' : 'Composio session created', detail: session.sessionId });
  return tools;
}

export async function getComposioStatus(chatSessionId = 'default') {
  const configured = hasComposio();
  const status = {
    configured,
    userId: env.zilmateUserId || null,
    sessionId: null as string | null,
    reusedSession: false,
    toolkits: [] as Array<{ slug: string; name: string; isNoAuth: boolean; connected: boolean; status?: string }>,
  };

  if (!configured) return status;

  const { session, reused } = await getOrCreateSession(chatSessionId);
  status.sessionId = session.sessionId;
  status.reusedSession = reused;

  try {
    const toolkits = await session.toolkits({ limit: 25 });
    status.toolkits = toolkits.items.map((item) => ({
      slug: item.slug,
      name: item.name,
      isNoAuth: item.isNoAuth,
      connected: Boolean(item.connection?.isActive || item.isNoAuth),
      ...(item.connection?.connectedAccount?.status ? { status: item.connection.connectedAccount.status } : {}),
    }));
  } catch (error) {
    emitProgress({ type: 'tool:error', label: 'Composio toolkit status unavailable', detail: error instanceof Error ? error.message : String(error) });
  }

  return status;
}
