import { startFooter, setFooterSession } from './footer.js';
import { cliSettings, type LogLevel } from './settings.js';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { models } from '../config/models.js';
import { runManager } from '../agents/manager.js';
import { theme } from './theme.js';
import { printProgress } from './format.js';
import { workspaceLayout } from '../workspace/paths.js';
import { recall } from '../memory/long-term.js';
import { runSwarmCli } from './swarm.js';
import { createReadlineConfirmation } from './confirm.js';
import { runHeal } from '../memory/heal.js';
import { printAssistantTurn, printUserTurn, printWelcomeCard, printTips } from './render.js';
import { printModelBrowser, runModelPicker } from './models.js';
import { withAskHandler } from '../runtime/ask.js';
import { createReadlineAskHandler } from './ask.js';
import { runTerminalVoiceLive } from './voice.js';

type Turn = {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

async function loadTurns(sessionId: string): Promise<Turn[]> {
  const file = path.join(workspaceLayout().scratch, `chat-${sessionId}.json`);
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return [];
  }
}

async function saveTurns(sessionId: string, turns: Turn[]) {
  const file = path.join(workspaceLayout().scratch, `chat-${sessionId}.json`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(turns, null, 2), 'utf8');
}

function transcript(turns: Turn[]) {
  return turns.map((t) => `[${t.role.toUpperCase()}] ${t.content}`).join('\n\n');
}

function memoryBlock(memories: any[]) {
  if (memories.length === 0) return '';
  return memories.map((m) => `- ${m.text}`).join('\n');
}

