import type { ChatModelRunResult } from "@assistant-ui/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetch } from "expo/fetch";
import { resolveApiUrl } from "./chat-model";

export type RunView = { id: string; chatId: string | null; status: string; sequence: number; content: Record<string, unknown>[]; error: string | null; assistantMessageId: string; parentId: string | null; createdAt: string; updatedAt: string };
const active = new Map<string, string>();

export async function runRequest<T>(getToken: () => Promise<string | null>, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const base = resolveApiUrl();
  const token = await getToken();
  if (!base || !token) throw new Error("Sign in and reconnect to continue.");
  const response = await fetch(`${base}/v1/${path}`, { method: body === undefined ? "GET" : "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal });
  if (!response.ok) {
    const value = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(value?.error?.message ?? "Couldn’t reach Cooper. Please try again.");
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
      } catch (cause) { error = cause; if (signal.aborted) throw cause; await delay(500 * (attempt + 1), signal); }
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
          if (run.status === "failed") {
            yield { content: [...run.content, { type: "text", text: run.error ?? "Cooper couldn’t finish. Earlier findings are saved." }] as unknown as NonNullable<ChatModelRunResult["content"]>, status: { type: "incomplete", reason: "error" }, metadata: { custom: { delegationId: id } } };
          }
          return;
        }
      } catch (cause) {
        if (signal.aborted) return; // Detach transport; the server run continues.
        failures++;
        if (failures > 8) throw new Error("Connection interrupted. Cooper can keep working; reopen this chat to recover the saved result.");
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
