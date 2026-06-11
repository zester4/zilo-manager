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
type InnerToolCall = {
  slug: string;
  arguments?: Record<string, unknown>;
};

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

function parseJsonish(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed || !/^[{[]/.test(trimmed)) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function findToolSlugs(value: unknown): string[] {
  if (typeof value === 'string') {
    const parsed = parseJsonish(value);
    if (parsed !== value) return findToolSlugs(parsed);
    return value.match(/[A-Z0-9]+_[A-Z0-9_]+/g) ?? [];
  }
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(findToolSlugs);

  const record = value as Record<string, unknown>;
  const direct = ['toolSlug', 'tool_slug', 'slug', 'tool'];
  const matches = direct.flatMap((field) => findToolSlugs(record[field]));
  return [...matches, ...Object.values(record).flatMap(findToolSlugs)];
}

function getStringField(record: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  const parsed = typeof value === 'string' ? parseJsonish(value) : value;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  return parsed as Record<string, unknown>;
}

function extractInnerTools(params: unknown): InnerToolCall[] {
  const record = asRecord(params);
  if (!record) return [];
  const rawTools = record.tools ?? record.tool_calls ?? record.toolCalls;
  const parsedTools = typeof rawTools === 'string' ? parseJsonish(rawTools) : rawTools;
  if (!Array.isArray(parsedTools)) return [];

  return parsedTools
    .map((item) => {
      const tool = asRecord(item);
      if (!tool) return null;
      const slug = getStringField(tool, ['tool_slug', 'toolSlug', 'slug', 'tool']);
      if (!slug) return null;
      const rawArguments = tool.arguments ?? tool.args ?? tool.input;
      const args = asRecord(rawArguments);
      return {
        slug,
        ...(args ? { arguments: args } : {}),
      } satisfies InnerToolCall;
    })
    .filter((tool): tool is InnerToolCall => Boolean(tool));
}

function classifyTool(toolSlug: string, params: unknown) {
  const upper = toolSlug.toUpperCase();
  if (safeMetaTools.has(upper)) return 'read';
  if (upper === 'COMPOSIO_MULTI_EXECUTE_TOOL') {
    const inner = extractInnerTools(params).map((toolCall) => toolCall.slug);
    const slugs = [...new Set(inner.length > 0 ? inner : findToolSlugs(params))].filter((slug) => slug.toUpperCase() !== upper);
    if (slugs.length === 0) return 'write';
    return slugs.every(isReadOnlyTool) ? 'read' : 'write';
  }
  if (isWriteLikeTool(upper)) return 'write';
  if (isReadOnlyTool(upper)) return 'read';
  return 'write';
}

function labelFromToolSlug(toolSlug: string) {
  const [, ...parts] = toolSlug.toLowerCase().split('_');
  return parts.length > 0
    ? parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
    : toolSlug;
}

function summarizeValue(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'string') return value.length > 80 ? `${value.slice(0, 77)}...` : value;
  if (typeof value === 'number') return String(value);
  try {
    const json = JSON.stringify(value);
    return json.length > 80 ? `${json.slice(0, 77)}...` : json;
  } catch {
    return String(value);
  }
}

function friendlyDetails(toolCall: InnerToolCall) {
  const args = toolCall.arguments ?? {};
  const preferred = ['to', 'recipient', 'subject', 'query', 'max_results', 'limit', 'user_id', 'include_payload', 'verbose'];
  const entries = [
    ...preferred.filter((key) => key in args).map((key) => [key, args[key]] as const),
    ...Object.entries(args).filter(([key]) => !preferred.includes(key)).slice(0, 6),
  ];

  return entries
    .map(([key, value]) => {
      const summarized = summarizeValue(value);
      if (!summarized) return null;
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
      return `${label}: ${summarized}`;
    })
    .filter((item): item is string => Boolean(item))
    .slice(0, 8);
}

function createConfirmationDisplay(toolkitSlug: string, toolSlug: string, params: unknown) {
  const innerTools = toolSlug.toUpperCase() === 'COMPOSIO_MULTI_EXECUTE_TOOL' ? extractInnerTools(params) : [];
  const targetTools = innerTools.length > 0 ? innerTools.map((toolCall) => toolCall.slug) : [toolSlug];
  const fallbackArgs = asRecord(params);
  const primary: InnerToolCall = innerTools[0] ?? {
    slug: toolSlug,
    ...(fallbackArgs ? { arguments: fallbackArgs } : {}),
  };
  const writeTools = targetTools.filter((slug) => !isReadOnlyTool(slug));
  const details = innerTools.length === 1 ? friendlyDetails(primary) : innerTools.map((toolCall) => `${toolCall.slug}: ${labelFromToolSlug(toolCall.slug)}`);

  return {
    toolkitSlug: innerTools.length === 1 ? innerTools[0]!.slug.split('_')[0] || toolkitSlug : toolkitSlug,
    toolSlug,
    targetTools,
    action: innerTools.length === 1
      ? labelFromToolSlug(primary.slug)
      : `Run ${targetTools.length} external app action${targetTools.length === 1 ? '' : 's'}`,
    access: writeTools.length === 0 ? 'Read-only' as const : 'Write' as const,
    details,
    summary: details.length > 0 ? details.join('; ') : 'External app action',
  };
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
        ...createConfirmationDisplay(toolkitSlug, toolSlug, params),
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
  try {
    const { session, reused } = await getOrCreateSession(chatSessionId);
    const tools = await session.tools(executionGuard());
    emitProgress({ type: 'tool:end', label: reused ? 'Composio session reused' : 'Composio session created', detail: session.sessionId });
    return tools;
  } catch (error) {
    emitProgress({ type: 'tool:error', label: 'Composio tools unavailable', detail: error instanceof Error ? error.message : String(error) });
    return {};
  }
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

  let session: Awaited<ReturnType<typeof getOrCreateSession>>['session'];
  let reused = false;
  try {
    const result = await getOrCreateSession(chatSessionId);
    session = result.session;
    reused = result.reused;
  } catch (error) {
    emitProgress({ type: 'tool:error', label: 'Composio session unavailable', detail: error instanceof Error ? error.message : String(error) });
    return status;
  }
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
