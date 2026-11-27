import { useAuth as useClerkAuth } from "@clerk/electron/react";
import { createContext, use, useSyncExternalStore } from "react";

/**
 * Opening without a connection, as T3 Code does: Clerk loads its script from the web, so offline
 * it never says who you are. The account last signed in on this device is kept (who, not any
 * token), and while Clerk can't load the app opens as that account from its saved copy. Signing
 * out forgets it, so a shared computer never opens as someone who left.
 */

export type SavedAccount = { id: string; name: string; email?: string };
const KEY = "mates:account";

export function savedAccount(): SavedAccount | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null") as SavedAccount | null;
    return value && typeof value.id === "string" ? value : null;
  } catch {
    return null;
  }
}

export function saveAccount(account: SavedAccount) {
  try {
    localStorage.setItem(KEY, JSON.stringify(account));
  } catch {
    // Storage off: the app still works, it just can't open offline.
  }
}

export function forgetAccount() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to forget.
  }
}

/** The saved account while Clerk can't load; null once it has. */
export const OfflineAccountContext = createContext<string | null>(null);

/** Clerk's useAuth, with the saved account's id while Clerk can't load, so the saved copy is found. */
export function useAuth() {
  const clerk = useClerkAuth();
  const offline = use(OfflineAccountContext);
  return { ...clerk, userId: clerk.userId ?? offline };
}

const subscribe = (listener: () => void) => {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
};
export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine);
