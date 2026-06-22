import { type Agent, generateObject } from 'ai';
import { z } from 'zod';
import { models } from '../config/models.js';

export type SwarmMessage = {
  from: string;
  to: string;
  content: string;
  priority: 'low' | 'medium' | 'high';
  metadata?: any;
};

export class SwarmOrchestrator {
  private static instance: SwarmOrchestrator;
  private departments: Map<string, string[]> = new Map([
    ['strategy', ['productManager']],
    ['engineering', ['coder', 'qa', 'devops']],
    ['growth', ['marketing', 'seo', 'social', 'sales']],
    ['operations', ['finance', 'support', 'legal', 'logistics']],
    ['data', ['dataScientist', 'bi']],
  ]);

  private constructor() {}

  static getInstance(): SwarmOrchestrator {
    if (!SwarmOrchestrator.instance) {
      SwarmOrchestrator.instance = new SwarmOrchestrator();
    }
    return SwarmOrchestrator.instance;
  }

  async classifyTask(task: string): Promise<{ department: string; subagent: string; reasoning: string }> {
    const { object } = await generateObject({
      model: models.manager,
      schema: z.object({
        department: z.enum(['strategy', 'engineering', 'growth', 'operations', 'data', 'general']),
        subagent: z.string(),
        reasoning: z.string(),
      }),
      prompt: `Analyze this business task and assign it to the most relevant department and subagent:
      Task: ${task}

      Available Departments: ${Array.from(this.departments.keys()).join(', ')}
      Available Subagents: ${Array.from(this.departments.values()).flat().join(', ')}`,
    });

    return object;
  }

  formatAgentRequest(message: SwarmMessage): string {
    return `[Swarm Message] From: ${message.from} | Priority: ${message.priority}\n\nTask: ${message.content}`;
  }
}
