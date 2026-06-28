import { generateObject } from 'ai';
import { z } from 'zod';
import { models } from '../config/models.js';
import { addWikiFact, queryWiki } from '../memory/corporate-wiki.js';
import { emitProgress } from '../runtime/progress.js';

export async function runPostSessionOptimization(sessionId: string): Promise<{ success: boolean; guidelinesCount: number }> {
  try {
    emitProgress({ type: 'thinking', label: 'Analyzing session trace for post-mortem optimization...' });
    
    const { loadSessionSpans } = await import('./traces.js');
    const spans = await loadSessionSpans(sessionId);
    
    if (!spans || spans.length === 0) {
      return { success: false, guidelinesCount: 0 };
    }

    const spanSummaries = spans.map(s => ({
      agentName: s.agentName,
      department: s.department,
      task: s.task,
      status: s.status,
      durationMs: s.durationMs,
      error: s.error,
      events: s.events.map(e => ({ type: e.type, label: e.label, detail: e.detail }))
    }));

    // Step 1: Identify unique agents and fetch their existing guidelines from the Corporate Wiki
    const uniqueAgentNames = Array.from(new Set(spans.map(s => s.agentName).filter(Boolean)));
    const existingGuidelinesMap: Record<string, string[]> = {};
    
    for (const agentName of uniqueAgentNames) {
      try {
        const existing = await queryWiki(`optimization guidelines for ${agentName}`, 10).catch(() => []);
        if (existing && existing.length > 0) {
          existingGuidelinesMap[agentName] = existing.map(e => e.content);
        }
      } catch {
        // Fallback for individual queries
      }
    }

    // Step 2: Use LLM to synthesize guidelines with a dual-pronged approach (Failures + Successes)
    // and native semantic deduplication
    const { object } = await generateObject({
      model: models.manager,
      schema: z.object({
        guidelines: z.array(
          z.object({
            agentName: z.string().describe('The exact name of the agent to optimize, matching agentName from the spans (e.g. "SecOps Officer").'),
            guideline: z.string().describe('The concrete, actionable, and specific instruction/guideline for this agent based on session trace.'),
            type: z.enum(['defensive-guardrail', 'offensive-accelerator']).describe('Whether this guideline is defensive (prevents failure/error) or offensive (replicates a success/best-practice design pattern).'),
            isUpdateOfExisting: z.boolean().describe('Set to true if this is a refinement of an existing guideline from the provided list, false if it is a completely new guideline.')
          })
        )
      }),
      prompt: `You are the ZilMate Swarm Performance Optimization Engine.
You are analyzing the trace telemetry of a multi-agent session to extract durable, high-impact guidelines that prevent future failures and scale stellar successes.

Here are the existing guidelines currently published for each active agent:
${JSON.stringify(existingGuidelinesMap, null, 2)}

Here is the trace telemetry from the current session:
${JSON.stringify(spanSummaries, null, 2)}

Analyze the current session's traces and compare them with the existing guidelines.
Your goal is to output a structured list of optimization guidelines.

CRITICAL RULES:
1. DO NOT generate redundant or duplicate guidelines that overlap with what is already published.
- If an existing guideline fully covers a failure or success from this session, do NOT output it.
- If an existing guideline is partially relevant but needs refinement, output an updated and enhanced version of it (set "isUpdateOfExisting" to true).
- If a new failure or success occurred that is not covered by any existing guideline, synthesize a new guideline (set "isUpdateOfExisting" to false).

2. DUAL-PRONGED FOCUS:
- FAILURE MODES (defensive-guardrail): Identify failures, errors, or friction points (especially in agents with status "failed"). Synthesize concrete guidelines to prevent these in the future.
- SUCCESS MODES (offensive-accelerator): Identify stellar successes, exceptionally fast execution, or optimal tool paths (status "success"). Synthesize actionable design patterns or best practices to replicate this excellent performance in future sessions.`
    });

    let count = 0;
    for (const item of object.guidelines) {
      if (item.agentName && item.guideline) {
        const typeBadge = item.type === 'offensive-accelerator' ? '🚀 Success Booster' : '🛡️ Safety Guardrail';
        const isUpdateText = item.isUpdateOfExisting ? ' (Refined existing)' : '';
        emitProgress({ 
          type: 'step', 
          label: `Publishing optimization guideline for ${item.agentName} [${typeBadge}]${isUpdateText}` 
        });
        
        // The topic matches what SwarmAgent.init() queries: "optimization guidelines for ${this.config.name}"
        await addWikiFact(item.guideline, {
          topic: `optimization guidelines for ${item.agentName}`,
          sessionId,
          type: 'learning-optimization',
          guidelineType: item.type,
          isUpdateOfExisting: item.isUpdateOfExisting,
          publishedBy: 'Performance Harvester'
        });
        count++;
      }
    }

    emitProgress({ type: 'done', label: `Post-session optimization complete. Generated ${count} guidelines.` });
    return { success: true, guidelinesCount: count };
  } catch (err: any) {
    emitProgress({ type: 'step', label: `Post-session optimization failed: ${err.message}` });
    return { success: false, guidelinesCount: 0 };
  }
}

