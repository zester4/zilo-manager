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

ZilMate ${tag} — Upgrade to the latest Composio Core SDK (v0.13.1) and Composio Vercel AI SDK adapter (v0.11.0) to eliminate version-mismatch alerts and resolve workspace tool integration/execution bugs.

## Install

\`\`\`powershell
npm install -g zilmate@${version}
zilmate setup
zilmate doctor
zilmate menu
\`\`\`

## Highlights

- **SDK Upgrade: Composio Core & Vercel Integration** — Upgraded \`@composio/core\` to \`0.13.1\` and \`@composio/vercel\` to \`0.11.0\` globally. This resolves the CLI version deprecation warnings ("composio-core is behind") and inherits the latest tool registry optimizations, performance fixes, and enhanced error handling in external multi-agent action integrations.
- **Cloudflare Tunnel Auto-Setup** — Designed a zero-configuration downloader and manager for \`cloudflared\` binary blobs (platform-specific for Windows, macOS, Linux). Automatically fetches, places, and grants execute permissions to the tunnel binary so that running \`zilmate jobs listen --tunnel\` works instantly without manual downloads.
- **Interactive Safety Checklists** — Replaced raw prompt confirmation text with a rich interactive terminal TUI containing arrow-key selections and toggleable checkboxes. Safely view, toggle, and approve specific multi-specialist tool executions inline.
- **Persistent Thinking Status Card** — Created an anchored, rotating thinking status widget pinned cleanly to the bottom of the terminal during chat cycles. Shows active elapsed thinking time and shortcuts while logs/conversations scroll smoothly above it.
- **High-Fidelity PDF Document Generation** — Solved layout drift and text alignment issues in \`pdfkit\` document generation. Rebuilt lists to use hanging indents with multi-line wrap-margins, stabilized alternating row backgrounds in tables, and preserved boundary word spacing.
- **Optimized HTTP Gateway Handshakes** — Programmed a custom \`undici\` agent configuration that extends Vercel AI SDK client connections and payload downloads up to 15 minutes globally, completely defeating socket timeout failures.

## Quick Checks

\`\`\`powershell
zilmate setup
zilmate doctor
zilmate menu
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
