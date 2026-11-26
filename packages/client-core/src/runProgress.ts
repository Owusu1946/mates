import { RUN_SETTLED } from "./runRequest.ts";
import type { RunStreamEvent } from "./runStream.ts";

/**
 * Following a durable run: what the reply says so far and where the stream is. Each event carries
 * the whole content up to then (not a delta), so the newest one wins; an event at or before the
 * cursor was already applied (a replay after reconnecting) and is skipped. The same rules apply to
 * a polled snapshot (GET /v1/runs/:id), so a stream and a poll can take turns without doubling text.
 */

export type RunProgress = {
  /** The last event applied; reconnecting asks for what comes after it. */
  cursor: number;
  content: unknown[];
  status: string;
  error: string | null;
  /** Finished, waiting on you, failed or stopped: nothing more will come. */
  settled: boolean;
};

export const startProgress = (): RunProgress => ({ cursor: 0, content: [], status: "queued", error: null, settled: false });

/** Applies one stream event, or returns the same progress when it was already applied. */
export function applyRunEvent(progress: RunProgress, event: RunStreamEvent): RunProgress {
  if (event.sequence <= progress.cursor) return progress;
  const payload = event.payload as { content?: unknown; status?: unknown; error?: unknown };
  const status = typeof payload.status === "string" ? payload.status : progress.status;
  return {
    cursor: event.sequence,
    content: Array.isArray(payload.content) && payload.content.length ? payload.content : progress.content,
    status,
    error: typeof payload.error === "string" ? payload.error : progress.error,
    settled: RUN_SETTLED.has(status),
  };
}

/** Applies a polled snapshot of the run, the same way. */
export function applyRunSnapshot(progress: RunProgress, run: { sequence: number; content: unknown[]; status: string; error: string | null }): RunProgress {
  if (run.sequence < progress.cursor) return progress;
  return {
    cursor: run.sequence,
    content: run.content.length ? run.content : progress.content,
    status: run.status,
    error: run.error ?? progress.error,
    settled: RUN_SETTLED.has(run.status),
  };
}

/** What a failed run leaves in the chat: its findings so far, then why it stopped. */
export function settledContent(progress: RunProgress): unknown[] {
  if (progress.status !== "failed") return progress.content;
  return [...progress.content, { type: "text", text: progress.error ?? "This task couldn’t finish. Earlier findings are saved." }];
}

/**
 * How long to wait before trying again: doubling from `base`, capped, with jitter so many clients
 * don't retry in step (T3 Code's connection supervisor). `random` is injectable for tests.
 */
export function retryDelay(attempt: number, { base = 500, cap = 10_000, random = Math.random }: { base?: number; cap?: number; random?: () => number } = {}): number {
  const ceiling = Math.min(cap, base * 2 ** Math.max(0, attempt));
  return Math.round(ceiling / 2 + (ceiling / 2) * random());
}
