import { readJson, writeJson } from './local-store.js';
import { getRedis } from './redis.js';

const composioSessionTtlSeconds = 60 * 60 * 24 * 30;

export type ComposioSessionRecord = {
  chatSessionId: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
};

function key(sessionId: string) {
  return `zilo-manager:composio-session:${sessionId}`;
}

function file(sessionId: string) {
  return `composio-session-${encodeURIComponent(sessionId)}.json`;
}

export async function loadComposioSession(chatSessionId: string) {
  const redis = getRedis();
  if (redis) return redis.get<ComposioSessionRecord>(key(chatSessionId));
  return readJson<ComposioSessionRecord | null>(file(chatSessionId), null);
}

export async function saveComposioSession(chatSessionId: string, sessionId: string) {
  const existing = await loadComposioSession(chatSessionId);
  const now = new Date().toISOString();
  const record: ComposioSessionRecord = {
    chatSessionId,
    sessionId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const redis = getRedis();
  if (redis) {
    await redis.set(key(chatSessionId), record, { ex: composioSessionTtlSeconds });
    return record;
  }

  await writeJson(file(chatSessionId), record);
  return record;
}
