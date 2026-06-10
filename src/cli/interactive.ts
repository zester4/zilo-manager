import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { randomUUID } from 'node:crypto';
import { requireGatewayAuth } from '../config/env.js';
import { runManager } from '../agents/manager.js';
import { loadTurns, saveTurns, type ChatTurn } from '../memory/history.js';
import { recall } from '../memory/long-term.js';
import { memoryBackendName } from '../memory/redis.js';
import { printAssistant, printProgress, printStatus, printTitle, printUserPrompt } from './format.js';
import { createReadlineConfirmation } from './confirm.js';

function transcript(turns: ChatTurn[]) {
  if (turns.length === 0) return '';
  return turns
    .slice(-10)
    .map((turn) => `${turn.role === 'user' ? 'User' : 'ZilMate'}: ${turn.content}`)
    .join('\n');
}

function memoryBlock(memories: Awaited<ReturnType<typeof recall>>) {
  if (memories.length === 0) return '';
  return memories.map((memory) => `- [${memory.id}] ${memory.text}${memory.tags.length ? ` (tags: ${memory.tags.join(', ')})` : ''}`).join('\n');
}

export async function startInteractiveChat(sessionId = 'default') {
  requireGatewayAuth();
  const rl = readline.createInterface({ input, output });
  let turns = await loadTurns(sessionId);
  const runId = randomUUID();

  printTitle('ZilMate interactive chat', 'Persistent manager chat with subagent delegation');
  printStatus('Session:', sessionId);
  printStatus('Memory:', memoryBackendName());
  printStatus('Run:', runId);
  console.log('Type /exit to quit, /clear to clear this session, or /help for commands.\n');

  try {
    while (true) {
      let answer: string;
      try {
        answer = await rl.question(printUserPrompt());
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/readline was closed|aborted/i.test(message)) break;
        throw error;
      }
      const message = answer.trim();
      if (!message) continue;
      if (message === '/exit' || message === '/quit') break;
      if (message === '/help') {
        console.log('Commands: /exit, /quit, /clear, /help');
        continue;
      }
      if (message === '/clear') {
        turns = [];
        await saveTurns(sessionId, turns);
        console.log('Session cleared.');
        continue;
      }

      const context = transcript(turns);
      const relevantMemory = memoryBlock(await recall(message, 6));
      const prompt = context
        ? `Conversation so far:\n${context}\n\n${relevantMemory ? `Relevant long-term memory:\n${relevantMemory}\n\n` : ''}New user message:\n${message}\n\nAnswer as ZilMate. Delegate to subagents when useful and return a concise final answer.`
        : `${relevantMemory ? `Relevant long-term memory:\n${relevantMemory}\n\n` : ''}${message}\n\nAnswer as ZilMate. Delegate to subagents when useful and return a concise final answer.`;

      const response = await runManager(prompt, {
        progress: printProgress,
        sessionId,
        confirm: createReadlineConfirmation(rl),
      });
      printAssistant(response);

      turns.push(
        { role: 'user', content: message, createdAt: new Date().toISOString() },
        { role: 'assistant', content: response, createdAt: new Date().toISOString() },
      );
      await saveTurns(sessionId, turns);
    }
  } finally {
    rl.close();
  }
}



