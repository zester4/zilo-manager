import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';

if (existsSync('.env.local')) {
  loadDotenv({ path: '.env.local', override: false });
}

export type ImageProvider = 'openai' | 'gemini';

function normalizeImageProvider(value: string | undefined): ImageProvider {
  const provider = (value || 'openai').toLowerCase().trim();
  if (provider === 'chatgpt' || provider === 'gpt-image' || provider === 'gpt-image-2') return 'openai';
  if (provider === 'google' || provider === 'nano-banana' || provider === 'gemini') return 'gemini';
  return 'openai';
}

export type Env = {
  aiGatewayApiKey: string | undefined;
  vercelOidcToken: string | undefined;
  tavilyApiKey: string | undefined;
  composioApiKey: string | undefined;
  zilmateUserId: string | undefined;
  upstashRedisRestUrl: string | undefined;
  upstashRedisRestToken: string | undefined;
  managerModel: string;
  helpModel: string | undefined;
  postModel: string | undefined;
  imageDefaultProvider: ImageProvider;
  imageOpenaiModel: string;
  imageGeminiModel: string;
  imageModel: string;
};

export const env: Env = {
  aiGatewayApiKey: process.env.AI_GATEWAY_API_KEY,
  vercelOidcToken: process.env.VERCEL_OIDC_TOKEN,
  tavilyApiKey: process.env.TAVILY_API_KEY,
  composioApiKey: process.env.COMPOSIO_API_KEY,
  zilmateUserId: process.env.ZILMATE_USER_ID,
  upstashRedisRestUrl: process.env.UPSTASH_REDIS_REST_URL,
  upstashRedisRestToken: process.env.UPSTASH_REDIS_REST_TOKEN,
  managerModel: process.env.ZILO_MANAGER_MODEL || 'minimax/minimax-m3',
  helpModel: process.env.ZILO_HELP_MODEL || undefined,
  postModel: process.env.ZILO_POST_MODEL || undefined,
  imageDefaultProvider: normalizeImageProvider(process.env.ZILO_IMAGE_DEFAULT_PROVIDER),
  imageOpenaiModel: process.env.ZILO_IMAGE_OPENAI_MODEL || 'openai/gpt-image-2',
  imageGeminiModel: process.env.ZILO_IMAGE_GEMINI_MODEL || process.env.ZILO_IMAGE_MODEL || 'google/gemini-3-pro-image',
  imageModel: process.env.ZILO_IMAGE_MODEL || 'google/gemini-3-pro-image',
};

export function hasGatewayAuth() {
  return Boolean(env.aiGatewayApiKey || env.vercelOidcToken);
}

export function requireGatewayAuth() {
  if (!hasGatewayAuth()) {
    throw new Error('Missing AI Gateway auth. Run `zilmate setup`, add AI_GATEWAY_API_KEY to .env, or run with VERCEL_OIDC_TOKEN.');
  }
}

export function requireTavily() {
  if (!env.tavilyApiKey) {
    throw new Error('Missing TAVILY_API_KEY. Run `zilmate setup` or add it to .env to enable web research.');
  }
  return env.tavilyApiKey;
}

export function hasComposio() {
  return Boolean(env.composioApiKey && env.zilmateUserId);
}

export function requireComposio() {
  if (!env.composioApiKey) {
    throw new Error('Missing COMPOSIO_API_KEY. Run `zilmate setup` to enable external app tools.');
  }
  if (!env.zilmateUserId) {
    throw new Error('Missing ZILMATE_USER_ID. Run `zilmate setup` to generate a stable local user id.');
  }
}

export function hasRedis() {
  return Boolean(env.upstashRedisRestUrl && env.upstashRedisRestToken);
}
