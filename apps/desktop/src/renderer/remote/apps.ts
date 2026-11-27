import { useAuth } from "@clerk/electron/react";
import { keepPreviousData, useInfiniteQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useState, useSyncExternalStore } from "react";
import { apiFetch, ensureOk, read, type GetToken } from "../lib/api.ts";
import { joinPages, sortApps, type AppConnection } from "../settings/apps.logic.ts";
import { connectApp } from "./cardControls.ts";

/**
 * The apps your mates can use, from Composio through the API, the phone's way: a page of 40 at a
 * time (GET /v1/apps, searched there and filtered to the connected ones), kept fresh for 30 seconds
 * and saved for next time. Settings → Apps, the @ menu and a reply's Connect card all read and
 * change the same lists, so connecting in one shows in the others.
 */

type AppsPage = { apps: AppConnection[]; nextCursor: string | null };

const appsKey = (userId: string | null | undefined, search: string, connectedOnly: boolean) => ["apps", userId, search, connectedOnly] as const;

export function useAppList(search: string, connectedOnly: boolean) {
  const { userId, getToken } = useAuth();
  const query = useInfiniteQuery({
    queryKey: appsKey(userId, search, connectedOnly),
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (connectedOnly) params.set("connected", "true");
      if (pageParam) params.set("cursor", pageParam);
      return read<AppsPage>(await apiFetch(() => getToken(), `/v1/apps?${params}`, { signal }), "Couldn’t load your apps.");
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    // While a new search loads, the last results stay up instead of a blank list.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    enabled: Boolean(userId),
  });
  return {
    apps: sortApps(joinPages(query.data?.pages ?? [])),
    loading: query.isPending,
    searching: query.isPlaceholderData,
    error: !query.data && query.error ? query.error.message : null,
    hasMore: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
    retry: () => void query.refetch(),
  };
}

/** Every list loads again, after a connection changed. */
const refreshApps = (client: QueryClient) => client.invalidateQueries({ queryKey: ["apps"] });

/** One connection at a time per app, wherever it was started, so Cancel anywhere stops it. */
const inflight = new Map<string, { controller: AbortController; outcome: Promise<string> }>();
let connecting: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
function publish() {
  connecting = new Set(inflight.keys());
  for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The apps waiting on a sign-in in your browser right now. */
export const useConnecting = () => useSyncExternalStore(subscribe, () => connecting);

/**
 * Connects an app in your browser (cardControls.ts connectApp), or joins the connection already
 * under way for it. Resolves "connected", "cancelled" or what went wrong; the lists load again
 * once it's connected.
 */
export function connectShared(getToken: GetToken, client: QueryClient, slug: string): Promise<string> {
  const running = inflight.get(slug);
  if (running) return running.outcome;
  const controller = new AbortController();
  const outcome = connectApp(getToken, slug, controller.signal).then((result) => {
    inflight.delete(slug);
    publish();
    if (result === "connected") void refreshApps(client);
    return result;
  });
  inflight.set(slug, { controller, outcome });
  publish();
  return outcome;
}

export const cancelConnecting = (slug: string) => inflight.get(slug)?.controller.abort();

/** Connect and disconnect from Settings → Apps, with what went wrong per app. */
export function useAppControls() {
  const { getToken } = useAuth();
  const client = useQueryClient();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [disconnecting, setDisconnecting] = useState<ReadonlySet<string>>(new Set());
  const setError = (slug: string, error: string | null) =>
    setErrors(({ [slug]: _, ...rest }) => (error ? { ...rest, [slug]: error } : rest));

  async function connect(slug: string) {
    setError(slug, null);
    const outcome = await connectShared(() => getToken(), client, slug);
    if (outcome !== "connected" && outcome !== "cancelled") setError(slug, outcome);
  }

  async function disconnect(slug: string) {
    if (disconnecting.has(slug)) return;
    setError(slug, null);
    setDisconnecting((current) => new Set(current).add(slug));
    try {
      await ensureOk(await apiFetch(() => getToken(), `/v1/apps/${encodeURIComponent(slug)}`, { method: "DELETE" }), "Couldn’t disconnect.");
      await refreshApps(client);
    } catch (cause) {
      setError(slug, cause instanceof Error ? cause.message : "Couldn’t disconnect.");
    } finally {
      setDisconnecting((current) => {
        const next = new Set(current);
        next.delete(slug);
        return next;
      });
    }
  }

  return { connect, cancel: cancelConnecting, disconnect, errors, disconnecting };
}
