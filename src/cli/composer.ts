// src/cli/composer.ts
import readline from 'node:readline/promises';
import { theme, termWidth, boxLine } from './theme.js';

export async function readComposerLine(
  rl: readline.Interface,
  placeholder = 'Try "plan my week" or "build a Next.js dashboard"',
): Promise<string> {
  const w = termWidth(92);
  console.log('');
  console.log(boxLine('top', w));
  console.log(theme.accent('│ ') + theme.dim(placeholder));
  const answer = await rl.question(theme.accent('│ ') + theme.brandBright('> '));

  // Clear the input area (placeholder, top line, user input, and extra newline)
  // so we can replace it with the nicely formatted wrapped box in printUserTurn
  process.stdout.write('\x1b[1A\x1b[2K\x1b[1A\x1b[2K\x1b[1A\x1b[2K\x1b[1A\x1b[2K');

  return answer;
}
