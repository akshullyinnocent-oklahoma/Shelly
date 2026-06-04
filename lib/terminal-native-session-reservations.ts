const reservedNativeSessionIds = new Set<string>();

type NativeSessionCreateRecord = {
  attemptId: string;
  nativeSessionId: string;
  timedOut: boolean;
};

const nativeSessionCreateAttempts = new Map<string, NativeSessionCreateRecord>();

export function reserveNativeSessionId(nativeSessionId: string): void {
  if (nativeSessionId) reservedNativeSessionIds.add(nativeSessionId);
}

export function releaseNativeSessionId(nativeSessionId: string): void {
  if (nativeSessionId) reservedNativeSessionIds.delete(nativeSessionId);
}

export function getReservedNativeSessionIds(): string[] {
  return Array.from(reservedNativeSessionIds);
}

export function beginNativeSessionCreate(
  sessionId: string,
  nativeSessionId: string,
  attemptId: string,
): boolean {
  if (nativeSessionCreateAttempts.has(sessionId)) return false;
  nativeSessionCreateAttempts.set(sessionId, {
    attemptId,
    nativeSessionId,
    timedOut: false,
  });
  return true;
}

export function isNativeSessionCreateAttemptCurrent(
  sessionId: string,
  nativeSessionId: string,
  attemptId: string,
): boolean {
  const current = nativeSessionCreateAttempts.get(sessionId);
  return current?.attemptId === attemptId && current.nativeSessionId === nativeSessionId;
}

export function isNativeSessionCreateInFlight(sessionId: string): boolean {
  return nativeSessionCreateAttempts.has(sessionId);
}

export function markNativeSessionCreateTimedOut(
  sessionId: string,
  nativeSessionId: string,
  attemptId: string,
): boolean {
  const current = nativeSessionCreateAttempts.get(sessionId);
  if (current?.attemptId !== attemptId || current.nativeSessionId !== nativeSessionId) return false;
  current.timedOut = true;
  reserveNativeSessionId(nativeSessionId);
  return true;
}

export function isNativeSessionCreateTimedOut(sessionId: string, nativeSessionId: string): boolean {
  const current = nativeSessionCreateAttempts.get(sessionId);
  return current?.nativeSessionId === nativeSessionId && current.timedOut;
}

export function abandonNativeSessionCreateIfTimedOut(sessionId: string, nativeSessionId: string): boolean {
  const current = nativeSessionCreateAttempts.get(sessionId);
  if (current?.nativeSessionId !== nativeSessionId || !current.timedOut) return false;
  reserveNativeSessionId(nativeSessionId);
  nativeSessionCreateAttempts.delete(sessionId);
  return true;
}

export function reserveNativeSessionIdIfCreating(sessionId: string, nativeSessionId: string): boolean {
  const current = nativeSessionCreateAttempts.get(sessionId);
  if (current?.nativeSessionId !== nativeSessionId) return false;
  reserveNativeSessionId(nativeSessionId);
  nativeSessionCreateAttempts.delete(sessionId);
  return true;
}

export function endNativeSessionCreate(
  sessionId: string,
  nativeSessionId: string,
  attemptId: string,
): void {
  releaseNativeSessionId(nativeSessionId);
  if (isNativeSessionCreateAttemptCurrent(sessionId, nativeSessionId, attemptId)) {
    nativeSessionCreateAttempts.delete(sessionId);
  }
}
