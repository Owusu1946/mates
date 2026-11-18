import type { ChatModelRunResult } from "@assistant-ui/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetch } from "expo/fetch";
import { resolveApiUrl } from "./chat-model";
import { bindRunTiming } from "./chat-timing";
import { readRunStreamEvents } from "./run-stream";

export type RunView = { id: string; chatId: string | null; status: string; sequence: number; content: Record<string, unknown>[]; error: string | null; assistantMessageId: string; parentId: string | null; createdAt: string; updatedAt: string };
const active = new Map<string, string>();
const stopRequested = new Set<string>();

/** An API refusal that keeps its status and code, so callers can tell "out of usage" from a failure. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string, readonly details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
  }
}

/** Out of usage (429 usage_limit) or no plan (402 plan_required): retrying won't help until it resets. */
export const isUsageLimit = (error: unknown): error is ApiError =>
  error instanceof ApiError && (error.code === "usage_limit" || error.code === "plan_required");

const usageListeners = new Set<() => void>();
const planRequiredListeners = new Set<() => void>();
/** Told when usage may have changed: a run finished, or the API said someone's out of usage. */
export function onUsageChange(listener: () => void) {
  usageListeners.add(listener);
  return () => void usageListeners.delete(listener);
}
/** Notifies the app shell immediately when a request is refused for having no plan. */
export function onPlanRequired(listener: () => void) {
  planRequiredListeners.add(listener);
  return () => void planRequiredListeners.delete(listener);
}
export const usageChanged = () => usageListeners.forEach((listener) => listener());

export async function runRequest<T>(getToken: () => Promise<string | null>, path: string, body?: unknown, signal?: AbortSignal, options?: { quietNotFound?: boolean; method?: "DELETE" }): Promise<T> {
  const base = resolveApiUrl();
  const token = await getToken();
  if (!base || !token) throw new Error("Sign in and reconnect to continue.");
  const response = await fetch(`${base}/v1/${path}`, { method: options?.method ?? (body === undefined ? "GET" : "POST"), headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal });
  if (!response.ok) {
    const value = await response.json().catch(() => null) as { error?: { message?: string; requestId?: string; code?: string } & Record<string, unknown> } | null;
    if (value?.error?.requestId && !(options?.quietNotFound && response.status === 404)) {
      console.error("[chat] API request failed", {
        path: `/v1/${path}`,
        status: response.status,
        requestId: value.error.requestId,
      });
    }
    const error = new ApiError(value?.error?.message ?? "Couldn’t reach your mate. Please try again.", response.status, value?.error?.code ?? "unknown", value?.error ?? {});
    if (error.code === "plan_required") planRequiredListeners.forEach((listener) => listener());
    if (isUsageLimit(error)) usageChanged();
    throw error;
  }
  return response.json() as Promise<T>;
}

export async function cancelBackgroundChat(getToken: () => Promise<string | null>, chatId: string) {
  stopRequested.add(chatId);
  const id = active.get(chatId);
  if (id) await stopRun(getToken, id);
  else {
    const { runs } = await runRequest<{ runs: { id: string; status: string }[] }>(getToken, `runs?chatId=${encodeURIComponent(chatId)}`);
    const running = runs.find(run => ["queued", "running"].includes(run.status));
    if (running) await stopRun(getToken, running.id);
  }
}

async function runEventStream(getToken: () => Promise<string | null>, id: string, after: number, signal: AbortSignal) {
  const base = resolveApiUrl();
  const token = await getToken();
  if (!base || !token) throw new Error("Sign in and reconnect to continue.");
  const cursor = Math.max(0, after);
  const response = await fetch(`${base}/v1/runs/${encodeURIComponent(id)}/events?after=${cursor}`, {
    headers: { authorization: `Bearer ${token}`, accept: "text/event-stream", "last-event-id": String(cursor) },
    signal,
  });
  if (!response.ok || !response.body) {
    const value = await response.json().catch(() => null) as { error?: { message?: string; code?: string } } | null;
    throw new ApiError(value?.error?.message ?? "The live reply stream is unavailable.", response.status, value?.error?.code ?? "stream_unavailable");
  }
  return response.body;
}

async function createDurableRun(getToken: () => Promise<string | null>, input: Record<string, unknown>) {
  const base = resolveApiUrl();
  const token = await getToken();
  if (!base || !token) throw new Error("Sign in and reconnect to continue.");
  const response = await fetch(`${base}/v1/runs`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "text/event-stream, application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const value = await response.json().catch(() => null) as { error?: { message?: string; code?: string } } | null;
    const error = new ApiError(value?.error?.message ?? "Couldn’t reach your mate. Please try again.", response.status, value?.error?.code ?? "unknown", value?.error ?? {});
    if (error.code === "plan_required") planRequiredListeners.forEach((listener) => listener());
    if (isUsageLimit(error)) usageChanged();
    throw error;
  }
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const id = response.headers.get("x-run-id");
    if (!id || !response.body) throw new Error("The live reply stream did not include a run id.");
    return { id, stream: response.body };
  }
  const data = await response.json() as { runId?: string };
  if (!data.runId) throw new Error("The run was accepted without an id.");
  return { id: data.runId, stream: null };
}

