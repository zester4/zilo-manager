export type ApprovalDecision = 'allowed' | 'needs_confirmation';

const dangerousIntentPattern = /\b(delete|drop|wipe|reset|transfer money|send payout|revoke)\b/i;

export function checkReadOnlyIntent(prompt: string): { decision: ApprovalDecision; reason?: string; operation?: string } {
  const match = prompt.match(dangerousIntentPattern);
  if (match) {
    const operation = match[0].toLowerCase();
    return { 
      decision: 'needs_confirmation', 
      operation,
      reason: `This is a potentially destructive ${operation} operation on your system. This CLI scaffold requires explicit approval for severe actions.` 
    };
  }
  return { decision: 'allowed' };
}
