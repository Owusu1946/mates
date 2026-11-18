// A send starts before thread initialization and the API request. The run ID arrives later.
let pendingSendAt: number | null = null;
const startedByRun = new Map<string, number>();

export function markSendTapped() {
  pendingSendAt = performance.now();
}

export function bindRunTiming(runId: string) {
  if (pendingSendAt === null) return;
  // Failed or abandoned runs may never render text; bound the in-memory samples.
  if (startedByRun.size >= 20) startedByRun.delete(startedByRun.keys().next().value!);
  startedByRun.set(runId, pendingSendAt);
  pendingSendAt = null;
}

/** Called after the first assistant text layout; consumes the sample once per run. */
export function takeFirstTextLayoutMs(runId: string) {
  const startedAt = startedByRun.get(runId);
  if (startedAt === undefined) return null;
  startedByRun.delete(runId);
  const elapsed = Math.round(performance.now() - startedAt);
  return elapsed >= 0 && elapsed <= 600_000 ? elapsed : null;
}