export async function startInteractiveChat(options: { sessionId?: string } = {}) {
  const sessionId = options.sessionId || randomUUID();
  setFooterSession(sessionId);
  const stopFooter = startFooter();

  const historyFile = workspaceLayout().history;
  let history: string[] = [];
  if (existsSync(historyFile)) {
    history = (await readFile(historyFile, 'utf8')).split('\n').filter(Boolean).slice(-100);
  }

  const completer = (line: string): [string[], string] => {
    const completions = ['/exit', '/quit', '/clear', '/help', '/voice', '/swarm', '/model', '/model pick', '/model next', '/heal', '/log', '/paste'];
    const hits = completions.filter((c) => c.startsWith(line));
    return [hits.length ? hits : completions, line];
  };

  let rl = readline.createInterface({
    input,
    output,
    history: history,
    historySize: 100,
    completer,
  });
  let turns = await loadTurns(sessionId);
  let voiceMode = false;
  let modelBrowser = { provider: undefined as string | undefined, page: 1 };

  printWelcomeCard({
    cwd: process.cwd(),
    sessionId,
    model: models.manager,
    workspace: workspaceLayout().root,
  });
  printTips();
  console.log(theme.muted('Commands: /exit · /clear · /help · /voice · /model · /model pick · /log · /paste\n'));

  try {
    while (true) {
      const message = (await rl.question(theme.brand('You> '))).trim();

      if (message === '/exit' || message === '/quit') break;
      if (message === '/help') {
        console.log(`\n${theme.brandBright('ZilMate Interactive Commands:')}`);
        console.log(`  ${theme.brand('/exit')}        Quit`);
        console.log(`  ${theme.brand('/clear')}       Clear session history`);
        console.log(`  ${theme.brand('/paste')}       Enter multiline mode (paste text)`);
        console.log(`  ${theme.brand('/swarm')}       Launch Digital Corporation task`);
        console.log(`  ${theme.brand('/voice')}       Start live voice mode`);
        console.log(`  ${theme.brand('/model')}       Browse AI Gateway models`);
        console.log(`  ${theme.brand('/model pick')} [query]  Choose models (filtered by provider)`);
        console.log(`  ${theme.brand('/model next')}  Next model page`);
        console.log(`  ${theme.brand('/log')}         Toggle log levels (QUIET/NORMAL/TRACE)`);
        console.log(`  ${theme.brand('/heal')}        Run session retrospection`);
        console.log(theme.muted('Tip: Use "\\" at the end of a line for simple multiline input.'));
        continue;
      }

      if (message === '/log') {
        const levels: LogLevel[] = ['quiet', 'normal', 'trace'];
        const next = levels[(levels.indexOf(cliSettings.logLevel) + 1) % levels.length]!;
        cliSettings.logLevel = next;
        console.log(`\n${theme.brand('Log level set to:')} ${next.toUpperCase()}`);
        continue;
      }

      if (message === '/swarm' || message.startsWith('/swarm ')) {
        const swarmTask = message.slice('/swarm'.length).trim();
        if (!swarmTask) {
          console.log(theme.warn('Provide a business task, e.g. /swarm "Analyze our Q1 revenue trends"'));
          continue;
        }
        await runSwarmCli(swarmTask, { session: sessionId });
        continue;
      }
      if (message === '/model' || message.startsWith('/model ')) {
        const rawQuery = message.slice('/model'.length).trim();
        if (rawQuery === 'next') {
          modelBrowser.page += 1;
        } else {
          modelBrowser.provider = rawQuery || undefined;
          modelBrowser.page = 1;
        }
        const result = await printModelBrowser({ provider: modelBrowser.provider as any, page: modelBrowser.page });
        if (result.page >= result.totalPages) modelBrowser.page = 0;
        continue;
      }
      if (message === '/model pick' || message.startsWith('/model pick ')) {
        try {
          const pickQuery = message.slice('/model pick'.length).trim();
          await runModelPicker(pickQuery || undefined);
        } catch (error) {
          console.log(error instanceof Error ? error.message : String(error));
        }
        continue;
      }
      if (message === '/heal') {
        console.log(theme.thinking('Running heal pass...'));
        const result = await runHeal({
          sessionId,
          sessionSummary: transcript(turns.slice(-10)),
        });
        console.log(theme.ok('Heal pass complete. Learnings saved to notebook.'));
        console.log(theme.muted(`Notebook: ${result.notebookPath}`));
        continue;
      }
      if (message === '/voice' || message === '/voice on' || message === '/voice start') {
        voiceMode = true;
        const { getVoiceConfig } = await import('../voice/deepgram.js');
        const config = getVoiceConfig();
        if (!config.enabled) {
          console.log(theme.warn('Voice is not enabled. Run "zilmate setup" or "zilmate voice-setup" first.'));
          continue;
        }
        console.log(theme.text(`Voice mode · ${config.listenModel} → ${config.ttsModel}`));
        rl.close();
        try {
          const command = await runTerminalVoiceLive(sessionId);
          turns = await loadTurns(sessionId);
          if (command === 'exit') break;
        } catch (error) {
          console.log(error instanceof Error ? error.message : String(error));
        }
        rl = readline.createInterface({
          input,
          output,
          history: (await readFile(historyFile, 'utf8')).split('\n').filter(Boolean).slice(-100),
          historySize: 100,
          completer,
        });
        continue;
      }
      if (message === '/clear') {
        turns = [];
        await saveTurns(sessionId, turns);
        console.log(theme.ok('Session cleared.'));
        continue;
      }

      if (!message) continue;

      printUserTurn(message);

      const context = transcript(turns);
      const relevantMemory = memoryBlock(await recall(message, 6));
      const voiceInstruction = voiceMode
        ? 'This is a voice-mode turn. Answer in a natural spoken style: brief, direct, conversational, and easy to listen to.'
        : 'Answer as ZilMate. Delegate to subagents when useful and return a concise final answer.';
      const prompt = context
        ? `Conversation so far:\n${context}\n\n${relevantMemory ? `Relevant long-term memory:\n${relevantMemory}\n\n` : ''}New user message:\n${message}\n\n${voiceInstruction}`
        : `${relevantMemory ? `Relevant long-term memory:\n${relevantMemory}\n\n` : ''}${message}\n\n${voiceInstruction}`;

      const response = await withAskHandler(createReadlineAskHandler(rl), () =>
        runManager(prompt, {
          progress: printProgress,
          sessionId,
          confirm: createReadlineConfirmation(rl),
        }),
      );
      printAssistantTurn(response);

      turns.push(
        { role: 'user', content: message, createdAt: new Date().toISOString() },
        { role: 'assistant', content: response, createdAt: new Date().toISOString() },
      );
      await saveTurns(sessionId, turns);
    }
  } finally {
    stopFooter();
    rl.close();
  }
}
