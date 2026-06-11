import chalk from 'chalk';
import type { DoctorCheck } from './doctor.js';

export function printDoctorChecks(checks: DoctorCheck[]) {
  for (const check of checks) {
    const color = check.status === 'pass' ? chalk.green : check.status === 'warn' ? chalk.yellow : chalk.red;
    const label = color(check.status.toUpperCase().padEnd(4));
    const fix = check.status === 'fail' || check.status === 'warn' ? chalk.gray(suggestionFor(check.detail)) : '';
    console.log(`${label} ${chalk.bold(check.name)}: ${check.detail}${fix}`);
  }
}

function suggestionFor(detail: string) {
  if (/Missing AI_GATEWAY_API_KEY|No .env|run zilmate setup/i.test(detail)) return '  Run: zilmate setup';
  if (/Composio|COMPOSIO_API_KEY|ZILMATE_USER_ID/i.test(detail)) return '  Optional: zilmate setup';
  if (/Redis is partially/i.test(detail)) return '  Set both Redis URL and token, or leave both blank.';
  if (/QStash is partially/i.test(detail)) return '  Set QStash token and public webhook URL, or leave both blank.';
  if (/jobs are disabled/i.test(detail)) return '  Enable with: zilmate setup --jobs-enabled true';
  if (/Deepgram|Voice is enabled|voice is disabled|Realtime voice/i.test(detail)) return '  Optional: zilmate setup --voice-enabled true';
  return '';
}
