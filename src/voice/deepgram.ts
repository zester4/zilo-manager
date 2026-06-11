import { randomUUID } from 'node:crypto';
import { env, requireDeepgram } from '../config/env.js';
import type { ZilMateVoiceConfig, ZilMateVoiceEvent, ZilMateVoiceSessionOptions, ZilMateVoiceSessionResult } from './types.js';

type DeepgramClientConstructor = new (options: { apiKey: string }) => {
  agent: {
    v1: {
      connect: () => Promise<DeepgramAgentConnection>;
    };
  };
};

type DeepgramAgentConnection = {
  on: (event: string, handler: (data: unknown) => void | Promise<void>) => void;
  connect: () => void;
  waitForOpen: () => Promise<void>;
  sendSettings: (settings: unknown) => void;
  sendKeepAlive: (message: { type: 'KeepAlive' }) => void;
  sendMedia: (chunk: Buffer | Uint8Array) => void;
  finish?: () => void;
  close?: () => void;
};

type DeepgramModule = {
  DeepgramClient: DeepgramClientConstructor;
};

const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;

function now() {
  return new Date().toISOString();
}

function normalizeVoiceMode(value: string): 'agent' {
  return value === 'agent' ? 'agent' : 'agent';
}

export function getVoiceConfig(): ZilMateVoiceConfig {
  return {
    enabled: env.zilmateVoiceEnabled,
    mode: normalizeVoiceMode(env.zilmateVoiceMode),
    listenModel: env.zilmateVoiceListenModel,
    listenVersion: env.zilmateVoiceListenVersion,
    ttsModel: env.zilmateVoiceTtsModel,
    language: env.zilmateVoiceLanguage,
    languageHints: env.zilmateVoiceLanguageHints,
    bargeIn: env.zilmateVoiceBargeIn,
    configured: Boolean(env.deepgramApiKey),
  };
}

export async function loadDeepgramClient() {
  const module = await dynamicImport('@deepgram/sdk') as DeepgramModule;
  return new module.DeepgramClient({ apiKey: requireDeepgram() });
}

export async function checkVoiceRuntime() {
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [
    {
      name: 'Deepgram key',
      ok: Boolean(env.deepgramApiKey),
      detail: env.deepgramApiKey ? 'DEEPGRAM_API_KEY is configured' : 'Missing DEEPGRAM_API_KEY',
    },
    {
      name: 'Voice enabled',
      ok: env.zilmateVoiceEnabled,
      detail: env.zilmateVoiceEnabled ? 'Realtime voice mode is enabled' : 'ZILMATE_VOICE_ENABLED=false',
    },
    {
      name: 'Listen model',
      ok: env.zilmateVoiceListenVersion === 'v2' || env.zilmateVoiceListenModel.startsWith('nova-'),
      detail: `${env.zilmateVoiceListenModel} (${env.zilmateVoiceListenVersion})`,
    },
    {
      name: 'TTS model',
      ok: Boolean(env.zilmateVoiceTtsModel),
      detail: env.zilmateVoiceTtsModel,
    },
  ];

  try {
    await dynamicImport('@deepgram/sdk');
    checks.push({ name: 'Deepgram SDK', ok: true, detail: '@deepgram/sdk is installed' });
  } catch {
    checks.push({ name: 'Deepgram SDK', ok: false, detail: 'Install dependencies after updating package.json' });
  }

  return checks;
}

function voiceSettings() {
  const config = getVoiceConfig();
  const listenProvider: Record<string, unknown> = {
    type: 'deepgram',
    model: config.listenModel,
  };

  if (config.listenVersion) listenProvider.version = config.listenVersion;
  if (config.listenModel === 'flux-general-multi' && config.languageHints.length > 0) {
    listenProvider.language_hints = config.languageHints;
  } else if (!config.listenModel.startsWith('flux-')) {
    listenProvider.language = config.language;
    listenProvider.smart_format = true;
  }

  return {
    type: 'Settings',
    audio: {
      input: {
        encoding: 'linear16',
        sample_rate: 16000,
      },
      output: {
        encoding: 'linear16',
        sample_rate: 24000,
        container: 'none',
      },
    },
    agent: {
      language: config.language,
      listen: {
        provider: listenProvider,
      },
      think: {
        provider: {
          type: 'open_ai',
          model: 'gpt-4o-mini',
        },
        prompt: 'You are ZilMate voice transport. Keep replies short and conversational.',
      },
      speak: {
        provider: {
          type: 'deepgram',
          model: config.ttsModel,
        },
      },
      greeting: 'ZilMate is listening.',
    },
  };
}

