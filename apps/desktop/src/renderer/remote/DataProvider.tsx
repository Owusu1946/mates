import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { focusManager, QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";
import { createContext, useContext, useState, type ReactNode } from "react";

/** A day: older saved data is dropped on launch rather than shown as if current. */
const MAX_AGE = 24 * 60 * 60_000;

/** Bump when a cached shape changes, so an older cache is thrown away instead of misread. */
const CACHE_VERSION = "1";

// Electron windows stay "visible" when you switch apps, so focus is what says you're back.
focusManager.setEventListener((onFocus) => {
  const focused = () => onFocus(true);
  const blurred = () => onFocus(false);
  window.addEventListener("focus", focused);
  window.addEventListener("blur", blurred);
  return () => {
    window.removeEventListener("focus", focused);
    window.removeEventListener("blur", blurred);
  };
});

type Forget = () => Promise<void>;
const ForgetContext = createContext<Forget>(async () => undefined);

/**
 * The signed-in account's server data, as T3 Code and the phone keep it: TanStack Query in
 * memory, saved to IndexedDB so the next launch paints from it at once while it refreshes.
 * Writes are throttled (one save a second at most). Each account has its own cache, and signing
 * out deletes it.
 */
export function DataProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { gcTime: MAX_AGE, retry: 2, refetchOnWindowFocus: true },
          // Never replayed on their own: retrying a write belongs to the screen that made it.
          mutations: { retry: false },
        },
      }),
  );
  const [persister] = useState(() =>
    createAsyncStoragePersister({
      key: `mates.cache.${userId}`,
      storage: { getItem: (key) => get<string>(key).then((value) => value ?? null), setItem: (key, value) => set(key, value), removeItem: (key) => del(key) },
      throttleTime: 1000,
    }),
  );
  const forget: Forget = async () => {
    await client.cancelQueries();
    client.clear();
    await persister.removeClient();
  };
  return (
    <PersistQueryClientProvider client={client} persistOptions={{ persister, maxAge: MAX_AGE, buster: CACHE_VERSION }}>
      <ForgetContext value={forget}>{children}</ForgetContext>
    </PersistQueryClientProvider>
  );
}

/** Deletes this account's saved data on this device; call it before signing out. */
export const useForgetData = () => useContext(ForgetContext);
