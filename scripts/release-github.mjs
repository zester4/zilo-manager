import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const version = pkg.version;
const tag = `v${version}`;
const title = `ZilMate ${tag}`;

const notes = `# ${title}

ZilMate ${tag} is the latest npm release for the CLI and server SDK.

## Install

\`\`\`powershell
npm install -g zilmate@${version}
zilmate setup
zilmate doctor
\`\`\`

## Highlights

- Polished CLI welcome screen, guided menu, richer tables, and health checks.
- Server SDK export through \`zilmate/server\` for Next.js apps, API routes, dashboards, and workers.
- Background jobs with local storage fallback, optional Redis storage, worker processing, schedules, logs, and status commands.
- Optional QStash webhook support for hosted scheduled delivery.
- Composio trigger-to-job workflow handling for external app events.
- More capable ZilMate specialist agents: automation planner, personal assistant, and developer helper.
- Manager and subagent tool limits tuned for longer, more useful work.
- Session-level approval support so trusted actions can be accepted for the current session.

## Quick Checks

\`\`\`powershell
zilmate --version
zilmate menu
zilmate jobs list
zilmate memory
\`\`\`

## npm

Published package: \`zilmate@${version}\`
`;

const run = (command, commandArgs, options = {}) => {
  return execFileSync(command, commandArgs, {
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
    ...options,
  });
};

if (dryRun) {
  console.log(`Tag: ${tag}`);
  console.log(`Title: ${title}`);
  console.log('');
  console.log(notes);
  process.exit(0);
}

try {
  run('gh', ['auth', 'status'], { stdio: 'pipe' });
} catch {
  console.error('GitHub CLI is not authenticated. Run: gh auth login -h github.com');
  process.exit(1);
}

const notesPath = join(tmpdir(), `zilmate-${version}-github-release.md`);
writeFileSync(notesPath, notes);

run(
  'gh',
  [
    'release',
    'create',
    tag,
    '--repo',
    'zester4/zilo-manager',
    '--title',
    title,
    '--notes-file',
    notesPath,
    '--latest',
  ],
  { stdio: 'inherit' },
);
