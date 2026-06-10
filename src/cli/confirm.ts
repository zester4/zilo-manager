import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import chalk from 'chalk';
import type { ConfirmationHandler } from '../runtime/confirm.js';

export function createReadlineConfirmation(rl: readline.Interface): ConfirmationHandler {
  return async ({ toolkitSlug, toolSlug, summary, action, access, targetTools, details }) => {
    console.log(chalk.yellow(`\nZilMate wants to use ${toolkitSlug}`));
    console.log(`${chalk.gray('Action:')} ${action || 'External app action'}`);
    console.log(`${chalk.gray('Access:')} ${access || 'Write'}`);
    console.log(`${chalk.gray('Tool:')} ${(targetTools && targetTools.length > 0) ? targetTools.join(', ') : toolSlug}`);
    if (details && details.length > 0) {
      console.log(chalk.gray('Details:'));
      for (const detail of details) console.log(`- ${detail}`);
    } else {
      console.log(`${chalk.gray('Details:')} ${summary}`);
    }
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
