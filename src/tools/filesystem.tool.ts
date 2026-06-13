import { tool } from 'ai';
import { z } from 'zod';
import { copyFile, mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

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
    description: 'Write or append text to a file inside allowed ZilMate file roots.',
    inputSchema: z.object({
      path: z.string().min(1),
      content: z.string(),
      mode: z.enum(['overwrite', 'append']).optional(),
    }),
    execute: async ({ path: filePath, content, mode }) => {
      const resolved = assertSafePath(filePath);
      await mkdir(path.dirname(resolved), { recursive: true });
      await writeFile(resolved, content, { encoding: 'utf8', flag: mode === 'append' ? 'a' : 'w' });
      emitProgress({ type: 'tool:end', label: 'File written', detail: relativeDisplay(resolved) });
      return { path: relativeDisplay(resolved), bytes: Buffer.byteLength(content, 'utf8'), mode: mode ?? 'overwrite' };
    },
  }),

  createFolder: tool({
    description: 'Create a folder inside allowed ZilMate file roots.',
    inputSchema: z.object({ path: z.string().min(1) }),
    execute: async ({ path: folderPath }) => {
      const resolved = assertSafePath(folderPath);
      await mkdir(resolved, { recursive: true });
      emitProgress({ type: 'tool:end', label: 'Folder created', detail: relativeDisplay(resolved) });
      return { path: relativeDisplay(resolved), created: true };
    },
  }),

  moveCopyRename: tool({
    description: 'Move, copy, or rename a file/folder inside allowed ZilMate file roots.',
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

  deleteFile: tool({
    description: 'Delete a single file inside allowed ZilMate file roots. Requires explicit file path (not glob). Cannot be undone.',
    inputSchema: z.object({
      path: z.string().min(1).describe('Exact file path to delete'),
      confirm: z.boolean().describe('Must be true to actually delete (safety measure)'),
    }),
    execute: async ({ path: filePath, confirm }) => {
      if (!confirm) throw new Error('Deletion requires confirm=true to prevent accidental data loss');
      const resolved = assertSafePath(filePath);
      const info = await stat(resolved);
      if (!info.isFile()) throw new Error('Path is not a file.');
      await unlink(resolved);
      emitProgress({ type: 'tool:end', label: 'File deleted', detail: relativeDisplay(resolved) });
      return { deleted: true, path: relativeDisplay(resolved), size: info.size };
    },
  }),

  deleteFolder: tool({
    description: 'Delete a folder and all its contents inside allowed ZilMate file roots. Requires explicit folder path. Cannot be undone.',
    inputSchema: z.object({
      path: z.string().min(1).describe('Exact folder path to delete'),
      confirm: z.boolean().describe('Must be true to actually delete (safety measure)'),
    }),
    execute: async ({ path: folderPath, confirm }) => {
      if (!confirm) throw new Error('Deletion requires confirm=true to prevent accidental data loss');
      const resolved = assertSafePath(folderPath);
      const info = await stat(resolved);
      if (!info.isDirectory()) throw new Error('Path is not a directory.');
      
      const { rm } = await import('node:fs/promises');
      await rm(resolved, { recursive: true, force: true });
      emitProgress({ type: 'tool:end', label: 'Folder deleted', detail: relativeDisplay(resolved) });
      return { deleted: true, path: relativeDisplay(resolved) };
    },
  }),

  listDirectory: tool({
    description: 'List files and folders in a directory with details (name, type, size, modified date). Supports filtering and sorting.',
    inputSchema: z.object({
      path: z.string().min(1).describe('Directory path to list'),
      filter: z.string().optional().describe('Filter by name (partial match, case-insensitive)'),
      includeHidden: z.boolean().optional().describe('Include dot-files/hidden files (default: false)'),
      maxDepth: z.number().int().min(1).max(5).optional().describe('How many levels deep to list (default: 1 = current level only)'),
      limit: z.number().int().min(1).max(500).optional().describe('Max entries to return (default: 100)'),
    }),
    execute: async ({ path: dirPath, filter, includeHidden, maxDepth, limit }) => {
      const resolved = assertSafePath(dirPath);
      const info = await stat(resolved);
      if (!info.isDirectory()) throw new Error('Path is not a directory.');

      const entries = await walk(resolved, { 
        maxDepth: maxDepth ?? 1, 
        maxEntries: limit ?? 100 
      });

      let filtered = entries;
      if (!includeHidden) {
        filtered = filtered.filter(e => !e.path.split(/[\\/]/).some(p => p.startsWith('.')));
      }
      if (filter) {
        const lowerFilter = filter.toLowerCase();
        filtered = filtered.filter(e => e.path.toLowerCase().includes(lowerFilter));
      }

      emitProgress({ type: 'fetch:end', label: 'Directory listed', detail: relativeDisplay(resolved) });
      
      return {
        directory: relativeDisplay(resolved),
        entries: filtered.slice(0, limit ?? 100),
        count: filtered.length,
        filtered: !!filter,
      };
    },
  }),

  getFileInfo: tool({
    description: 'Get detailed metadata about a file: size, modified date, created date, permissions, type, etc.',
    inputSchema: z.object({
      path: z.string().min(1).describe('File or folder path'),
    }),
    execute: async ({ path: filePath }) => {
      const resolved = assertSafePath(filePath);
      const info = await stat(resolved);
      const { size, atimeMs, mtimeMs, birthtimeMs, mode } = info;

      return {
        path: relativeDisplay(resolved),
        type: info.isDirectory() ? 'directory' : 'file',
        size,
        sizeKB: (size / 1024).toFixed(2),
        sizeMB: (size / (1024 ** 2)).toFixed(2),
        created: new Date(birthtimeMs).toISOString(),
        modified: new Date(mtimeMs).toISOString(),
        accessed: new Date(atimeMs).toISOString(),
        isFile: info.isFile(),
        isDirectory: info.isDirectory(),
        isSymlink: info.isSymbolicLink(),
        mode: mode?.toString(8),
      };
    },
  }),
};
