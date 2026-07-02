import readline from 'node:readline';
import type readlinePromises from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import chalk from 'chalk';
import type { ConfirmationHandler, ConfirmationRequest } from '../runtime/confirm.js';
import { hasSessionApproval } from '../runtime/confirm.js';
import { theme, wrapText } from './theme.js';
import { pauseThinkingTicker, resumeThinkingTicker } from './format.js';

function getSingleKey(): Promise<{ name: string; ctrl: boolean; shift: boolean; sequence: string }> {
  return new Promise((resolve) => {
    const onKey = (str: string, key: readline.Key) => {
      input.off('keypress', onKey);
      resolve({
        name: key?.name || '',
        ctrl: !!key?.ctrl,
        shift: !!key?.shift,
        sequence: str || ''
      });
    };
    input.on('keypress', onKey);
  });
}

function clearLines(count: number) {
  for (let i = 0; i < count; i += 1) {
    readline.moveCursor(output, 0, -1);
    readline.clearLine(output, 0);
  }
}

function renderFrame(
  request: ConfirmationRequest,
  N: number,
  cursor: number,
  activeButton: number,
  checked: Set<number>
): string[] {
  const { toolkitSlug, toolSlug, summary, action, access, targetTools } = request;
  const innerWidth = 70;
  const lines: string[] = [];

  // Top Border
  const topBorder = theme.accent(`╭─ ${chalk.bold('Tool Authorization')} ${'─'.repeat(innerWidth - 22)}╮`);
  lines.push(topBorder);

  // Spacing Row
  lines.push(theme.accent('│') + ' '.repeat(innerWidth) + theme.accent('│'));

  // Toolkit Row
  const toolkitLabel = '  ZilMate wants to use: ';
  const toolkitVal = toolkitSlug || 'local';
  const toolkitText = toolkitLabel + toolkitVal;
  const toolkitPad = ' '.repeat(Math.max(0, innerWidth - toolkitText.length));
  lines.push(
    theme.accent('│') + ' ' +
    toolkitLabel + chalk.cyan.bold(toolkitVal) +
    toolkitPad + ' ' + theme.accent('│')
  );

  // Action Row
  const actionLabel = '  Action: ';
  let actionVal = action || summary || 'External action';
  if (actionLabel.length + actionVal.length > innerWidth - 4) {
    actionVal = actionVal.slice(0, innerWidth - 4 - actionLabel.length - 3) + '...';
  }
  const actionText = actionLabel + actionVal;
  const actionPad = ' '.repeat(Math.max(0, innerWidth - actionText.length));
  lines.push(
    theme.accent('│') + ' ' +
    chalk.gray(actionLabel) + chalk.white(actionVal) +
    actionPad + ' ' + theme.accent('│')
  );

  // Access Row
  const accessLabel = '  Access: ';
  const accessVal = access || 'Write';
  const accessText = accessLabel + accessVal;
  const accessPad = ' '.repeat(Math.max(0, innerWidth - accessText.length));
  const accessColor = accessVal === 'Read-only' ? chalk.green : chalk.red;
  lines.push(
    theme.accent('│') + ' ' +
    chalk.gray(accessLabel) + accessColor(accessVal) +
    accessPad + ' ' + theme.accent('│')
  );

  // Tool Row
  const toolLabel = '  Tool:   ';
  const toolVal = (targetTools && targetTools.length > 0) ? targetTools.join(', ') : (toolSlug || 'action');
  let toolTextDisplay = toolVal;
  if (toolLabel.length + toolTextDisplay.length > innerWidth - 4) {
    toolTextDisplay = toolTextDisplay.slice(0, innerWidth - 4 - toolLabel.length - 3) + '...';
  }
  const toolText = toolLabel + toolTextDisplay;
  const toolPad = ' '.repeat(Math.max(0, innerWidth - toolText.length));
  lines.push(
    theme.accent('│') + ' ' +
    chalk.gray(toolLabel) + chalk.magenta(toolTextDisplay) +
    toolPad + ' ' + theme.accent('│')
  );

  // Spacing Row
  lines.push(theme.accent('│') + ' '.repeat(innerWidth) + theme.accent('│'));

  // Checklist or Summary Row
  if (N > 0) {
    // Middle divider with "Safety Checklist"
    const checklistDivider = theme.accent(`├─ ${chalk.bold('Safety Checklist')} ${'─'.repeat(innerWidth - 20)}┤`);
    lines.push(checklistDivider);

    // Prompt instructions Row
    const instText = '  Space to toggle checkbox · Arrow keys/Tab to move';
    const instPad = ' '.repeat(Math.max(0, innerWidth - instText.length));
    lines.push(
      theme.accent('│') + ' ' +
      chalk.gray(instText) +
      instPad + ' ' + theme.accent('│')
    );

    // Spacing Row
    lines.push(theme.accent('│') + ' '.repeat(innerWidth) + theme.accent('│'));

    // Render Checklist Items
    const items = request.details || [summary];
    items.forEach((detail: string, idx: number) => {
      const isChecked = checked.has(idx);
      const isActive = cursor === idx;

      // Wrap detail text to wrap within the box beautifully
      const wrapped = wrapText(detail, innerWidth - 8);
      wrapped.forEach((wLine, lineIdx) => {
        const isFirst = lineIdx === 0;
        let prefix = '';
        if (isFirst) {
          const box = isChecked ? chalk.green('[x]') : chalk.gray('[ ]');
          const pointer = isActive ? theme.brand('❯') : ' ';
          prefix = `${pointer} ${box} `;
        } else {
          prefix = '      ';
        }
        const textStyled = isActive ? chalk.bold.white(wLine) : chalk.gray(wLine);
        const plain = prefix + wLine;
        const pad = ' '.repeat(Math.max(0, innerWidth - plain.length));
        lines.push(
          theme.accent('│') + ' ' +
          prefix + textStyled +
          pad + ' ' + theme.accent('│')
        );
      });
    });
  } else {
    // If no details, just print summary in detail box
    const detailsDivider = theme.accent(`├─ ${chalk.bold('Details')} ${'─'.repeat(innerWidth - 11)}┤`);
    lines.push(detailsDivider);

    lines.push(theme.accent('│') + ' '.repeat(innerWidth) + theme.accent('│'));

    const wrapped = wrapText(summary, innerWidth - 4);
    wrapped.forEach((wLine) => {
      const plain = `  ${wLine}`;
      const pad = ' '.repeat(Math.max(0, innerWidth - plain.length));
      lines.push(
        theme.accent('│') + ' ' +
        chalk.gray(wLine) +
        pad + ' ' + theme.accent('│')
      );
    });
  }

  // Spacing Row
  lines.push(theme.accent('│') + ' '.repeat(innerWidth) + theme.accent('│'));

  // Decisions divider
  const decisionsDivider = theme.accent(`├─ ${chalk.bold('Decisions')} ${'─'.repeat(innerWidth - 13)}┤`);
  lines.push(decisionsDivider);

  // Spacing Row
  lines.push(theme.accent('│') + ' '.repeat(innerWidth) + theme.accent('│'));

  // Render Buttons
  const buttons = [
    { label: 'No (Deny)', activeColor: chalk.bold.red },
    { label: 'Yes (Once)', activeColor: chalk.bold.green },
    { label: 'Yes (Session)', activeColor: chalk.bold.magenta }
  ];

  const btnStrings = buttons.map((btn, idx) => {
    const active = cursor >= N && activeButton === idx;
    if (active) {
      return btn.activeColor(`❯ [ ${btn.label} ] ❮`);
    } else {
      return chalk.gray(`  [ ${btn.label} ]  `);
    }
  });

  const plainBtnStrings = buttons.map((btn, idx) => {
    const active = cursor >= N && activeButton === idx;
    return active ? `❯ [ ${btn.label} ] ❮` : `  [ ${btn.label} ]  `;
  });

  const plainLine = '  ' + plainBtnStrings.join('   ');
  const btnRowContent = '  ' + btnStrings.join('   ');
  const padSize = innerWidth - plainLine.length;
  const btnPad = ' '.repeat(Math.max(0, padSize));
  lines.push(
    theme.accent('│') + ' ' +
    btnRowContent +
    btnPad + ' ' + theme.accent('│')
  );

  // Spacing Row
  lines.push(theme.accent('│') + ' '.repeat(innerWidth) + theme.accent('│'));

  // Bottom Border
  const botBorder = theme.accent(`╰${'─'.repeat(innerWidth)}╯`);
  lines.push(botBorder);

  return lines;
}

