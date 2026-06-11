import chalk from 'chalk';
import { runManager } from '../agents/manager.js';
import { printPanel, printProgress, printTable } from './format.js';
import { checkVoiceRuntime, getVoiceConfig, startDeepgramVoiceAgentSession } from '../voice/deepgram.js';
import type { ZilMateVoiceEvent } from '../voice/types.js';

function yesNo(value: boolean) {
  return value ? 'yes' : 'no';
}

export function printVoiceConfig() {
  const config = getVoiceConfig();
  printPanel('Realtime voice', [
    ['Enabled', yesNo(config.enabled)],
    ['Configured', yesNo(config.configured)],
    ['Mode', config.mode],
    ['Listen model', `${config.listenModel} (${config.listenVersion})`],
    ['TTS model', config.ttsModel],
    ['Language', config.language],
    ['Language hints', config.languageHints.join(', ') || '-'],
    ['Barge-in', yesNo(config.bargeIn)],
  ]);
}

export async function runVoiceDoctor() {
  const checks = await checkVoiceRuntime();
  printTable(['Check', 'Status', 'Detail'], checks.map((check) => [
    check.name,
    check.ok ? 'pass' : 'warn',
    check.detail,
  ]));
}

export async function runVoiceTurn(message: string, sessionId = 'voice-default') {
  printProgress({ type: 'thinking', label: 'Voice brain turn', detail: 'Routing transcript through ZilMate manager' });
  const text = await runManager(message, { sessionId, progress: printProgress });
  console.log(chalk.bold.cyan('\nZilMate voice reply'));
  console.log(text);
}

export async function runVoiceAgentProbe() {
  const events: ZilMateVoiceEvent[] = [];
  await startDeepgramVoiceAgentSession({
    onEvent: (event) => {
      events.push(event);
      if (event.type === 'error') {
        console.log(chalk.red(`! ${event.message}`));
      } else if (event.type === 'status') {
        console.log(chalk.gray(`${event.label}${event.detail ? ` — ${event.detail}` : ''}`));
      } else if (event.type === 'transcript') {
        console.log(`${chalk.cyan(event.role)} ${event.text}`);
      } else {
        console.log(chalk.gray(`audio ${event.bytes} bytes`));
      }
    },
  });

  if (events.length === 0) {
    console.log(chalk.yellow('No voice events received.'));
  }
}
