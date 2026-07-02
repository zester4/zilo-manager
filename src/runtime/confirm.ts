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
let confirmationActive = false;
let confirmationTail: Promise<unknown> = Promise.resolve();

function approvalKey(request: ConfirmationRequest): string {
  const action = request.action || request.summary;
  return `${request.toolkitSlug}/${request.toolSlug}/${action}`;
}

function toolkitApprovalKey(request: ConfirmationRequest): string {
  return `toolkit:${request.toolkitSlug}`;
}

function enqueueConfirmation<T>(run: () => Promise<T>): Promise<T> {
  const next = confirmationTail.then(run);
  confirmationTail = next.catch(() => undefined);
  return next;
}

export function isConfirmationActive() {
  return confirmationActive;
}

export function hasSessionApproval(request: ConfirmationRequest) {
  return sessionApprovals.has(approvalKey(request));
}

export function clearSessionApprovals() {
  sessionApprovals.clear();
}

export async function withConfirmationHandler<T>(handler: ConfirmationHandler | undefined, run: () => Promise<T>) {
  const previous = currentHandler;
  currentHandler = handler;
  try {
    return await run();
  } finally {
    currentHandler = previous;
  }
}

function isAutoApproved(request: ConfirmationRequest): boolean {
  const autoApprove = (process.env.ZILMATE_AUTO_APPROVE || '').trim().toLowerCase();
  if (!autoApprove || autoApprove === 'false') {
    return false;
  }

  // Option 1: Approve everything
  if (autoApprove === 'true' || autoApprove === 'all' || autoApprove === 'yes') {
    return true;
  }

  // Option 2: Approve all read-only operations
  if (autoApprove === 'read-only' || autoApprove === 'readonly') {
    return request.access === 'Read-only';
  }

  // Option 3: Comma-separated lists of allowed toolkits or tools
  const items = autoApprove.split(',').map((s) => s.trim()).filter(Boolean);
  if (items.length > 0) {
    const toolkit = request.toolkitSlug.toLowerCase();
    const tool = request.toolSlug.toLowerCase();
    const targetTools = (request.targetTools || []).map((t) => t.toLowerCase());

    for (const item of items) {
      if (item === 'read-only' || item === 'readonly') {
        if (request.access === 'Read-only') return true;
      } else if (item === toolkit || item === tool || targetTools.includes(item)) {
        return true;
      }
    }
  }

  return false;
}

async function notifyAutoApproval(request: ConfirmationRequest) {
  try {
    const { emitProgress } = await import('./progress.js');
    emitProgress({
      type: 'step',
      label: `Auto-approved permission`,
      detail: `${request.action || request.summary} (${request.access || 'Write'})`,
    });
  } catch {
    // fallback to no-op
  }
}

export async function requestConfirmation(request: ConfirmationRequest) {
  if (isAutoApproved(request)) {
    await notifyAutoApproval(request);
    return true;
  }

  const key = approvalKey(request);
  const toolkitKey = toolkitApprovalKey(request);

  if (sessionApprovals.has(key) || sessionApprovals.has(toolkitKey)) {
    return true;
  }

  return enqueueConfirmation(async () => {
    if (sessionApprovals.has(key)) {
      return true;
    }

    if (!currentHandler) {
      return false;
    }

    confirmationActive = true;
    try {
      const result = await currentHandler(request);

      if (result === 'session') {
        // If the user approves for the whole toolkit or just this action
        if (request.toolkitSlug && request.toolkitSlug !== 'local') {
          sessionApprovals.add(toolkitKey);
        } else {
          sessionApprovals.add(key);
        }
        return true;
      }

      return result === true;
    } finally {
      confirmationActive = false;
    }
  });
}
