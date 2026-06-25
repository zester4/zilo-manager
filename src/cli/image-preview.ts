import { readFile } from 'node:fs/promises';
import { theme } from './theme.js';

export async function renderTerminalImage(filePath: string) {
  if (!process.stdout.isTTY) return;

  try {
    const buffer = await readFile(filePath);
    const base64 = buffer.toString('base64');

    // iTerm2 protocol
    process.stdout.write(`\u001b]1337;File=inline=1;width=auto;height=auto;preserveAspectRatio=1:${base64}\u0007\n`);

    // Kitty protocol fallback
    process.stdout.write(`\u001b_Ga=T,f=100,t=d,v=100,s=100,m=1;${base64}\u001b\\\n`);

    console.log(theme.muted(`[Image preview: ${filePath}]`));
  } catch (error) {
    // Silent fail if image cannot be read or protocol not supported
  }
}
