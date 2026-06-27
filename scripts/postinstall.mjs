// postinstall.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';

const candidates = [
  path.join(homedir(), 'ZilMate'),
  path.join(homedir(), 'Downloads', 'ZilMate'),
];

let root = process.env.ZILMATE_WORKSPACE?.trim()
  ? path.resolve(process.env.ZILMATE_WORKSPACE.trim())
  : null;

if (!root) {
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      root = candidate;
      break;
    }
  }
}
if (!root) {
  root = path.join(homedir(), 'ZilMate');
}

const dirs = [
  root,
  path.join(root, 'skills'),
  path.join(root, 'outputs', 'osint'),
  path.join(root, 'outputs', 'pentest'),
  path.join(root, 'outputs', 'images'),
  path.join(root, 'logs'),
  path.join(root, 'projects'),
  path.join(root, 'attachments'),
  path.join(root, 'backups'),
  path.join(root, 'config'),
  path.join(root, 'scratch'),
  path.join(root, 'data'),
];

for (const dir of dirs) {
  await mkdir(dir, { recursive: true });
}

const notebook = path.join(root, 'notebook.md');
if (!existsSync(notebook)) {
  await writeFile(notebook, '# ZilMate Notebook\n\n', 'utf8');
}

const memory = path.join(root, 'memory.json');
if (!existsSync(memory)) {
  await writeFile(memory, '[]\n', 'utf8');
}

console.log(`ZilMate workspace ready at ${root}`);
