# ZilMate SDK: Quickstart Guide

This guide will walk you through installing the SDK, setting up your first server script, and deploying a fully functional, production-ready, streaming chatbot using Next.js App Router and a glassmorphic React frontend.

---

## 1. Installation

Install the core package inside your TypeScript / Node.js project:

```bash
npm install zilmate
```

Ensure your `.env` file contains your gateway credentials:

```env
AI_GATEWAY_API_KEY=your-api-gateway-key-here
ZILMATE_USER_ID=zilmate-admin-id
```

---

## 2. Basic Server Initialization

Create a simple script (e.g., `index.ts`) to test the single-turn agentic completion:

```typescript
import { createZilMate } from 'zilmate/server';

async function main() {
  // Initialize the SDK with a durable sessionId for tracking long-term memories
  const zilmate = createZilMate({
    sessionId: 'session_prod_user_42',
    onProgress: (event) => {
      // Captures progress events (e.g. tool execution, thinking state shifts)
      console.log(`[${event.type.toUpperCase()}] ${event.label}: ${event.detail || ''}`);
    },
  });

  console.log('🌌 Querying ZilMate Manager...');
  const { text } = await zilmate.manager({
    message: 'Review our repository health, open files, and summarize our active tasks.'
  });

  console.log('\n📝 ZilMate Response:');
  console.log(text);
}

main().catch(console.error);
```

To run this file with TypeScript support, use `tsx` or `ts-node`:

```bash
npx tsx index.ts
```

---

## 3. Streaming Server Route (Next.js App Router)

To provide an interactive, real-time user experience, stream the agent's progress events and final answer using newline-delimited JSON (NDJSON) or Server-Sent Events (SSE). 

Create `app/api/zilmate/route.ts` inside your Next.js application:

```typescript
import { createZilMate } from 'zilmate/server';

export const runtime = 'nodejs'; // Use nodejs environment for full system tool compatibility
export const maxDuration = 300;  // 5-minute timeout for deep sandbox-compilation runs

export async function POST(request: Request) {
  try {
    const { message, sessionId = 'web_default_session' } = await request.json();

    if (!message) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const encoder = new TextEncoder();

    // Create a readable stream to push real-time events to the frontend
    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: unknown) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        };

        const zilmate = createZilMate({
          sessionId,
          onProgress: (event) => {
            // Forward live progress events (thinking, tool starts, tool ends, subagents)
            send({ type: 'progress', event });
          },
          confirm: async (req) => {
            // For hosted API endpoints, return false or connect to a pending approvals table.
            // By default, we auto-approve standard tool runs or handle them in secure sandbox.
            send({ type: 'confirmation_required', request: req });
            return true; 
          }
        });

        try {
          const { text } = await zilmate.manager({ message });
          send({ type: 'done', text });
        } catch (error) {
          send({
            type: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
```

---

## 4. Glassmorphic Chat UI & Client Hook

Below is a premium React integration utilizing Vanilla Tailwind styling, dynamic animations, hover micro-interactions, and status widgets showing the agent's actual tool call execution.

### The React Hook: `useZilMate.ts`

```typescript
'use client';

import { useState } from 'react';

export interface ProgressEvent {
  type: string;
  label: string;
  detail?: string;
  agent?: string;
  department?: string;
  durationMs?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  progressLog?: ProgressEvent[];
}

export function useZilMate(sessionId: string = 'web_user_1') {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentProgress, setCurrentProgress] = useState<ProgressEvent[]>([]);

  async function sendMessage(text: string) {
    if (!text.trim() || isGenerating) return;

    setIsGenerating(true);
    setCurrentProgress([]);
    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const response = await fetch('/api/zilmate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId }),
      });

      if (!response.body) throw new Error('Readable stream not supported by browser.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalReply = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // Keep incomplete last chunk in buffer

        for (const line of lines) {
          if (!line.trim()) continue;
          const chunk = JSON.parse(line);

          if (chunk.type === 'progress') {
            setCurrentProgress((prev) => [...prev, chunk.event]);
          } else if (chunk.type === 'done') {
            finalReply = chunk.text;
          } else if (chunk.type === 'error') {
            throw new Error(chunk.message);
          }
        }
      }

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: finalReply,
        progressLog: currentProgress,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `❌ Error: ${error.message}` },
      ]);
    } finally {
      setIsGenerating(false);
      setCurrentProgress([]);
    }
  }

  return { messages, isGenerating, currentProgress, sendMessage };
}
```

