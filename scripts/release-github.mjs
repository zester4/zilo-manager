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

ZilMate ${tag} — Chat SDK listener, multi-platform messaging, and TypeScript hardening.

## Install

\`\`\`powershell
npm install -g zilmate@${version}
zilmate setup
zilmate doctor --live
zilmate talk
\`\`\`

## Highlights

- **Chat SDK Listener** — \`zilmate chat listen\` starts a persistent listener for Slack, Telegram, and iMessage using the Chat SDK. Incoming @-mentions are routed through the ZilMate manager agent and replies are posted back to the thread.
- **Multi-platform setup** — \`zilmate chat setup\` interactive wizard for Slack bot tokens, Telegram bot tokens, and iMessage (local macOS DB or remote Sendblue). Also supports noninteractive \`--flags\`.
- **Chat subcommand group** — \`zilmate chat setup\`, \`zilmate chat listen\`, and \`zilmate chat msg "hello"\` (one-shot) under a single \`chat\` namespace. Also aliased as \`npm run chat\`.
- **TS error fixes** — resolved 6 TypeScript errors across adapter configs, Message/Thread API surface, and strict optional property types.
- **Memory state adapter** — uses \`@chat-adapter/state-memory\` for in-process subscription/lock/dedupe storage during \`chat listen\`.

## Quick Checks

\`\`\`powershell
zilmate chat setup
zilmate chat listen
zilmate chat msg "hello"
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
