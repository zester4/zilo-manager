import { randomUUID } from 'node:crypto';
import { readJson, writeJson } from './local-store.js';
import { getRedis } from './redis.js';

const memoryKey = 'zilo-manager:memory:v1';
const memoryFile = 'memory.json';

export type LongTermMemory = {
  id: string;
  text: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

function normalize(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function scoreMemory(memory: LongTermMemory, terms: string[]) {
  const body = normalize(`${memory.text} ${memory.tags.join(' ')}`);
  return terms.reduce((score, term) => score + (body.includes(term) ? 1 : 0), 0);
}

export async function listMemories() {
  const redis = getRedis();
  if (redis) return (await redis.get<LongTermMemory[]>(memoryKey)) ?? [];
  return readJson<LongTermMemory[]>(memoryFile, []);
}

async function saveMemories(memories: LongTermMemory[]) {
  const sorted = memories.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const redis = getRedis();
  if (redis) {
    await redis.set(memoryKey, sorted);
    return;
  }
  await writeJson(memoryFile, sorted);
}

export async function remember(text: string, tags: string[] = []) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Memory text cannot be blank.');

  const now = new Date().toISOString();
  const memory: LongTermMemory = {
    id: randomUUID().slice(0, 8),
    text: trimmed,
    tags: tags.map((tag) => tag.trim()).filter(Boolean),
    createdAt: now,
    updatedAt: now,
  };

  const memories = await listMemories();
  await saveMemories([...memories, memory]);
  return memory;
}

export async function recall(query = '', limit = 8) {
  const memories = await listMemories();
  const terms = normalize(query).split(' ').filter((term) => term.length > 2);
  if (terms.length === 0) return memories.slice(-limit).reverse();

  return memories
    .map((memory) => ({ memory, score: scoreMemory(memory, terms) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.memory.updatedAt.localeCompare(a.memory.updatedAt))
    .slice(0, limit)
    .map((item) => item.memory);
}

export async function forget(id: string) {
  const memories = await listMemories();
  const remaining = memories.filter((memory) => memory.id !== id);
  if (remaining.length === memories.length) return false;
  await saveMemories(remaining);
  return true;
}

export async function clearMemories() {
  await saveMemories([]);
}
