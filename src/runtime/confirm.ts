export type ConfirmationRequest = {
  toolkitSlug: string;
  toolSlug: string;
  summary: string;
};

export type ConfirmationHandler = (request: ConfirmationRequest) => Promise<boolean>;

let currentHandler: ConfirmationHandler | undefined;

export async function withConfirmationHandler<T>(handler: ConfirmationHandler | undefined, run: () => Promise<T>) {
  const previous = currentHandler;
  currentHandler = handler;
  try {
    return await run();
  } finally {
    currentHandler = previous;
  }
}

export async function requestConfirmation(request: ConfirmationRequest) {
  if (!currentHandler) return false;
  return currentHandler(request);
}
