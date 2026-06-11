import { tool } from 'ai';
import { z } from 'zod';
import { copyFile, mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { requestConfirmation } from '../runtime/confirm.js';
import { emitProgress } from '../runtime/progress.js';
import { readJson, writeJson } from '../memory/local-store.js';

type FileSnapshot = Record<string, { size: number; modifiedAt: number; type: 'file' | 'directory' }>;

const watchFile = 'filesystem-watch.json';
const defaultMaxReadBytes = 180_000;
const ignoredDirectoryNames = new Set(['.git', 'node_modules', 'dist', '.next', '.npm-cache', '.zilo-manager', 'outputs']);
const sensitiveNamePattern = /(^\.env(?:\..*)?$|\.pem$|\.key$|\.p12$|\.pfx$|id_rsa|id_dsa|credentials|secrets?|token)/i;

function allowedRoots() {
  const configured = (process.env.ZILMATE_FILE_ROOTS || '')
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
  return [process.cwd(), ...configured].map((root) => path.resolve(root));
}

function insideRoot(resolved: string, root: string) {
  return resolved === root || resolved.startsWith(`${root}${path.sep}`);
}

function assertSafePath(inputPath: string, options: { allowSensitive?: boolean } = {}) {
  const resolved = path.resolve(inputPath);
  const roots = allowedRoots();
  if (!roots.some((root) => insideRoot(resolved, root))) {
    throw new Error(`Path is outside allowed ZilMate file roots: ${resolved}`);
  }

  const parts = resolved.split(/[\\/]/);
  if (parts.some((part) => ignoredDirectoryNames.has(part))) {
    throw new Error(`Path is inside an ignored directory: ${resolved}`);
  }

  if (!options.allowSensitive && parts.some((part) => sensitiveNamePattern.test(part))) {
    throw new Error(`Path looks sensitive and cannot be accessed by file tools: ${resolved}`);
  }

  return resolved;
}

function relativeDisplay(resolved: string) {
  const root = allowedRoots().find((item) => insideRoot(resolved, item));
  return root ? path.relative(root, resolved) || '.' : resolved;
}

async function confirmFileAction(action: string, details: string[]) {
  return requestConfirmation({
    toolkitSlug: 'ZILMATE',
    toolSlug: 'FILESYSTEM',
    action,
    access: 'Write',
    targetTools: ['ZILMATE_FILESYSTEM'],
    details,
    summary: details.join('; '),
  });
}

async function walk(rootPath: string, options: { maxDepth?: number; maxEntries?: number } = {}) {
  const maxDepth = options.maxDepth ?? 4;
  const maxEntries = options.maxEntries ?? 200;
  const results: Array<{ path: string; absolutePath: string; type: 'file' | 'directory'; size: number; modifiedAt: string }> = [];

  async function visit(current: string, depth: number) {
    if (results.length >= maxEntries) return;
    const info = await stat(current);
    const type = info.isDirectory() ? 'directory' : 'file';
    results.push({
      path: relativeDisplay(current),
      absolutePath: current,
      type,
      size: info.size,
      modifiedAt: info.mtime.toISOString(),
    });

    if (!info.isDirectory() || depth >= maxDepth) return;
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= maxEntries) return;
      if (ignoredDirectoryNames.has(entry.name) || sensitiveNamePattern.test(entry.name)) continue;
      await visit(path.join(current, entry.name), depth + 1);
    }
  }

  await visit(rootPath, 0);
  return results;
}

async function snapshot(rootPath: string, maxDepth = 4) {
  const entries = await walk(rootPath, { maxDepth, maxEntries: 1000 });
  return Object.fromEntries(entries.map((entry) => [
    entry.path,
    {
      size: entry.size,
      modifiedAt: new Date(entry.modifiedAt).getTime(),
      type: entry.type,
    },
  ])) as FileSnapshot;
}

function summarizeText(content: string) {
  const cleaned = content.replace(/\s+/g, ' ').trim();
  const sentences = cleaned.match(/[^.!?\n]+[.!?]?/g) ?? [];
  const preview = sentences.slice(0, 8).join(' ').slice(0, 2400);
  const words = cleaned ? cleaned.split(/\s+/).length : 0;
  return {
    characters: content.length,
    words,
    summary: preview || cleaned.slice(0, 1200),
  };
}