async function runInteractiveConfirmation(request: ConfirmationRequest): Promise<boolean | 'session'> {
  const details = request.details || [];
  const N = details.length;
  
  let cursor = N > 0 ? 0 : 0;
  let activeButton = 1; // Default to Yes (Once)
  const checked = new Set<number>();
  
  for (let i = 0; i < N; i++) {
    checked.add(i);
  }

  // Draw initial frame
  let lines = renderFrame(request, N, cursor, activeButton, checked);
  lines.forEach(line => console.log(line));

  const wasRaw = input.isRaw;
  readline.emitKeypressEvents(input);
  if (input.isTTY) {
    input.setRawMode(true);
  }

  try {
    while (true) {
      const key = await getSingleKey();
      
      if (key.ctrl && key.name === 'c') {
        clearLines(lines.length);
        console.log(chalk.red('✗ Cancelled by user'));
        return false;
      }
      
      if (key.name === 'up') {
        if (N > 0) {
          if (cursor >= N) {
            cursor = N - 1;
          } else {
            cursor = cursor === 0 ? N + activeButton : cursor - 1;
          }
        }
      } else if (key.name === 'down') {
        if (N > 0) {
          if (cursor < N) {
            cursor = cursor === N - 1 ? N + activeButton : cursor + 1;
          } else {
            cursor = 0;
          }
        }
      } else if (key.name === 'left') {
        if (cursor >= N || N === 0) {
          activeButton = (activeButton - 1 + 3) % 3;
          cursor = N + activeButton;
        }
      } else if (key.name === 'right') {
        if (cursor >= N || N === 0) {
          activeButton = (activeButton + 1) % 3;
          cursor = N + activeButton;
        }
      } else if (key.name === 'tab') {
        if (N > 0) {
          if (key.shift) {
            if (cursor === 0) {
              activeButton = 2;
              cursor = N + activeButton;
            } else if (cursor >= N) {
              if (activeButton === 0) {
                cursor = N - 1;
              } else {
                activeButton--;
                cursor = N + activeButton;
              }
            } else {
              cursor--;
            }
          } else {
            if (cursor < N - 1) {
              cursor++;
            } else if (cursor === N - 1) {
              activeButton = 0;
              cursor = N + activeButton;
            } else {
              if (activeButton === 2) {
                cursor = 0;
              } else {
                activeButton++;
                cursor = N + activeButton;
              }
            }
          }
        } else {
          if (key.shift) {
            activeButton = (activeButton - 1 + 3) % 3;
          } else {
            activeButton = (activeButton + 1) % 3;
          }
          cursor = activeButton;
        }
      } else if (key.name === 'space') {
        if (N > 0 && cursor < N) {
          if (checked.has(cursor)) {
            checked.delete(cursor);
          } else {
            checked.add(cursor);
          }
        }
      } else if (key.name === 'return' || key.name === 'enter') {
        clearLines(lines.length);
        
        if (activeButton === 1 || activeButton === 2) {
          if (N > 0 && request.details) {
            const approvedDetails = request.details.filter((_, idx) => checked.has(idx));
            request.details.length = 0;
            request.details.push(...approvedDetails);
            if (approvedDetails.length === 0) {
              console.log(chalk.red('✗ Cancelled (no items selected in checklist)'));
              return false;
            }
          }
        }

        if (activeButton === 0) {
          console.log(chalk.red('✗ Denied'));
          return false;
        } else if (activeButton === 1) {
          console.log(chalk.green('✓ Approved'));
          return true;
        } else {
          console.log(chalk.magenta('✓ Approved for this session'));
          return 'session';
        }
      } else if (key.sequence.toLowerCase() === 'y') {
        clearLines(lines.length);
        if (N > 0 && request.details) {
          const approvedDetails = request.details.filter((_, idx) => checked.has(idx));
          request.details.length = 0;
          request.details.push(...approvedDetails);
          if (approvedDetails.length === 0) {
            console.log(chalk.red('✗ Cancelled (no items selected in checklist)'));
            return false;
          }
        }
        console.log(chalk.green('✓ Approved'));
        return true;
      } else if (key.sequence.toLowerCase() === 'n') {
        clearLines(lines.length);
        console.log(chalk.red('✗ Denied'));
        return false;
      } else if (key.sequence.toLowerCase() === 's') {
        clearLines(lines.length);
        if (N > 0 && request.details) {
          const approvedDetails = request.details.filter((_, idx) => checked.has(idx));
          request.details.length = 0;
          request.details.push(...approvedDetails);
          if (approvedDetails.length === 0) {
            console.log(chalk.red('✗ Cancelled (no items selected in checklist)'));
            return false;
          }
        }
        console.log(chalk.magenta('✓ Approved for this session'));
        return 'session';
      }

      // Re-render
      clearLines(lines.length);
      lines = renderFrame(request, N, cursor, activeButton, checked);
      lines.forEach(line => console.log(line));
    }
  } finally {
    if (input.isTTY) {
      input.setRawMode(wasRaw);
    }
  }
}

