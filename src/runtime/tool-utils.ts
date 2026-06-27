import { tool, type Tool } from 'ai';
import { z, type ZodType } from 'zod';
import { emitProgress } from './progress.js';

export type ToolDefinition<INPUT extends ZodType<any>, OUTPUT> = {
  description: string;
  inputSchema: INPUT;
  execute: (input: z.infer<INPUT>, context: { abortSignal?: AbortSignal }) => Promise<OUTPUT>;
  group?: string;
};

export function defineTool<INPUT extends ZodType<any>, OUTPUT>(
  name: string,
  def: ToolDefinition<INPUT, OUTPUT>
): Tool<z.infer<INPUT>, OUTPUT> {
  return tool({
    description: def.description,
    // @ts-ignore - Vercel AI SDK v6 type compatibility with generic Zod types
    inputSchema: def.inputSchema,
    // @ts-ignore
    execute: async (input: z.infer<INPUT>, context: { abortSignal?: AbortSignal }) => {
      emitProgress({
        type: 'tool:start',
        label: `Executing ${name}`,
        ...(def.group ? { detail: `Group: ${def.group}` } : {})
      });

      try {
        const result = await def.execute(input, context);
        emitProgress({ type: 'tool:end', label: `${name} completed` });
        return result;
      } catch (error) {
        emitProgress({
          type: 'tool:error',
          label: `${name} failed`,
          detail: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    },
  });
}

export function describeTool(name: string) {
  const labels: Record<string, string> = {
    quickHelp: 'Using quick-help subagent',
    chat: 'Using chat subagent',
    post: 'Using post-writing subagent',
    image: 'Using image generation subagent',
    research: 'Using research subagent',
    automationPlanner: 'Using automation planner subagent',
    personalAssistant: 'Using personal assistant subagent',
    developerHelper: 'Using developer helper subagent',
    security: 'Using security subagent',
    coding: 'Using coding subagent',
    goalManager: 'Using goal manager subagent',
    digitalCorporation: 'Delegating to Digital Corporation',
    readScratchpad: 'Reading scratchpad',
    appendScratchpad: 'Updating scratchpad',
    rememberMemory: 'Saving memory',
    recallMemory: 'Recalling memory',
    listMemory: 'Listing memory',
    forgetMemory: 'Forgetting memory',
    listZiloDocs: 'Listing Zilo docs',
    readZiloDoc: 'Reading Zilo doc',
    searchZiloDocs: 'Searching Zilo docs',
    listTriggerTypes: 'Listing trigger types',
    showTriggerType: 'Loading trigger schema',
    listTriggers: 'Listing triggers',
    createTrigger: 'Creating trigger',
    createJob: 'Creating job',
    listJobs: 'Listing jobs',
    showJob: 'Loading job',
    listJobLogs: 'Loading job logs',
    cancelJob: 'Cancelling job',
    getCurrentTime: 'Checking time',
    searchFiles: 'Searching files',
    readFile: 'Reading file',
    writeFile: 'Writing file',
    createFolder: 'Creating folder',
    moveCopyRename: 'Moving/copying/renaming file',
    deleteFile: 'Deleting file',
    deleteFolder: 'Deleting folder',
    listDirectory: 'Listing directory',
    getFileInfo: 'Getting file info',
    summarizeDocument: 'Summarizing document',
    watchFolderChanges: 'Checking folder changes',
    findDuplicateLargeFiles: 'Finding duplicate/large files',
    readClipboard: 'Reading clipboard',
    writeClipboard: 'Writing clipboard',
    takeScreenshot: 'Taking screenshot',
    analyzeScreenshot: 'Analyzing screenshot',
    takeCameraPhoto: 'Taking camera photo',
    analyzeCameraPhoto: 'Analyzing camera photo',
    openFile: 'Opening file',
    openApplication: 'Opening application',
    getSystemInfo: 'Getting system info',
    listRunningApplications: 'Listing running apps',
    simulateKeyboard: 'Sending keyboard input',
    executeCommand: 'Executing command',
    installDependencies: 'Installing dependencies',
    runPipeline: 'Running command pipeline',
    pythonScript: 'Running Python script',
    listProcesses: 'Listing processes',
    findInPath: 'Searching PATH',
    COMPOSIO_SEARCH_TOOLS: 'Searching Composio tools',
    COMPOSIO_GET_TOOL_SCHEMAS: 'Loading Composio tool schemas',
    COMPOSIO_MANAGE_CONNECTIONS: 'Managing Composio connection',
    COMPOSIO_MULTI_EXECUTE_TOOL: 'Executing Composio tool',
    COMPOSIO_REMOTE_WORKBENCH: 'Using Composio workbench',
    COMPOSIO_REMOTE_BASH_TOOL: 'Using Composio bash tool',
    installComputerUseDeps: 'Installing computer-use dependencies',
    mouseAction: 'Controlling mouse',
    keyboardAction: 'Simulating keyboard input',
    readScreen: 'Reading screen contents',
    manageWindow: 'Managing application windows',
    findOnScreen: 'Finding UI element on screen',
    dragAndDrop: 'Dragging and dropping',
    getWeather: 'Getting weather forecast',
    getForecast: 'Getting multi-day weather forecast',
    getCurrentLocation: 'Detecting location from IP',
    addMCPServer: 'Adding MCP server',
    listMCPServers: 'Listing MCP servers',
    removeMCPServer: 'Removing MCP server',
    delegateToSpecialist: 'Delegating task',
    classifyAndDelegate: 'Classifying and routing task',
    updateStatusReport: 'Updating status report',
  };
  return labels[name] || `Using ${name}`;
}

export function toolNamesFromStep(step: unknown) {
  const toolCalls = (step as { toolCalls?: Array<{ toolName?: string }> }).toolCalls || [];
  return toolCalls.map((call) => call.toolName).filter((name): name is string => Boolean(name));
}
