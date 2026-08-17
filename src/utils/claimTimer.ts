/** Fresh claim window after a number is reserved again (never leftover time). */
export const FRESH_CLAIM_WINDOW_MS = 15 * 60 * 1000;

export function pausedClaimTimerFields() {
  return {
    claimingStartedAt: null,
    claimingExpiresAt: null,
  };
}

export function resumedClaimTimerFields(
  numberData: {
    claimingAgentId?: string | null;
    claimQueue?: Array<{ agentId?: string }> | null;
  },
  now: Date = new Date()
) {
  const claimQueue = Array.isArray(numberData.claimQueue) ? numberData.claimQueue : [];
  const firstClaimerId =
    numberData.claimingAgentId ||
    claimQueue.find((claim) => claim?.agentId)?.agentId ||
    null;

  if (!firstClaimerId) {
    return {
      claimingAgentId: null,
      claimingExpiresAt: null,
      claimQueue: [] as Array<{ agentId?: string }>,
    };
  }

  return {
    claimingAgentId: firstClaimerId,
    claimingExpiresAt: new Date(now.getTime() + FRESH_CLAIM_WINDOW_MS),
    claimQueue,
  };
}