export function createReadlineConfirmation(rl: readlinePromises.Interface, isPausedRef?: { value: boolean }): ConfirmationHandler {
  return async (request) => {
    const { toolkitSlug, toolSlug, summary, action, access, targetTools, details } = request;

    if (hasSessionApproval(request)) {
      console.log(chalk.gray(`\nApproved for this session: ${toolkitSlug} / ${action || toolSlug}`));
      return true;
    }

    if (input.isTTY && output.isTTY) {
      const wasPaused = isPausedRef?.value ?? false;
      rl.pause();
      if (isPausedRef) isPausedRef.value = true;
      pauseThinkingTicker();
      try {
        console.log(''); // extra spacing before the card
        return await runInteractiveConfirmation(request);
      } finally {
        resumeThinkingTicker();
        if (!wasPaused) {
          rl.resume();
          if (isPausedRef) isPausedRef.value = false;
        }
      }
    }

    // Fallback logic for non-TTY
    console.log(chalk.yellow(`\nZilMate wants to use ${toolkitSlug}`));
    console.log(`${chalk.gray('Action:')} ${action || 'External app action'}`);
    console.log(`${chalk.gray('Access:')} ${access || 'Write'}`);
    console.log(`${chalk.gray('Tool:')} ${(targetTools && targetTools.length > 0) ? targetTools.join(', ') : toolSlug}`);
    if (details && details.length > 0) {
      console.log(chalk.gray('Details:'));
      for (const detail of details) {
        if (detail.trim()) console.log(`- ${detail}`);
      }
    } else {
      console.log(`${chalk.gray('Details:')} ${summary}`);
    }

    const answer = (await rl.question('Proceed? (y/N/s=session) ')).trim().toLowerCase();
    if (answer === 's' || answer === 'session' || answer === 'ys' || answer === 'yes-session') {
      console.log(chalk.green('Approved for this CLI session.'));
      return 'session';
    }
    return answer === 'y' || answer === 'yes';
  };
}

export function createTerminalConfirmation(): ConfirmationHandler {
  return async (request) => {
    if (hasSessionApproval(request)) {
      const { toolkitSlug, toolSlug, action } = request;
      console.log(chalk.gray(`\nApproved for this session: ${toolkitSlug} / ${action || toolSlug}`));
      return true;
    }

    if (input.isTTY && output.isTTY) {
      pauseThinkingTicker();
      try {
        console.log(''); // extra spacing before the card
        return await runInteractiveConfirmation(request);
      } finally {
        resumeThinkingTicker();
      }
    }

    // fallback readline interface if non-TTY
    const promisesModule = await import('node:readline/promises');
    const rl = promisesModule.default.createInterface({ input, output });
    try {
      return await createReadlineConfirmation(rl)(request);
    } finally {
      rl.close();
    }
  };
}
