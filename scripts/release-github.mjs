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

ZilMate ${tag} — Advanced Cascaded Voice Session system, featuring ultra-low latency, custom speaking speeds, keyword boosting, and turn-based barge-in interruptions.

## Install

\`\`\`powershell
npm install -g zilmate@${version}
zilmate setup
zilmate doctor
zilmate menu
\`\`\`

## Highlights

- **Ultra-Low Latency Streaming Playback** — Tuned underlying \`ffplay\` configuration parameters (\`-fflags nobuffer+fastseek -flags low_delay -strict experimental\`) to minimize streaming audio latency during Text-To-Speech.
- **Turn-Based Conversational Barge-In** — Integrated real-time turn tracking and a user-speaking event hook (\`SpeechStarted\`). Speaking instantly kills any active audio output processes (\`SIGKILL\`), cuts off assistant audio, and invalidates/discards stale ongoing background agent reasoning turns.
- **Custom Speaking Speeds** — Added \`ZILMATE_VOICE_TTS_SPEED\` supporting speed adjustments natively in Deepgram live TTS stream configurations (values \`0.7\` to \`1.5\`).
- **Keyword Boosting** — Introduced \`ZILMATE_VOICE_LISTEN_KEYWORDS\` to feed comma-separated word arrays directly to Deepgram's live Speech-To-Text connection, improving CLI voice command recognition.
- **Type-Safe Full Build Validation** — Cleanly compiled under strict TypeScript compiler rules.

## Quick Checks

\`\`\`powershell
zilmate voice doctor
zilmate voice devices
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
