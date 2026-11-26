import { useAuth } from "@clerk/electron/react";
import { useState } from "react";
import { isConnectUrl } from "../chat/cards/cardAnswers.logic.ts";
import { apiFetch, ensureOk, type GetToken } from "../lib/api.ts";

/**
 * What a card does straight through the API, without the reply carrying on: undoing what a plan
 * did. Each resolves on the card itself, which says how it went.
 */

type Undo = { kind: "app" | "reminder"; id: string };

/** Undoing a plan's done actions (POST /v1/undo/:id, or /v1/reminders/:id/cancel for a reminder), per action. */
export function usePlanUndo() {
  const { getToken } = useAuth();
  const [state, setState] = useState<Record<string, "busy" | "done">>({});
  const [error, setError] = useState<string | null>(null);

  async function run(actionId: string, undo: Undo) {
    if (state[actionId]) return;
    setState((current) => ({ ...current, [actionId]: "busy" }));
    setError(null);
    try {
      const path = undo.kind === "reminder" ? `/v1/reminders/${encodeURIComponent(undo.id)}/cancel` : `/v1/undo/${encodeURIComponent(undo.id)}`;
      await ensureOk(await apiFetch(() => getToken(), path, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), "This can no longer be undone.");
      setState((current) => ({ ...current, [actionId]: "done" }));
    } catch (cause) {
      setState(({ [actionId]: _, ...rest }) => rest);
      setError(cause instanceof Error ? cause.message : "This can no longer be undone.");
    }
  }

  return { state, error, run };
}

/** How often a connection in progress is checked, as the phone does; coming back to the window checks at once. */
const CHECK_MS = 3500;
/** Giving up waiting after this long; Connect starts again. */
const GIVE_UP_MS = 10 * 60_000;

/**
 * Connecting an app the way the phone does (app-connection.tsx): the API gives a sign-in link
 * (POST /v1/apps/:slug/connect, coming back to mates://app/connected), it opens in your browser,
 * and the app is checked (GET /v1/apps/:slug) until it's connected, you give up, or it's been too
 * long. Resolves with "connected", "cancelled", or why it couldn't.
 */
export async function connectApp(getToken: GetToken, slug: string, signal: AbortSignal): Promise<"connected" | "cancelled" | string> {
  try {
    const path = `/v1/apps/${encodeURIComponent(slug)}`;
    const started = await ensureOk(await apiFetch(getToken, `${path}/connect`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ callbackUrl: "mates://app/connected" }), signal }), "Couldn’t start connecting.");
    const { connected, connectUrl } = (await started.json()) as { connected?: boolean; connectUrl?: unknown };
    if (connected) return "connected";
    if (!isConnectUrl(connectUrl)) return "The sign-in link didn’t look right. Try again.";
    // Opens in your browser: the app never navigates its own windows away (DesktopWebLinks.ts).
    window.open(connectUrl, "_blank");
    const until = Date.now() + GIVE_UP_MS;
    while (Date.now() < until) {
      await waitOrFocus(CHECK_MS, signal);
      if (signal.aborted) return "cancelled";
      const response = await apiFetch(getToken, path, { signal }).catch(() => null);
      const body = response?.ok ? ((await response.json()) as { app?: { connected?: boolean; noAuth?: boolean } }) : null;
      if (body?.app?.connected || body?.app?.noAuth) return "connected";
    }
    return "That took too long. Connect again when you’re ready.";
  } catch (cause) {
    if (signal.aborted) return "cancelled";
    return cause instanceof Error ? cause.message : "Couldn’t connect.";
  }
}

/** Waits `ms`, or until the window has focus again (you're back from the browser), or until cancelled. */
function waitOrFocus(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener("focus", done);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    window.addEventListener("focus", done);
    signal.addEventListener("abort", done);
  });
}