### The Component: `ZilMateChat.tsx`

```tsx
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useZilMate } from './useZilMate';

export function ZilMateChat() {
  const [input, setInput] = useState('');
  const { messages, isGenerating, currentProgress, sendMessage } = useZilMate('web_user_1');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentProgress]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input);
    setInput('');
  };

  return (
    <div className="flex flex-col h-[700px] w-full max-w-4xl mx-auto rounded-2xl border border-white/10 bg-slate-950/80 backdrop-blur-xl shadow-2xl text-white overflow-hidden">
      {/* Premium Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-cyan-400 animate-pulse" />
          <h2 className="text-lg font-semibold tracking-wide bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">
            ZilMate Agent Terminal
          </h2>
        </div>
        <span className="text-xs text-white/40 tracking-wider uppercase bg-white/5 px-2.5 py-1 rounded-md">
          v1.10.4 Active
        </span>
      </div>

      {/* Messages Viewport */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 scrollbar-thin scrollbar-thumb-white/10">
        {messages.map((msg, index) => (
          <div key={index} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed shadow-lg ${
              msg.role === 'user' 
                ? 'bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white rounded-br-none' 
                : 'bg-white/5 border border-white/10 text-slate-100 rounded-bl-none'
            }`}>
              {msg.content}
            </div>

            {/* Traced progress tree for assistants */}
            {msg.progressLog && msg.progressLog.length > 0 && (
              <div className="mt-2 text-xs text-white/40 space-y-1 pl-2 border-l border-white/10 ml-1">
                {msg.progressLog.map((prog, pi) => (
                  <div key={pi} className="flex items-center gap-1.5 hover:text-cyan-300 transition-colors duration-150">
                    <span className="text-cyan-400">⚡</span>
                    <span>[{prog.type.toUpperCase()}] {prog.label}</span>
                    {prog.detail && <span className="opacity-60 font-mono">({prog.detail})</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Live Active Generator Widget */}
        {isGenerating && (
          <div className="flex flex-col gap-2 items-start animate-fade-in">
            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-cyan-200/90 flex items-center gap-3">
              <svg className="animate-spin h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Agent is thinking...</span>
            </div>

            {/* Live Progress Logs */}
            {currentProgress.length > 0 && (
              <div className="text-xs text-white/30 space-y-1 pl-4 border-l border-cyan-500/20 ml-2 animate-pulse">
                {currentProgress.slice(-3).map((prog, pi) => (
                  <div key={pi} className="flex items-center gap-1">
                    <span className="text-cyan-400">⎋</span>
                    <span>[{prog.type.toUpperCase()}] {prog.label}</span>
                    {prog.detail && <span className="opacity-50 text-[10px] font-mono">({prog.detail.slice(0, 50)})</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-white/10 bg-white/5 flex gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask ZilMate to code, research, or start a swarm..."
          disabled={isGenerating}
          className="flex-1 px-4 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-sm placeholder-white/30 text-white focus:outline-none focus:border-cyan-400/75 focus:ring-1 focus:ring-cyan-400/50 disabled:opacity-50 transition-all duration-200"
        />
        <button
          type="submit"
          disabled={isGenerating || !input.trim()}
          className="px-5 py-2.5 bg-gradient-to-r from-cyan-400 to-indigo-500 hover:from-cyan-300 hover:to-indigo-400 text-slate-950 text-sm font-semibold rounded-xl disabled:opacity-40 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-md shadow-cyan-500/10 flex items-center gap-2"
        >
          Send
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>
      </form>
    </div>
  );
}
```
