import { spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { existsSync, chmodSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import chalk from 'chalk';

const execFileAsync = promisify(execFile);

export type TunnelResult = {
  url: string;
  provider: 'cloudflare';
  detail: string;
  child?: ChildProcess;
};

async function commandExists(command: string) {
  const probe = process.platform === 'win32' ? 'where.exe' : 'which';
  try {
    await execFileAsync(probe, [command], { windowsHide: true, timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function isCloudflaredAvailable(): Promise<boolean> {
  if (await commandExists('cloudflared')) {
    return true;
  }
  const binDir = path.join(homedir(), '.zilmate', 'bin');
  const binPath = path.join(binDir, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  return existsSync(binPath);
}

export async function ensureCloudflared(): Promise<string> {
  // 1. If global cloudflared is already in PATH, use it
  if (await commandExists('cloudflared')) {
    return 'cloudflared';
  }

  // 2. Otherwise, check our custom local bin directory inside homedir
  const binDir = path.join(homedir(), '.zilmate', 'bin');
  const binPath = path.join(binDir, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');

  if (existsSync(binPath)) {
    return binPath;
  }

  // 3. If it doesn't exist, download it automatically!
  console.log(chalk.cyan('\ncloudflared is missing. Starting premium automatic background installation...'));
  
  let url = '';
  if (process.platform === 'win32') {
    url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
  } else if (process.platform === 'darwin') {
    url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64';
  } else if (process.platform === 'linux') {
    url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64';
  } else {
    throw new Error(`Unsupported platform for cloudflared auto-install: ${process.platform}. Please install manually from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/`);
  }

  try {
    await mkdir(binDir, { recursive: true });
    
    console.log(chalk.gray(`Downloading from ${url}...`));
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download cloudflared: HTTP ${response.status} ${response.statusText}`);
    }
    
    const buffer = await response.arrayBuffer();
    await writeFile(binPath, Buffer.from(buffer));
    
    if (process.platform !== 'win32') {
      chmodSync(binPath, 0o755);
    }
    
    console.log(chalk.green('✓ cloudflared installed successfully!\n'));
    return binPath;
  } catch (error) {
    const err = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to automatically install cloudflared: ${err}. Please download manually from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/`);
  }
}

function extractCloudflareUrl(output: string) {
  const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  return match?.[0] ?? '';
}

export async function startCloudflareQuickTunnel(localUrl: string, timeoutMs = 45_000): Promise<TunnelResult> {
  const binaryPath = await ensureCloudflared();

  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, ['tunnel', '--url', localUrl], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: process.platform === 'win32',
    });

    let output = '';
    const onData = (chunk: Buffer | string) => {
      output += String(chunk);
      const url = extractCloudflareUrl(output);
      if (url) {
        clearTimeout(timer);
        resolve({ url, provider: 'cloudflare', detail: output.slice(-400), child });
      }
    };

    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('error', reject);

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Timed out waiting for Cloudflare tunnel URL. Output: ${output.slice(-300)}`));
    }, timeoutMs);

    child.on('close', (code) => {
      if (!extractCloudflareUrl(output)) {
        reject(new Error(code === 0
          ? 'Cloudflare tunnel closed before returning a public URL.'
          : `cloudflared exited ${code}: ${output.slice(-300)}`));
      }
    });
  });
}

export async function cloudflareTunnelDoctor() {
  const hasCloudflared = await isCloudflaredAvailable();
  return {
    name: 'Cloudflare tunnel',
    ok: hasCloudflared,
    detail: hasCloudflared
      ? 'cloudflared is available for optional QStash webhook tunnels'
      : 'Auto-installed during webhook listener launch, or download manually to enable tunnels',
  };
}
