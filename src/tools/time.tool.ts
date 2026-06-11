import { tool } from 'ai';
import { z } from 'zod';
import { emitProgress } from '../runtime/progress.js';

function formatNow(timeZone?: string) {
  const now = new Date();
  const resolvedTimeZone = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const formatter = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'full',
    timeStyle: 'long',
    timeZone: resolvedTimeZone,
  });

  return {
    iso: now.toISOString(),
    unixMs: now.getTime(),
    timeZone: resolvedTimeZone,
    formatted: formatter.format(now),
  };
}

export const timeTools = {
  getCurrentTime: tool({
    description: 'Get the current local date and time. Use this whenever the user asks for today, the current date, current time, now, tomorrow, yesterday, or schedule-relative wording.',
    inputSchema: z.object({
      timeZone: z.string().min(1).optional().describe('Optional IANA timezone such as Europe/London or America/New_York. Omit for the local system timezone.'),
    }),
    execute: async ({ timeZone }) => {
      emitProgress(timeZone
        ? { type: 'fetch:start', label: 'Checking time', detail: timeZone }
        : { type: 'fetch:start', label: 'Checking local time' });
      const result = formatNow(timeZone);
      emitProgress({ type: 'fetch:end', label: 'Time checked', detail: result.formatted });
      return result;
    },
  }),
};
