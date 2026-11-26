/**
 * Reading a durable run's event stream (GET /v1/runs/:id/events, apps/api/src/run-events.ts): SSE
 * frames with a sequence cursor, each carrying the whole content so far. From
 * apps/mobile/src/chat/run-stream.ts; the phone moves onto this copy in a later change.
 */

export type RunStreamEvent = {
  version: 1;
  sequence: number;
  type: "progress" | "run.started" | "run.completed" | "run.waiting" | "run.failed" | "run.cancelled" | "memory.updated";
  timestamp: string;
  payload: Record<string, unknown>;
};

function parseFrame(frame: string): RunStreamEvent | null {
  let id: string | undefined;
  let data = "";
  for (const line of frame.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator < 0 ? line : line.slice(0, separator);
    const value = separator < 0 ? "" : line.slice(separator + 1).replace(/^ /, "");
    if (field === "id") id = value;
    if (field === "data") data += `${data ? "\n" : ""}${value}`;
  }
  if (!data) return null;
  const event = JSON.parse(data) as Partial<RunStreamEvent>;
  const types = ["progress", "run.started", "run.completed", "run.waiting", "run.failed", "run.cancelled", "memory.updated"];
  if (
    event.version !== 1 ||
    !Number.isSafeInteger(event.sequence) ||
    (event.sequence ?? 0) <= 0 ||
    !types.includes(event.type ?? "") ||
    typeof event.timestamp !== "string" ||
    !event.payload || typeof event.payload !== "object" || Array.isArray(event.payload) ||
    (id !== undefined && id !== String(event.sequence))
  ) throw new Error("The run stream returned an invalid event.");
  return event as RunStreamEvent;
}

/** Reads durable SSE frames while tolerating arbitrary network chunk and UTF-8 boundaries. */
export async function* readRunStreamEvents(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<RunStreamEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary = buffer.search(/\r?\n\r?\n/);
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)![0];
        buffer = buffer.slice(boundary + separator.length);
        const event = parseFrame(frame);
        if (event) yield event;
        boundary = buffer.search(/\r?\n\r?\n/);
      }
      if (done) { completed = true; break; }
    }
    if (buffer.trim()) {
      const event = parseFrame(buffer);
      if (event) yield event;
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
    if (!completed) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
