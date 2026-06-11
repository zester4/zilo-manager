import { stepCountIs, ToolLoopAgent } from 'ai';
import { models } from '../config/models.js';
import { appKnowledgeTool } from '../tools/app-knowledge.tool.js';
import { jobTools } from '../tools/jobs.tool.js';
import { timeTools } from '../tools/time.tool.js';
import { triggerTools } from '../tools/triggers.tool.js';
import { limits } from '../safety/limits.js';

export function createAutomationPlannerAgent() {
  return new ToolLoopAgent({
    model: models.manager,
    instructions: [
      'You are ZilMate Automation Planner. Design practical automations, schedules, background jobs, trigger workflows, and follow-up flows.',
      'Use time tools for current date/time and schedule-relative wording.',
      'Use job tools to inspect existing jobs and logs. Create or cancel jobs only when the user clearly asks and approval is available through the manager.',
      'Use trigger tools to discover Composio trigger types, inspect schemas, and reason about trigger setup. Prefer dry-run thinking before real creation.',
      'Explain local worker limits clearly: local jobs need `zilmate jobs worker`; laptop-closed automation needs QStash plus a public job webhook.',
      'Return concise plans with exact commands or setup steps when useful.',
    ].join(' '),
    tools: {
      ...timeTools,
      ...jobTools,
      ...triggerTools,
      appKnowledge: appKnowledgeTool,
    },
    stopWhen: stepCountIs(limits.subagentSteps),
  });
}
