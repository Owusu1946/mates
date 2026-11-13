import type { ChatModelRunResult } from "@assistant-ui/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetch } from "expo/fetch";
import { resolveApiUrl } from "./chat-model";

export type RunView = { id: string; chatId: string | null; status: string; sequence: number; content: Record<string, unknown>[]; error: string | null; assistantMessageId: string; parentId: string | null; createdAt: string; updatedAt: string };
const active = new Map<string, string>();

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
/** Told when usage may have changed: a run finished, or the API said someone's out of usage. */
export function onUsageChange(listener: () => void) {
  usageListeners.add(listener);
  return () => void usageListeners.delete(listener);
}
export const usageChanged = () => usageListeners.forEach((listener) => listener());

export async function runRequest<T>(getToken: () => Promise<string | null>, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const base = resolveApiUrl();
  const token = await getToken();
  if (!base || !token) throw new Error("Sign in and reconnect to continue.");
  const response = await fetch(`${base}/v1/${path}`, { method: body === undefined ? "GET" : "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal });
  if (!response.ok) {
    const value = await response.json().catch(() => null) as { error?: { message?: string; requestId?: string; code?: string } & Record<string, unknown> } | null;
    if (value?.error?.requestId) {
      console.error("[chat] API request failed", {
        path: `/v1/${path}`,
        status: response.status,
        requestId: value.error.requestId,
      });
    }
    const error = new ApiError(value?.error?.message ?? "Couldn’t reach your mate. Please try again.", response.status, value?.error?.code ?? "unknown", value?.error ?? {});
    if (isUsageLimit(error)) usageChanged();
    throw error;
  }
  return response.json() as Promise<T>;
}

export async function cancelBackgroundChat(getToken: () => Promise<string | null>, chatId: string) {
  const id = active.get(chatId);
  if (id) await runRequest(getToken, `runs/${id}/cancel`, {});
  else {
    const { runs } = await runRequest<{ runs: { id: string; status: string }[] }>(getToken, `runs?chatId=${encodeURIComponent(chatId)}`);
    const running = runs.find(run => ["queued", "running"].includes(run.status));
    if (running) await runRequest(getToken, `runs/${running.id}/cancel`, {});
  }
}

export async function* backgroundChat(getToken: () => Promise<string | null>, input: Record<string, unknown>, signal: AbortSignal): AsyncGenerator<ChatModelRunResult> {
  const chatId = String(input.chatId);
  const storageKey = `cooper:submission:${chatId}:${String(input.requestKey)}`;
  let id = await AsyncStorage.getItem(storageKey);
  if (!id) {
    let error: unknown;
    for (let attempt = 0; attempt < 3 && !id; attempt++) {
      try {
        const data = await runRequest<{ runId: string }>(getToken, "runs", input, signal);
        id = data.runId;
        await AsyncStorage.setItem(storageKey, id);
      } catch (cause) { error = cause; if (signal.aborted || isUsageLimit(cause)) throw cause; await delay(500 * (attempt + 1), signal); }
    }
    if (!id) throw error;
  }
  active.set(chatId, id);
  let cursor = -1;
  let failures = 0;
  yield { content: [{ type: "tool-call", toolCallId: `queued_${id}`, toolName: "cooper_workflow", args: {}, argsText: "{}", result: { kind: "step", phase: "running", label: "Cooper is starting", detail: "You can leave the app. Your result will be saved." } }] };
  try {
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
