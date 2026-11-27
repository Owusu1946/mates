import { useAuth } from "../auth/account.ts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isConnectUrl } from "../chat/cards/cardAnswers.logic.ts";
import { apiFetch, ensureOk, type GetToken } from "../lib/api.ts";

/**
 * What a card does straight through the API, without the reply carrying on: undoing what a plan
 * did, connecting an app, pausing a routine or a watch, taking back a memory. Each resolves on the
 * card itself, which says how it went.
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

type RoutineRow = { id: string; version: number; status: string; nextRunAt?: string | null };
type WatchState = { watchId: string; version: number; status: string; lastNote: string | null; lastCheckedAt: string | null };

/**
 * A routine set up in chat, kept current from your schedules (GET /v1/schedules, as the phone
 * polls it), and paused, resumed or cancelled through its control (POST /v1/schedules/:id/control
 * with the version it's at, so a change made elsewhere isn't overwritten).
 */
export function useRoutine(routineId: string | undefined) {
  const { userId, getToken } = useAuth();
  const client = useQueryClient();
  const key = ["schedules", userId] as const;
  const list = useQuery({
    queryKey: key,
    queryFn: async () => ((await (await ensureOk(await apiFetch(() => getToken(), "/v1/schedules"), "Couldn’t load your routines.")).json()) as { routines?: RoutineRow[] }).routines ?? [],
    enabled: Boolean(routineId && userId),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  const [error, setError] = useState<string | null>(null);
  const routine = list.data?.find((row) => row.id === routineId);

  async function control(action: "pause" | "resume" | "cancel", fallbackVersion?: number) {
    const version = routine?.version ?? fallbackVersion;
    if (!routineId || !version) return;
    setError(null);
    try {
      const response = await apiFetch(() => getToken(), `/v1/schedules/${encodeURIComponent(routineId)}/control`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, version }) });
      if (response.status === 409) throw new Error("This changed elsewhere. Look again in a moment.");
      const { routine: next } = (await (await ensureOk(response, "Couldn’t change that routine.")).json()) as { routine: RoutineRow };
      client.setQueryData<RoutineRow[]>(key, (rows) => (rows ?? []).map((row) => (row.id === next.id ? next : row)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t change that routine.");
      void client.invalidateQueries({ queryKey: key });
    }
  }

  return { routine, error, control };
}

/** A watch, kept current from your watches (GET /v1/watches) and controlled with its version (POST /v1/watches/:id/control). */
export function useWatch(watchId: string | undefined) {
  const { userId, getToken } = useAuth();
  const client = useQueryClient();
  const key = ["watches", userId] as const;
  const list = useQuery({
    queryKey: key,
    queryFn: async () => (((await (await ensureOk(await apiFetch(() => getToken(), "/v1/watches"), "Couldn’t load your watches.")).json()) as { watches?: { watch?: WatchState }[] }).watches ?? []).flatMap((card) => (card.watch ? [card.watch] : [])),
    enabled: Boolean(watchId && userId),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const [error, setError] = useState<string | null>(null);
  const watch = list.data?.find((row) => row.watchId === watchId);

  async function control(action: "pause" | "resume" | "cancel", fallbackVersion?: number) {
    const version = watch?.version ?? fallbackVersion;
    if (!watchId || !version) return;
    setError(null);
    try {
      const response = await apiFetch(() => getToken(), `/v1/watches/${encodeURIComponent(watchId)}/control`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, version }) });
      if (response.status === 409) throw new Error("This watch changed. Look again in a moment.");
      const body = (await (await ensureOk(response, "Couldn’t change that watch.")).json()) as { watch?: { watch?: WatchState } };
      const next = body.watch?.watch;
      if (next) client.setQueryData<WatchState[]>(key, (rows) => [...(rows ?? []).filter((row) => row.watchId !== next.watchId), next]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t change that watch.");
      void client.invalidateQueries({ queryKey: key });
    }
  }

  return { watch, error, control };
}

/** Taking back a memory a mate just saved (DELETE /v1/memories/:id); one already gone counts as undone. */
export function useMemoryUndo() {
  const { getToken } = useAuth();
  const [undone, setUndone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function undo(memoryId: string) {
    setError(null);
    try {
      const response = await apiFetch(() => getToken(), `/v1/memories/${encodeURIComponent(memoryId)}`, { method: "DELETE" });
      if (response.status !== 404) await ensureOk(response, "Couldn’t take that back.");
      setUndone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t take that back.");
    }
  }

  return { undone, error, undo };
}
