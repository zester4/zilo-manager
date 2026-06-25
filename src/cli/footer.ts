import logUpdate from 'log-update';
import chalk from 'chalk';
import { theme, termWidth, sparkline } from './theme.js';
import { getSessionMetrics } from '../observability/usage.js';
import { cpus, totalmem, freemem } from 'node:os';

let footerActive = false;
let session: string = 'default';

export function setFooterSession(id: string) {
  session = id;
}

function getSystemMetrics() {
  const load = (cpus().reduce((acc, cpu) => acc + cpu.times.user, 0) / cpus().length / 1000).toFixed(1);
  const memUsed = ((totalmem() - freemem()) / 1024 / 1024 / 1024).toFixed(1);
  const memTotal = (totalmem() / 1024 / 1024 / 1024).toFixed(1);
  return { load, memUsed, memTotal };
}

export function renderFooter() {
  if (!footerActive) return;

  const metrics = getSessionMetrics(session);
  const sys = getSystemMetrics();
  const w = termWidth(120);

  const trend = sparkline(metrics.costHistory, 10);
  const tokenStr = ` ${theme.brand('Tokens:')} ${metrics.tokens.totalTokens.toLocaleString()} ($${metrics.estimatedCost.toFixed(3)}) ${theme.dim(trend)} `;
  const sysStr = ` ${theme.accent('CPU:')} ${sys.load}% | ${theme.accent('MEM:')} ${sys.memUsed}/${sys.memTotal}GB `;
  const sessionStr = ` ${theme.muted('Session:')} ${session} `;

  const left = tokenStr + sessionStr;
  const right = sysStr;
  const padding = Math.max(0, w - stripAnsi(left).length - stripAnsi(right).length);

  const line = theme.panel('━'.repeat(w));
  const content = left + ' '.repeat(padding) + right;

  logUpdate(`\n${line}\n${content}`);
}

function stripAnsi(str: string) {
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

export function startFooter() {
  footerActive = true;
  const timer = setInterval(renderFooter, 2000);
  return () => {
    footerActive = false;
    clearInterval(timer);
    logUpdate.clear();
  };
}
