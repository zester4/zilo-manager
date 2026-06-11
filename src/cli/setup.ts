import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import chalk from 'chalk';
import { printPanel, printZilMateBanner } from './format.js';

type SetupOptions = {
  path?: string;
  force?: boolean;
  yes?: boolean;
  aiGatewayKey?: string;
  composioKey?: string;
  zilmateUserId?: string;
  tavilyKey?: string;
  redisUrl?: string;
  redisToken?: string;
  jobsEnabled?: string;
  qstashToken?: string;
  publicJobWebhookUrl?: string;
  jobWebhookSecret?: string;
  triggerWorkflowsEnabled?: string;
  deepgramApiKey?: string;
  voiceEnabled?: string;
  voiceListenModel?: string;
  voiceTtsModel?: string;
  voiceLanguage?: string;
};

const defaults = {
  ZILO_MANAGER_MODEL: 'minimax/minimax-m3',
  ZILO_HELP_MODEL: 'alibaba/qwen3.7-plus',
  ZILO_POST_MODEL: 'alibaba/qwen3.7-plus',
  ZILO_IMAGE_DEFAULT_PROVIDER: 'openai',
  ZILO_IMAGE_OPENAI_MODEL: 'openai/gpt-image-2',
  ZILO_IMAGE_GEMINI_MODEL: 'google/gemini-3-pro-image',
  ZILO_IMAGE_MODEL: '',
};

function normalizeBooleanOption(value: string | undefined, fallback = false) {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y';
}

function newWebhookSecret() {
  return randomBytes(24).toString('base64url');
}

function parseEnvFile(content: string) {
  const values = new Map<string, string>();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!key || rawValue === undefined) continue;
    values.set(key, rawValue.replace(/^"(.*)"$/, '$1'));
  }
  return values;
}

