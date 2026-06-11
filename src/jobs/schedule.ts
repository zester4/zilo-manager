const minuteMs = 60 * 1000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;

function datePlus(ms: number) {
  return new Date(Date.now() + ms).toISOString();
}

function parseEvery(value: string) {
  const match = /^every\s+(\d+)\s*(minute|minutes|hour|hours|day|days)$/i.exec(value.trim());
  if (!match) return undefined;
  const amount = Number.parseInt(match[1]!, 10);
  const unit = match[2]!.toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  if (unit.startsWith('minute')) return datePlus(amount * minuteMs);
  if (unit.startsWith('hour')) return datePlus(amount * hourMs);
  return datePlus(amount * dayMs);
}

export function nextRunFromSchedule(schedule: string | undefined, from = new Date()) {
  if (!schedule) return undefined;
  const trimmed = schedule.trim();
  if (!trimmed) return undefined;

  const every = parseEvery(trimmed);
  if (every) return every;

  if (/^hourly$/i.test(trimmed)) return new Date(from.getTime() + hourMs).toISOString();
  if (/^daily$/i.test(trimmed)) return new Date(from.getTime() + dayMs).toISOString();

  const at = trimmed.replace(/^at\s+/i, '');
  const date = new Date(at);
  if (!Number.isNaN(date.getTime())) return date.toISOString();

  return undefined;
}

export function isDue(value: string | undefined, now = new Date()) {
  if (!value) return true;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return true;
  return date.getTime() <= now.getTime();
}

export function isRecurringSchedule(schedule: string | undefined) {
  if (!schedule) return false;
  return /^every\s+\d+\s*(minute|minutes|hour|hours|day|days)$/i.test(schedule.trim())
    || /^hourly$/i.test(schedule.trim())
    || /^daily$/i.test(schedule.trim())
    || /^cron\(/i.test(schedule.trim())
    || /^cron:/i.test(schedule.trim());
}

export function qstashCron(schedule: string | undefined) {
  if (!schedule) return undefined;
  const trimmed = schedule.trim();
  if (/^cron:/i.test(trimmed)) return trimmed.replace(/^cron:/i, '').trim();
  const cronMatch = /^cron\((.+)\)$/i.exec(trimmed);
  if (cronMatch) return cronMatch[1]!.trim();
  if (/^hourly$/i.test(trimmed)) return '0 * * * *';
  if (/^daily$/i.test(trimmed)) return '0 9 * * *';
  return undefined;
}
