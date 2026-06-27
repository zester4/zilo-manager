// src/cli/composer.ts
import readline from 'node:readline/promises';
import { theme, termWidth, boxLine, wrapText } from './theme.js';

export async function readComposerLine(
  rl: readline.Interface,
  placeholder = 'Try "plan my week" or "build a Next.js dashboard"',
): Promise<string> {
  const w = termWidth(92);

  console.log('');
  console.log(boxLine('top', w));
  console.log(theme.accent('│ ') + theme.dim(placeholder));

  const promptPrefix = theme.accent('│ ') + theme.brandBright('> ');

  let multilineMode = false;

  const finalMessage = await new Promise<string>((resolve) => {
    let buffer: string[] = [];
    let timeout: NodeJS.Timeout | null = null;
    let bracketedPasteActive = false;

    // Enable Bracketed Paste Mode
    if (process.stdin.isTTY) {
      process.stdout.write('\x1b[?2004h');
    }

    const cleanup = () => {
      if (process.stdin.isTTY) {
        process.stdout.write('\x1b[?2004l');
      }
      rl.removeListener('line', onLine);
    };

    // Display the prompt manually
    process.stdout.write(promptPrefix);

    const onLine = (line: string) => {
      let currentLine = line;

      if (currentLine.includes('\x1b[200~')) {
        bracketedPasteActive = true;
        currentLine = currentLine.replace('\x1b[200~', '');
      }

      const hasEndMarker = currentLine.includes('\x1b[201~');
      if (hasEndMarker) {
        currentLine = currentLine.replace('\x1b[201~', '');
      }

      const trimmed = currentLine.trim();

      if (bracketedPasteActive) {
        buffer.push(currentLine);
        if (hasEndMarker) {
          bracketedPasteActive = false;
          if (timeout) clearTimeout(timeout);
          cleanup();
          resolve(buffer.join('\n'));
        }
        return;
      }

      // If we are in /multiline or /paste mode
      if (multilineMode) {
        if (!trimmed) {
          // Empty line exits multiline mode
          cleanup();
          resolve(buffer.join('\n'));
          return;
        }
        buffer.push(line);
        // Write the prefix for the next multiline line
        process.stdout.write(theme.accent('│ ') + theme.brandBright('  '));
        return;
      }

      // If they type /multiline or /paste on the very first line
      if (buffer.length === 0 && (trimmed === '/multiline' || trimmed === '/paste')) {
        multilineMode = true;
        console.log(theme.accent('│ ') + theme.muted(' (Multiline mode: Type your message. Send an empty line to finish.)'));
        process.stdout.write(theme.accent('│ ') + theme.brandBright('  '));
        return;
      }

      // If they end a line with \ for simple manual multiline
      if (trimmed.endsWith('\\')) {
        buffer.push(line.slice(0, -1));
        // Clear timeout since they are typing manually and we expect more lines
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        process.stdout.write(theme.accent('│ ') + theme.brandBright('  '));
        return;
      }

      // Otherwise, it's a standard line or part of a paste
      buffer.push(line);

      if (timeout) clearTimeout(timeout);

      // Debounce: if no new line arrives within 50ms, we assume the input is finished!
      timeout = setTimeout(() => {
        cleanup();
        resolve(buffer.join('\n'));
      }, 50);
    };

    rl.on('line', onLine);
  });

  const linesSplit = finalMessage.split('\n');

  // Calculate how many terminal lines we need to clear.
  const promptLen = 4; // length of "│ > "
  let linesUsed = 1; // Initial newline at top
  linesUsed += 1; // boxLine('top')
  linesUsed += 1; // placeholder line

  if (multilineMode) {
    linesUsed += 1; // The "(Multiline mode...)" hint line
  }

  for (let i = 0; i < linesSplit.length; i++) {
    const line = linesSplit[i];
    if (line !== undefined) {
      const wrapped = wrapText(line, w - promptLen);
      linesUsed += Math.max(1, wrapped.length);
    }
  }

  if (multilineMode) {
    linesUsed += 1; // The final empty line entered to exit multiline mode
    linesUsed += 1; // The command line /multiline itself
  }

  // Clear everything we just printed to replace it with the pretty box
  for (let i = 0; i < linesUsed; i++) {
    process.stdout.write('\x1b[1A\x1b[2K');
  }

  return finalMessage;
}