function formatEnvValue(value: string) {
  if (!value) return '';
  if (/^[A-Za-z0-9_./:@+=-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

async function askRequiredSecret(rl: readline.Interface, prompt: string) {
  while (true) {
    const value = await rl.question(prompt);
    if (value.trim()) return value.trim();
    console.log(chalk.yellow('This value is required.'));
  }
}

async function askOptionalSecret(rl: readline.Interface, prompt: string) {
  const value = await rl.question(prompt);
  return value.trim();
}

async function askYesNo(rl: readline.Interface, prompt: string, defaultValue = false) {
  const suffix = defaultValue ? 'Y/n' : 'y/N';
  const answer = (await rl.question(`${prompt} (${suffix}) `)).trim().toLowerCase();
  if (!answer) return defaultValue;
  return answer === 'y' || answer === 'yes';
}

function buildEnv(values: Map<string, string>) {
  const lines: Array<[string, string]> = [
    ['AI_GATEWAY_API_KEY', values.get('AI_GATEWAY_API_KEY') || ''],
    ['COMPOSIO_API_KEY', values.get('COMPOSIO_API_KEY') || ''],
    ['ZILMATE_USER_ID', values.get('ZILMATE_USER_ID') || ''],
    ['TAVILY_API_KEY', values.get('TAVILY_API_KEY') || ''],
    ['UPSTASH_REDIS_REST_URL', values.get('UPSTASH_REDIS_REST_URL') || ''],
    ['UPSTASH_REDIS_REST_TOKEN', values.get('UPSTASH_REDIS_REST_TOKEN') || ''],
    ['ZILMATE_JOBS_ENABLED', values.get('ZILMATE_JOBS_ENABLED') || 'false'],
    ['UPSTASH_QSTASH_TOKEN', values.get('UPSTASH_QSTASH_TOKEN') || ''],
    ['ZILMATE_PUBLIC_JOB_WEBHOOK_URL', values.get('ZILMATE_PUBLIC_JOB_WEBHOOK_URL') || ''],
    ['ZILMATE_JOB_WEBHOOK_SECRET', values.get('ZILMATE_JOB_WEBHOOK_SECRET') || ''],
    ['ZILMATE_TRIGGER_WORKFLOWS_ENABLED', values.get('ZILMATE_TRIGGER_WORKFLOWS_ENABLED') || 'false'],
    ['DEEPGRAM_API_KEY', values.get('DEEPGRAM_API_KEY') || ''],
    ['ZILMATE_VOICE_ENABLED', values.get('ZILMATE_VOICE_ENABLED') || 'false'],
    ['ZILMATE_VOICE_MODE', values.get('ZILMATE_VOICE_MODE') || 'agent'],
    ['ZILMATE_VOICE_LISTEN_MODEL', values.get('ZILMATE_VOICE_LISTEN_MODEL') || 'flux-general-en'],
    ['ZILMATE_VOICE_LISTEN_VERSION', values.get('ZILMATE_VOICE_LISTEN_VERSION') || 'v2'],
    ['ZILMATE_VOICE_TTS_MODEL', values.get('ZILMATE_VOICE_TTS_MODEL') || 'aura-2-thalia-en'],
    ['ZILMATE_VOICE_LANGUAGE', values.get('ZILMATE_VOICE_LANGUAGE') || 'en'],
    ['ZILMATE_VOICE_LANGUAGE_HINTS', values.get('ZILMATE_VOICE_LANGUAGE_HINTS') || ''],
    ['ZILMATE_VOICE_BARGE_IN', values.get('ZILMATE_VOICE_BARGE_IN') || 'true'],
    ['ZILO_MANAGER_MODEL', values.get('ZILO_MANAGER_MODEL') || defaults.ZILO_MANAGER_MODEL],
    ['ZILO_HELP_MODEL', values.get('ZILO_HELP_MODEL') || defaults.ZILO_HELP_MODEL],
    ['ZILO_POST_MODEL', values.get('ZILO_POST_MODEL') || defaults.ZILO_POST_MODEL],
    ['ZILO_IMAGE_DEFAULT_PROVIDER', values.get('ZILO_IMAGE_DEFAULT_PROVIDER') || defaults.ZILO_IMAGE_DEFAULT_PROVIDER],
    ['ZILO_IMAGE_OPENAI_MODEL', values.get('ZILO_IMAGE_OPENAI_MODEL') || defaults.ZILO_IMAGE_OPENAI_MODEL],
    ['ZILO_IMAGE_GEMINI_MODEL', values.get('ZILO_IMAGE_GEMINI_MODEL') || defaults.ZILO_IMAGE_GEMINI_MODEL],
    ['ZILO_IMAGE_MODEL', values.get('ZILO_IMAGE_MODEL') || defaults.ZILO_IMAGE_MODEL],
  ];

  return `${lines.map(([key, value]) => `${key}=${formatEnvValue(value)}`).join('\n')}\n`;
}

function printSetupPrep() {
  printPanel('Before setup starts', [
    ['Required', 'AI Gateway key'],
    ['Apps/tools', 'Composio key if you want Gmail, Slack, GitHub, Notion, etc.'],
    ['Web research', 'Tavily key if you want live web research'],
    ['Memory/jobs', 'Upstash Redis keys if you want cloud-backed storage'],
    ['Hosted schedules', 'QStash token and public webhook URL if needed'],
    ['Voice', 'Deepgram key if you want realtime voice'],
  ]);
  console.log(chalk.gray('You can skip any optional section and run setup again later.'));
}

async function readEnvValues(envPath: string) {
  return existsSync(envPath) ? parseEnvFile(await readFile(envPath, 'utf8')) : new Map<string, string>();
}

async function writeEnvValues(envPath: string, values: Map<string, string>) {
  for (const [key, value] of Object.entries(defaults)) {
    if (!values.has(key)) values.set(key, value);
  }
  await writeFile(envPath, buildEnv(values), 'utf8');
}

export async function runSetup(options: SetupOptions = {}) {
  const envPath = options.path || '.env';
  const existing = await readEnvValues(envPath);
  const rl = readline.createInterface({ input, output });

  try {
    printZilMateBanner('Setup');
    console.log(chalk.gray(`Writing local environment config to ${envPath}`));
    console.log(chalk.gray('Only AI Gateway is required. Everything else can be skipped, enabled, disabled, or changed later.'));
    if (!options.yes) printSetupPrep();

    if (existing.size > 0 && !options.force && !options.yes) {
      const overwrite = await askYesNo(rl, `${envPath} already exists. Update it?`, false);
      if (!overwrite) {
        console.log(chalk.yellow('Setup cancelled. Existing .env was left unchanged.'));
        return;
      }
    }

    const values = new Map(existing);
    if (options.aiGatewayKey) values.set('AI_GATEWAY_API_KEY', options.aiGatewayKey);
    if (options.composioKey !== undefined) values.set('COMPOSIO_API_KEY', options.composioKey);
    if (options.zilmateUserId !== undefined) values.set('ZILMATE_USER_ID', options.zilmateUserId);
    if (options.tavilyKey !== undefined) values.set('TAVILY_API_KEY', options.tavilyKey);
    if (options.redisUrl !== undefined) values.set('UPSTASH_REDIS_REST_URL', options.redisUrl);
    if (options.redisToken !== undefined) values.set('UPSTASH_REDIS_REST_TOKEN', options.redisToken);
    if (options.jobsEnabled !== undefined) values.set('ZILMATE_JOBS_ENABLED', normalizeBooleanOption(options.jobsEnabled) ? 'true' : 'false');
    if (options.qstashToken !== undefined) values.set('UPSTASH_QSTASH_TOKEN', options.qstashToken);
    if (options.publicJobWebhookUrl !== undefined) values.set('ZILMATE_PUBLIC_JOB_WEBHOOK_URL', options.publicJobWebhookUrl);
    if (options.jobWebhookSecret !== undefined) values.set('ZILMATE_JOB_WEBHOOK_SECRET', options.jobWebhookSecret);
    if (options.triggerWorkflowsEnabled !== undefined) values.set('ZILMATE_TRIGGER_WORKFLOWS_ENABLED', normalizeBooleanOption(options.triggerWorkflowsEnabled) ? 'true' : 'false');
    if (options.deepgramApiKey !== undefined) values.set('DEEPGRAM_API_KEY', options.deepgramApiKey);
    if (options.voiceEnabled !== undefined) values.set('ZILMATE_VOICE_ENABLED', normalizeBooleanOption(options.voiceEnabled) ? 'true' : 'false');
    if (options.voiceListenModel !== undefined) {
      values.set('ZILMATE_VOICE_LISTEN_MODEL', options.voiceListenModel);
      values.set('ZILMATE_VOICE_LISTEN_VERSION', options.voiceListenModel.startsWith('flux-') ? 'v2' : 'v1');
    }
    if (options.voiceTtsModel !== undefined) values.set('ZILMATE_VOICE_TTS_MODEL', options.voiceTtsModel);
    if (options.voiceLanguage !== undefined) values.set('ZILMATE_VOICE_LANGUAGE', options.voiceLanguage);

    const currentGatewayKey = values.get('AI_GATEWAY_API_KEY');
    if (options.aiGatewayKey) {
      values.set('AI_GATEWAY_API_KEY', options.aiGatewayKey);
    } else if (!currentGatewayKey && options.yes) {
      throw new Error('AI_GATEWAY_API_KEY is required. Pass --ai-gateway-key or run setup interactively.');
    } else if (currentGatewayKey && !options.yes) {
      const replace = await askYesNo(rl, 'AI_GATEWAY_API_KEY already exists. Replace it?', false);
      if (replace) values.set('AI_GATEWAY_API_KEY', await askRequiredSecret(rl, 'AI_GATEWAY_API_KEY: '));
    } else if (!currentGatewayKey) {
      values.set('AI_GATEWAY_API_KEY', await askRequiredSecret(rl, 'AI_GATEWAY_API_KEY: '));
    }

    if (!values.get('ZILMATE_USER_ID')) {
      values.set('ZILMATE_USER_ID', `zilmate-${randomUUID()}`);
    }

    if (!options.yes && options.composioKey === undefined && await askYesNo(rl, 'Enable Composio app tools?', Boolean(values.get('COMPOSIO_API_KEY')))) {
      const composioKey = await askOptionalSecret(rl, 'COMPOSIO_API_KEY (blank to skip): ');
      values.set('COMPOSIO_API_KEY', composioKey);
    } else if (!options.yes && options.composioKey === undefined) {
      values.set('COMPOSIO_API_KEY', '');
    }

    if (!options.yes && options.tavilyKey === undefined && await askYesNo(rl, 'Enable Tavily web research?', Boolean(values.get('TAVILY_API_KEY')))) {
      const tavilyKey = await askOptionalSecret(rl, 'TAVILY_API_KEY (blank to skip): ');
      values.set('TAVILY_API_KEY', tavilyKey);
    } else if (!options.yes && options.tavilyKey === undefined) {
      values.set('TAVILY_API_KEY', '');
    }

    if (!options.yes && options.redisUrl === undefined && options.redisToken === undefined && await askYesNo(rl, 'Enable Upstash Redis memory/job storage?', Boolean(values.get('UPSTASH_REDIS_REST_URL') && values.get('UPSTASH_REDIS_REST_TOKEN')))) {
      values.set('UPSTASH_REDIS_REST_URL', (await rl.question('UPSTASH_REDIS_REST_URL: ')).trim());
      values.set('UPSTASH_REDIS_REST_TOKEN', await askOptionalSecret(rl, 'UPSTASH_REDIS_REST_TOKEN: '));
    } else if (!options.yes && options.redisUrl === undefined && options.redisToken === undefined) {
      values.set('UPSTASH_REDIS_REST_URL', '');
      values.set('UPSTASH_REDIS_REST_TOKEN', '');
    }

    if (!options.yes && options.jobsEnabled === undefined) {
      console.log(chalk.cyan('\nBackground jobs'));
      console.log(chalk.gray('Local jobs keep running after chat closes while `zilmate jobs worker` is open. They stop if the laptop sleeps or shuts down.'));
      const enableJobs = await askYesNo(rl, 'Enable local background jobs and schedules?', values.get('ZILMATE_JOBS_ENABLED') === 'true');
      values.set('ZILMATE_JOBS_ENABLED', enableJobs ? 'true' : 'false');
    } else if (!values.has('ZILMATE_JOBS_ENABLED')) {
      values.set('ZILMATE_JOBS_ENABLED', 'false');
    }

    if (!options.yes && options.qstashToken === undefined) {
      console.log(chalk.cyan('\nHosted schedules'));
      console.log(chalk.gray('Use QStash only when you have a hosted public webhook. This is what allows schedules to fire while your laptop is closed.'));
      if (await askYesNo(rl, 'Enable Upstash QStash hosted schedules?', Boolean(values.get('UPSTASH_QSTASH_TOKEN')))) {
        values.set('UPSTASH_QSTASH_TOKEN', await askOptionalSecret(rl, 'UPSTASH_QSTASH_TOKEN (blank to skip): '));
        values.set('ZILMATE_PUBLIC_JOB_WEBHOOK_URL', (await rl.question('ZILMATE_PUBLIC_JOB_WEBHOOK_URL (blank for local only): ')).trim());
        const existingSecret = values.get('ZILMATE_JOB_WEBHOOK_SECRET');
        const secret = await askOptionalSecret(rl, `ZILMATE_JOB_WEBHOOK_SECRET (blank to ${existingSecret ? 'keep existing' : 'auto-generate'}): `);
        values.set('ZILMATE_JOB_WEBHOOK_SECRET', secret || existingSecret || newWebhookSecret());
      } else {
        values.set('UPSTASH_QSTASH_TOKEN', '');
        values.set('ZILMATE_PUBLIC_JOB_WEBHOOK_URL', '');
      }
    }

    if (!options.yes && options.triggerWorkflowsEnabled === undefined) {
      console.log(chalk.cyan('\nComposio trigger workflows'));
      console.log(chalk.gray('When enabled, Composio trigger events can queue ZilMate jobs for Gmail, GitHub, Slack, calendar-style events, and more.'));
      const canEnableTriggers = Boolean(values.get('COMPOSIO_API_KEY'));
      if (!canEnableTriggers) {
        console.log(chalk.yellow('Skipping trigger workflows because Composio is not configured.'));
        values.set('ZILMATE_TRIGGER_WORKFLOWS_ENABLED', 'false');
      } else if (await askYesNo(rl, 'Enable Composio trigger-to-job workflows?', values.get('ZILMATE_TRIGGER_WORKFLOWS_ENABLED') === 'true')) {
        values.set('ZILMATE_TRIGGER_WORKFLOWS_ENABLED', 'true');
        if (values.get('ZILMATE_JOBS_ENABLED') !== 'true') {
          console.log(chalk.yellow('Trigger workflows need jobs, so background jobs were enabled.'));
          values.set('ZILMATE_JOBS_ENABLED', 'true');
        }
      } else {
        values.set('ZILMATE_TRIGGER_WORKFLOWS_ENABLED', 'false');
      }
    } else if (!values.has('ZILMATE_TRIGGER_WORKFLOWS_ENABLED')) {
      values.set('ZILMATE_TRIGGER_WORKFLOWS_ENABLED', 'false');
    }

    if (!options.yes && options.voiceEnabled === undefined) {
      console.log(chalk.cyan('\nRealtime voice'));
      console.log(chalk.gray('Voice mode uses Deepgram Agent API with Flux V2 for fast listening/end-of-turn and Aura-2 for spoken replies. It can be skipped.'));
      const enableVoice = await askYesNo(rl, 'Enable realtime voice mode?', values.get('ZILMATE_VOICE_ENABLED') === 'true');
      values.set('ZILMATE_VOICE_ENABLED', enableVoice ? 'true' : 'false');
      if (enableVoice) {
        const deepgramKey = options.deepgramApiKey ?? await askOptionalSecret(rl, 'DEEPGRAM_API_KEY (blank to configure later): ');
        if (deepgramKey) values.set('DEEPGRAM_API_KEY', deepgramKey);
        const listenModel = (await rl.question(`Listen model (${values.get('ZILMATE_VOICE_LISTEN_MODEL') || 'flux-general-en'}): `)).trim();
        if (listenModel) {
          values.set('ZILMATE_VOICE_LISTEN_MODEL', listenModel);
          values.set('ZILMATE_VOICE_LISTEN_VERSION', listenModel.startsWith('flux-') ? 'v2' : 'v1');
        } else if (!values.get('ZILMATE_VOICE_LISTEN_MODEL')) {
          values.set('ZILMATE_VOICE_LISTEN_MODEL', 'flux-general-en');
          values.set('ZILMATE_VOICE_LISTEN_VERSION', 'v2');
        }
        const ttsModel = (await rl.question(`TTS voice (${values.get('ZILMATE_VOICE_TTS_MODEL') || 'aura-2-thalia-en'}): `)).trim();
        if (ttsModel) values.set('ZILMATE_VOICE_TTS_MODEL', ttsModel);
        const language = (await rl.question(`Language (${values.get('ZILMATE_VOICE_LANGUAGE') || 'en'}): `)).trim();
        if (language) values.set('ZILMATE_VOICE_LANGUAGE', language);
        values.set('ZILMATE_VOICE_MODE', 'agent');
        values.set('ZILMATE_VOICE_BARGE_IN', 'true');
      } else {
        console.log(chalk.gray('Voice disabled. Run `zilmate voice setup` or `zilmate voice enable` when you want it.'));
      }
    } else if (!values.has('ZILMATE_VOICE_ENABLED')) {
      values.set('ZILMATE_VOICE_ENABLED', 'false');
    }

    await writeEnvValues(envPath, values);
    console.log(chalk.green(`Saved ${envPath}.`));
    printPanel('Setup summary', [
      ['Gateway', values.get('AI_GATEWAY_API_KEY') ? 'configured' : 'missing'],
      ['Composio', values.get('COMPOSIO_API_KEY') ? 'configured' : 'skipped'],
      ['Tavily', values.get('TAVILY_API_KEY') ? 'configured' : 'skipped'],
      ['Redis', values.get('UPSTASH_REDIS_REST_URL') && values.get('UPSTASH_REDIS_REST_TOKEN') ? 'configured' : 'local fallback'],
      ['Jobs', values.get('ZILMATE_JOBS_ENABLED') === 'true' ? 'enabled' : 'disabled'],
      ['QStash', values.get('UPSTASH_QSTASH_TOKEN') && values.get('ZILMATE_PUBLIC_JOB_WEBHOOK_URL') ? 'configured' : 'local schedules only'],
      ['Trigger workflows', values.get('ZILMATE_TRIGGER_WORKFLOWS_ENABLED') === 'true' ? 'enabled' : 'disabled'],
      ['Voice', values.get('ZILMATE_VOICE_ENABLED') === 'true' ? values.get('DEEPGRAM_API_KEY') ? 'enabled' : 'enabled, missing Deepgram key' : 'disabled'],
    ]);
    console.log(chalk.gray('\nNext steps:'));
    console.log(chalk.gray('  zilmate ping'));
    console.log(chalk.gray('  zilmate doctor'));
    if (values.get('ZILMATE_JOBS_ENABLED') === 'true') {
      console.log(chalk.gray('  zilmate jobs worker'));
    }
    if (values.get('COMPOSIO_API_KEY')) {
      console.log(chalk.gray('  zilmate apps status'));
    }
    console.log(chalk.gray('  zilmate voice doctor'));
  } finally {
    rl.close();
  }
}

export async function runVoiceSetup(options: Pick<SetupOptions, 'path' | 'force' | 'deepgramApiKey' | 'voiceListenModel' | 'voiceTtsModel' | 'voiceLanguage'> = {}) {
  const envPath = options.path || '.env';
  const existing = await readEnvValues(envPath);
  const rl = readline.createInterface({ input, output });

  try {
    printZilMateBanner('Voice setup');
    console.log(chalk.gray('This turns on realtime voice without walking through every other ZilMate setup step.'));
    console.log(chalk.gray('Defaults use Deepgram Flux V2 for fast listening and Aura-2 for spoken replies.'));

    if (existing.size > 0 && !options.force) {
      const update = await askYesNo(rl, `${envPath} already exists. Update voice settings?`, true);
      if (!update) {
        console.log(chalk.yellow('Voice setup cancelled. Existing .env was left unchanged.'));
        return;
      }
    }

    const values = new Map(existing);
    values.set('ZILMATE_VOICE_ENABLED', 'true');
    values.set('ZILMATE_VOICE_MODE', 'agent');
    values.set('ZILMATE_VOICE_BARGE_IN', 'true');

    const currentKey = options.deepgramApiKey ?? values.get('DEEPGRAM_API_KEY') ?? '';
    if (options.deepgramApiKey) {
      values.set('DEEPGRAM_API_KEY', options.deepgramApiKey);
    } else if (currentKey) {
      const replace = await askYesNo(rl, 'DEEPGRAM_API_KEY already exists. Replace it?', false);
      if (replace) values.set('DEEPGRAM_API_KEY', await askRequiredSecret(rl, 'DEEPGRAM_API_KEY: '));
    } else {
      values.set('DEEPGRAM_API_KEY', await askRequiredSecret(rl, 'DEEPGRAM_API_KEY: '));
    }

    const currentListenModel = options.voiceListenModel ?? values.get('ZILMATE_VOICE_LISTEN_MODEL') ?? 'flux-general-en';
    const listenModel = options.voiceListenModel ?? ((await rl.question(`Listen model (${currentListenModel}): `)).trim() || currentListenModel);
    values.set('ZILMATE_VOICE_LISTEN_MODEL', listenModel);
    values.set('ZILMATE_VOICE_LISTEN_VERSION', listenModel.startsWith('flux-') ? 'v2' : 'v1');

    const currentTtsModel = options.voiceTtsModel ?? values.get('ZILMATE_VOICE_TTS_MODEL') ?? 'aura-2-thalia-en';
    values.set('ZILMATE_VOICE_TTS_MODEL', options.voiceTtsModel ?? ((await rl.question(`TTS voice (${currentTtsModel}): `)).trim() || currentTtsModel));

    const currentLanguage = options.voiceLanguage ?? values.get('ZILMATE_VOICE_LANGUAGE') ?? 'en';
    values.set('ZILMATE_VOICE_LANGUAGE', options.voiceLanguage ?? ((await rl.question(`Language (${currentLanguage}): `)).trim() || currentLanguage));

    if (!values.has('ZILMATE_VOICE_LANGUAGE_HINTS')) values.set('ZILMATE_VOICE_LANGUAGE_HINTS', '');

    await writeEnvValues(envPath, values);
    console.log(chalk.green(`Saved voice settings to ${envPath}.`));
    printPanel('Voice summary', [
      ['Voice', 'enabled'],
      ['Deepgram', values.get('DEEPGRAM_API_KEY') ? 'configured' : 'missing'],
      ['Listen model', `${values.get('ZILMATE_VOICE_LISTEN_MODEL')} (${values.get('ZILMATE_VOICE_LISTEN_VERSION')})`],
      ['TTS voice', values.get('ZILMATE_VOICE_TTS_MODEL') || 'aura-2-thalia-en'],
      ['Language', values.get('ZILMATE_VOICE_LANGUAGE') || 'en'],
    ]);
    console.log(chalk.gray('\nNext steps:'));
    console.log(chalk.gray('  zilmate voice doctor'));
    console.log(chalk.gray('  zilmate voice config'));
  } finally {
    rl.close();
  }
}

export async function setVoiceEnabled(enabled: boolean, options: Pick<SetupOptions, 'path'> = {}) {
  const envPath = options.path || '.env';
  const values = await readEnvValues(envPath);
  values.set('ZILMATE_VOICE_ENABLED', enabled ? 'true' : 'false');
  if (enabled) {
    values.set('ZILMATE_VOICE_MODE', values.get('ZILMATE_VOICE_MODE') || 'agent');
    values.set('ZILMATE_VOICE_LISTEN_MODEL', values.get('ZILMATE_VOICE_LISTEN_MODEL') || 'flux-general-en');
    values.set('ZILMATE_VOICE_LISTEN_VERSION', values.get('ZILMATE_VOICE_LISTEN_VERSION') || 'v2');
    values.set('ZILMATE_VOICE_TTS_MODEL', values.get('ZILMATE_VOICE_TTS_MODEL') || 'aura-2-thalia-en');
    values.set('ZILMATE_VOICE_LANGUAGE', values.get('ZILMATE_VOICE_LANGUAGE') || 'en');
    values.set('ZILMATE_VOICE_BARGE_IN', values.get('ZILMATE_VOICE_BARGE_IN') || 'true');
  }
  await writeEnvValues(envPath, values);
  printPanel('Voice', [
    ['Status', enabled ? 'enabled' : 'disabled'],
    ['Deepgram', values.get('DEEPGRAM_API_KEY') ? 'configured' : 'missing'],
    ['Next', enabled ? values.get('DEEPGRAM_API_KEY') ? 'zilmate voice doctor' : 'zilmate voice setup' : 'zilmate voice enable'],
  ]);
}
