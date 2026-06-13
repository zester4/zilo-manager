export type ConfirmationRequest = {
  toolkitSlug: string;
  toolSlug: string;
  summary: string;
  action?: string;
  access?: 'Read-only' | 'Write';
  targetTools?: string[];
  details?: string[];
};

export type ConfirmationHandler = (request: ConfirmationRequest) => Promise<boolean | 'session'>;

let currentHandler: ConfirmationHandler | undefined;
const sessionApprovals = new Set<string>();

function approvalKey(request: ConfirmationRequest): string {
  return `${request.toolkitSlug}/${request.toolSlug}/${request.action || ''}`;
}

export async function withConfirmationHandler<T>(handler: ConfirmationHandler | undefined, run: () => Promise<T>) {
  const previous = currentHandler;
  currentHandler = handler;
  sessionApprovals.clear(); // Clear session approvals when starting a new context
  try {
    return await run();
  } finally {
    currentHandler = previous;
  }
}

export async function requestConfirmation(request: ConfirmationRequest) {
  const key = approvalKey(request);
  
  // If already approved for this session, skip the prompt
  if (sessionApprovals.has(key)) {
    return true;
  }
  
  if (!currentHandler) return false;
  
  const result = await currentHandler(request);
  
  // If user approved for session, cache it
  if (result === 'session') {
    sessionApprovals.add(key);
    return true;
  }
  
  return result === true;
}
