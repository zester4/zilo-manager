import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import chalk from 'chalk';
import type { ConfirmationHandler } from '../runtime/confirm.js';

export function createReadlineConfirmation(rl: readline.Interface): ConfirmationHandler {
  return async ({ toolkitSlug, toolSlug, summary }) => {
    console.log(chalk.yellow('\nComposio wants to run a write-like external app action.'));
    console.log(`${chalk.gray('Toolkit:')} ${toolkitSlug}`);
    console.log(`${chalk.gray('Tool:')} ${toolSlug}`);
    console.log(`${chalk.gray('Summary:')} ${summary}`);
    const answer = (await rl.question('Proceed? (y/N) ')).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  };
}

export function createTerminalConfirmation(): ConfirmationHandler {
  return async (request) => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
    const rl = readline.createInterface({ input, output });
    try {
      return await createReadlineConfirmation(rl)(request);
    } finally {
      rl.close();
    }
  };
}