/**
 * Asks the server to stop a run, retrying briefly. Not tied to the request's abort signal, which
 * has already fired by the time someone taps Stop.
 */
async function stopRun(getToken: () => Promise<string | null>, id: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await runRequest(getToken, `runs/${id}/cancel`, {});
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
}

export async function* backgroundChat(getToken: () => Promise<string | null>, input: Record<string, unknown>, signal: AbortSignal): AsyncGenerator<ChatModelRunResult> {
  const chatId = String(input.chatId);
  const storageKey = `cooper:submission:${chatId}:${String(input.requestKey)}`;
  let id = await AsyncStorage.getItem(storageKey);
  let liveStream: ReadableStream<Uint8Array> | null = null;
  if (!id) {
    let error: unknown;
    for (let attempt = 0; attempt < 3 && !id; attempt++) {
      try {
        // Not aborted with the request: if Stop is tapped mid-send, the run's id still comes back so it can be stopped.
        const created = await createDurableRun(getToken, input);
        id = created.id;
        liveStream = created.stream;
        await AsyncStorage.setItem(storageKey, id);
      } catch (cause) { error = cause; if (signal.aborted || isUsageLimit(cause)) throw cause; await delay(500 * (attempt + 1), signal); }
    }
    if (!id) throw error;
  }
  const runId = id;
  if (!input.resumeRunId) bindRunTiming(runId);
  if (signal.aborted) {
    if (stopRequested.has(chatId)) void stopRun(getToken, runId);
    stopRequested.delete(chatId);
    return;
  }
  // Stop on screen is instant; the server is told right away, in the background.
  active.set(chatId, id);
  let cursor = 0;
  let failures = 0;
  yield { content: [{ type: "tool-call", toolCallId: `queued_${id}`, toolName: "cooper_workflow", args: {}, argsText: "{}", result: { kind: "step", phase: "running", label: "Cooper is starting", detail: "You can leave the app. Your result will be saved." } }] };
  try {
    try {
      const stream = liveStream ?? await runEventStream(getToken, id, cursor, signal);
      for await (const event of readRunStreamEvents(stream, signal)) {
        if (signal.aborted) return;
        if (event.sequence <= cursor) continue;
        cursor = event.sequence;
        const payload = event.payload as { content?: unknown; status?: unknown; error?: unknown };
        const content = Array.isArray(payload.content) ? payload.content as Record<string, unknown>[] : [];
        if (content.length) yield { content: content as unknown as NonNullable<ChatModelRunResult["content"]>, metadata: { custom: { delegationId: id } } };
        const status = typeof payload.status === "string" ? payload.status : "running";
        if (["completed", "waiting", "failed", "cancelled"].includes(status)) {
          usageChanged();
          if (status === "cancelled") yield { content: content as unknown as NonNullable<ChatModelRunResult["content"]>, status: { type: "incomplete", reason: "cancelled" }, metadata: { custom: { delegationId: id } } };
          if (status === "failed") yield { content: [...content, { type: "text", text: typeof payload.error === "string" ? payload.error : "This task couldn’t finish. Earlier findings are saved." }] as unknown as NonNullable<ChatModelRunResult["content"]>, status: { type: "incomplete", reason: "error" }, metadata: { custom: { delegationId: id } } };
          return;
        }
      }
      if (signal.aborted) return;
    } catch {
      if (signal.aborted) return;
      // The durable run keeps going if this transport drops; polling recovers its latest saved state.
      failures++;
    }
    while (!signal.aborted) {
      try {
        const { run } = await runRequest<{ run: RunView }>(getToken, `runs/${id}?after=${Math.max(0, cursor)}`, undefined, signal);
        failures = 0;
        if (run.sequence !== cursor) {
          cursor = run.sequence;
          if (run.content.length) yield { content: run.content as unknown as NonNullable<ChatModelRunResult["content"]>, metadata: { custom: { delegationId: id } } };
        }
        if (["completed", "waiting", "failed", "cancelled"].includes(run.status)) {
          usageChanged();
          // Stopped elsewhere (another device, or before this screen saw it): show it as cancelled.
          if (run.status === "cancelled") {
            yield { content: run.content as unknown as NonNullable<ChatModelRunResult["content"]>, status: { type: "incomplete", reason: "cancelled" }, metadata: { custom: { delegationId: id } } };
          }
          if (run.status === "failed") {
            yield { content: [...run.content, { type: "text", text: run.error ?? "This task couldn’t finish. Earlier findings are saved." }] as unknown as NonNullable<ChatModelRunResult["content"]>, status: { type: "incomplete", reason: "error" }, metadata: { custom: { delegationId: id } } };
          }
          return;
        }
      } catch (cause) {
        if (signal.aborted) return; // Detach transport; the server run continues.
        failures++;
        if (failures > 8) throw new Error("Connection interrupted. The work carries on; reopen this chat to recover the saved result.");
        await delay(Math.min(5000, failures * 700), signal);
      }
      await delay(600, signal);
    }
  } finally {
    if (active.get(chatId) === id) active.delete(chatId);
    stopRequested.delete(chatId);
  }
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>(resolve => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(); };
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}