export const fileSystemTools = {
  searchFiles: tool({
    description: 'Search file and folder names, and optionally text content, inside allowed ZilMate file roots. Skips sensitive files, node_modules, .git, dist, and caches.',
    inputSchema: z.object({
      query: z.string().min(1),
      root: z.string().optional().describe('Folder to search. Defaults to the current working directory.'),
      includeContent: z.boolean().optional(),
      maxDepth: z.number().int().min(0).max(8).optional(),
      maxResults: z.number().int().min(1).max(200).optional(),
    }),
    execute: async ({ query, root, includeContent, maxDepth, maxResults }) => {
      const searchRoot = assertSafePath(root || process.cwd());
      emitProgress({ type: 'search:start', label: 'Searching files', detail: query });
      const entries = await walk(searchRoot, { maxDepth: maxDepth ?? 5, maxEntries: 1000 });
      const normalized = query.toLowerCase();
      const matches = [];
      for (const entry of entries) {
        if (matches.length >= (maxResults ?? 50)) break;
        const nameMatch = entry.path.toLowerCase().includes(normalized);
        let contentMatch = false;
        let excerpt = '';
        if (!nameMatch && includeContent && entry.type === 'file' && entry.size <= defaultMaxReadBytes) {
          try {
            const content = await readFile(entry.absolutePath, 'utf8');
            const index = content.toLowerCase().indexOf(normalized);
            contentMatch = index >= 0;
            if (contentMatch) excerpt = content.slice(Math.max(0, index - 120), index + query.length + 220);
          } catch {
            contentMatch = false;
          }
        }
        if (nameMatch || contentMatch) matches.push({ ...entry, match: nameMatch ? 'name' : 'content', excerpt });
      }
      emitProgress({ type: 'search:end', label: 'File search complete', detail: `${matches.length} result${matches.length === 1 ? '' : 's'}` });
      return matches;
    },
  }),

  readFile: tool({
    description: 'Read a text file inside allowed ZilMate file roots. Sensitive files such as .env, keys, credentials, and tokens are blocked.',
    inputSchema: z.object({
      path: z.string().min(1),
      maxBytes: z.number().int().min(1000).max(500_000).optional(),
    }),
    execute: async ({ path: filePath, maxBytes }) => {
      const resolved = assertSafePath(filePath);
      const info = await stat(resolved);
      if (!info.isFile()) throw new Error('Path is not a file.');
      const limit = maxBytes ?? defaultMaxReadBytes;
      const content = await readFile(resolved, 'utf8');
      const truncated = Buffer.byteLength(content, 'utf8') > limit;
      emitProgress({ type: 'fetch:end', label: 'File read', detail: relativeDisplay(resolved) });
      return {
        path: relativeDisplay(resolved),
        size: info.size,
        modifiedAt: info.mtime.toISOString(),
        truncated,
        content: truncated ? content.slice(0, limit) : content,
      };
    },
  }),

  writeFile: tool({
    description: 'Write or append text to a file inside allowed ZilMate file roots. Requires user confirmation.',
    inputSchema: z.object({
      path: z.string().min(1),
      content: z.string(),
      mode: z.enum(['overwrite', 'append']).optional(),
    }),
    execute: async ({ path: filePath, content, mode }) => {
      const resolved = assertSafePath(filePath);
      const approved = await confirmFileAction(mode === 'append' ? 'Append file' : 'Write file', [
        `Path: ${relativeDisplay(resolved)}`,
        `Mode: ${mode ?? 'overwrite'}`,
        `Bytes: ${Buffer.byteLength(content, 'utf8')}`,
      ]);
      if (!approved) throw new Error('Blocked file write. Ask the user to approve writing this file.');
      await mkdir(path.dirname(resolved), { recursive: true });
      await writeFile(resolved, content, { encoding: 'utf8', flag: mode === 'append' ? 'a' : 'w' });
      emitProgress({ type: 'tool:end', label: 'File written', detail: relativeDisplay(resolved) });
      return { path: relativeDisplay(resolved), bytes: Buffer.byteLength(content, 'utf8'), mode: mode ?? 'overwrite' };
    },
  }),

  createFolder: tool({
    description: 'Create a folder inside allowed ZilMate file roots. Requires user confirmation.',
    inputSchema: z.object({ path: z.string().min(1) }),
    execute: async ({ path: folderPath }) => {
      const resolved = assertSafePath(folderPath);
      const approved = await confirmFileAction('Create folder', [`Path: ${relativeDisplay(resolved)}`]);
      if (!approved) throw new Error('Blocked folder creation. Ask the user to approve creating this folder.');
      await mkdir(resolved, { recursive: true });
      emitProgress({ type: 'tool:end', label: 'Folder created', detail: relativeDisplay(resolved) });
      return { path: relativeDisplay(resolved), created: true };
    },
  }),

  moveCopyRename: tool({
    description: 'Move, copy, or rename a file/folder inside allowed ZilMate file roots. Requires user confirmation.',
    inputSchema: z.object({
      operation: z.enum(['move', 'copy', 'rename']),
      from: z.string().min(1),
      to: z.string().min(1),
      overwrite: z.boolean().optional(),
    }),
    execute: async ({ operation, from, to, overwrite }) => {
      const source = assertSafePath(from);
      const target = assertSafePath(to);
      if (!existsSync(source)) throw new Error('Source path does not exist.');
      if (existsSync(target) && !overwrite) throw new Error('Target already exists. Set overwrite=true if the user explicitly approves replacing it.');
      const approved = await confirmFileAction(operation, [`From: ${relativeDisplay(source)}`, `To: ${relativeDisplay(target)}`, `Overwrite: ${overwrite ? 'yes' : 'no'}`]);
      if (!approved) throw new Error(`Blocked ${operation}. Ask the user to approve this file operation.`);
      await mkdir(path.dirname(target), { recursive: true });
      if (existsSync(target) && overwrite) await unlink(target);
      if (operation === 'copy') {
        await copyFile(source, target);
      } else {
        await rename(source, target);
      }
      emitProgress({ type: 'tool:end', label: `File ${operation} complete`, detail: relativeDisplay(target) });
      return { operation, from: relativeDisplay(source), to: relativeDisplay(target) };
    },
  }),

  summarizeDocument: tool({
    description: 'Read and summarize a text-like document inside allowed ZilMate file roots. Supports plain text, markdown, JSON, CSV, and code files.',
    inputSchema: z.object({
      path: z.string().min(1),
      maxBytes: z.number().int().min(1000).max(500_000).optional(),
    }),
    execute: async ({ path: filePath, maxBytes }) => {
      const resolved = assertSafePath(filePath);
      const content = await readFile(resolved, 'utf8');
      const limit = maxBytes ?? 300_000;
      const sliced = content.length > limit ? content.slice(0, limit) : content;
      const summary = summarizeText(sliced);
      emitProgress({ type: 'fetch:end', label: 'Document summarized', detail: relativeDisplay(resolved) });
      return { path: relativeDisplay(resolved), truncated: content.length > limit, ...summary };
    },
  }),

  watchFolderChanges: tool({
    description: 'Snapshot a folder and report changes since the previous snapshot. This is a local compare-watch, not a background daemon.',
    inputSchema: z.object({
      path: z.string().optional(),
      watchName: z.string().min(1).max(80).optional(),
      reset: z.boolean().optional(),
      maxDepth: z.number().int().min(0).max(8).optional(),
    }),
    execute: async ({ path: folderPath, watchName, reset, maxDepth }) => {
      const root = assertSafePath(folderPath || process.cwd());
      const key = watchName || relativeDisplay(root) || 'default';
      const store = await readJson<Record<string, FileSnapshot>>(watchFile, {});
      const current = await snapshot(root, maxDepth ?? 4);
      const previous = reset ? undefined : store[key];
      store[key] = current;
      await writeJson(watchFile, store);

      if (!previous) return { watchName: key, baselineSaved: true, added: [], changed: [], removed: [] };

      const added = Object.keys(current).filter((item) => !previous[item]);
      const removed = Object.keys(previous).filter((item) => !current[item]);
      const changed = Object.keys(current).filter((item) => previous[item] && (previous[item].size !== current[item]!.size || previous[item].modifiedAt !== current[item]!.modifiedAt));
      return { watchName: key, baselineSaved: true, added, changed, removed };
    },
  }),

  findDuplicateLargeFiles: tool({
    description: 'Find large files and likely duplicate files by size inside allowed ZilMate file roots. Skips sensitive files and dependency/build folders.',
    inputSchema: z.object({
      root: z.string().optional(),
      minSizeBytes: z.number().int().min(1).optional(),
      maxDepth: z.number().int().min(0).max(8).optional(),
      maxResults: z.number().int().min(1).max(200).optional(),
    }),
    execute: async ({ root, minSizeBytes, maxDepth, maxResults }) => {
      const searchRoot = assertSafePath(root || process.cwd());
      const entries = (await walk(searchRoot, { maxDepth: maxDepth ?? 6, maxEntries: 2000 })).filter((entry) => entry.type === 'file');
      const minSize = minSizeBytes ?? 1_000_000;
      const large = entries
        .filter((entry) => entry.size >= minSize)
        .sort((a, b) => b.size - a.size)
        .slice(0, maxResults ?? 50);
      const bySize = new Map<number, typeof entries>();
      for (const entry of entries) bySize.set(entry.size, [...(bySize.get(entry.size) ?? []), entry]);
      const duplicates = [...bySize.entries()]
        .filter(([, items]) => items.length > 1)
        .map(([size, items]) => ({ size, files: items.map((item) => item.path) }))
        .slice(0, maxResults ?? 50);
      return { large, duplicateSizeGroups: duplicates };
    },
  }),
};