function emit(events: ZilMateVoiceEvent[], options: ZilMateVoiceSessionOptions, event: ZilMateVoiceEvent) {
  events.push(event);
  options.onEvent?.(event);
}

function conversationEvent(data: Record<string, unknown>): ZilMateVoiceEvent | null {
  const text = typeof data.content === 'string'
    ? data.content
    : typeof data.text === 'string'
      ? data.text
      : typeof data.transcript === 'string'
        ? data.transcript
        : '';
  if (!text) return null;
  const role = data.role === 'user' || data.role === 'assistant' ? data.role : 'unknown';
  return {
    type: 'transcript',
    role,
    text,
    final: data.final === true || data.is_final === true,
    timestamp: now(),
  };
}

export async function startDeepgramVoiceAgentSession(options: ZilMateVoiceSessionOptions = {}): Promise<ZilMateVoiceSessionResult> {
  if (!env.zilmateVoiceEnabled) {
    throw new Error('Realtime voice is disabled. Run `zilmate setup` or set ZILMATE_VOICE_ENABLED=true.');
  }

  const sessionId = options.sessionId || `voice_${randomUUID()}`;
  const events: ZilMateVoiceEvent[] = [];
  const deepgram = await loadDeepgramClient();
  const connection = await deepgram.agent.v1.connect();

  connection.on('message', async (data) => {
    if (data && typeof data === 'object' && 'type' in data) {
      const record = data as Record<string, unknown>;
      if (record.type === 'Welcome') {
        emit(events, options, { type: 'status', label: 'Deepgram connected', timestamp: now() });
        connection.sendSettings(voiceSettings());
        return;
      }
      if (record.type === 'ConversationText') {
        const event = conversationEvent(record);
        if (event) emit(events, options, event);
        return;
      }
      if (record.type === 'UserStartedSpeaking') {
        emit(events, options, {
          type: 'status',
          label: 'User started speaking',
          ...(env.zilmateVoiceBargeIn ? { detail: 'barge-in enabled' } : {}),
          timestamp: now(),
        });
        return;
      }
      if (record.type === 'AgentAudioDone') {
        emit(events, options, { type: 'status', label: 'Agent audio done', timestamp: now() });
        return;
      }
      emit(events, options, { type: 'status', label: String(record.type), timestamp: now() });
      return;
    }

    if (data instanceof Uint8Array) {
      emit(events, options, { type: 'audio', bytes: data.byteLength, timestamp: now() });
    }
  });

  connection.on('open', () => {
    emit(events, options, { type: 'status', label: 'Voice socket opened', timestamp: now() });
  });

  connection.on('close', () => {
    emit(events, options, { type: 'status', label: 'Voice socket closed', timestamp: now() });
  });

  connection.on('error', (error) => {
    emit(events, options, { type: 'error', message: error instanceof Error ? error.message : String(error), timestamp: now() });
  });

  connection.connect();
  await connection.waitForOpen();

  const keepAlive = setInterval(() => connection.sendKeepAlive({ type: 'KeepAlive' }), 5000);
  try {
    if (options.audio) {
      for await (const chunk of options.audio) {
        connection.sendMedia(chunk);
      }
      connection.finish?.();
    } else {
      emit(events, options, {
        type: 'status',
        label: 'No audio stream attached',
        detail: 'Use the SDK with a live PCM stream, or use browser voice where getUserMedia supplies audio.',
        timestamp: now(),
      });
    }
  } finally {
    clearInterval(keepAlive);
  }

  return { sessionId, events };
}
