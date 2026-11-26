import { useSyncExternalStore } from "react";
import { SAMPLE_APPS } from "../data/sampleApps.ts";
import type { AppConnection } from "./apps.logic.ts";

/**
 * The apps for this session, shared by Settings → Apps and the @ menu. Connecting goes the way it
 * will with Composio: the app waits (INITIATED) while you sign in in your browser, then it's
 * ACTIVE. UI only: the sample browser comes back by itself.
 */

/** How long the sample sign-in takes. */
const SAMPLE_SIGN_IN_MS = 1600;

let apps = SAMPLE_APPS;
const listeners = new Set<() => void>();

function set(slug: string, change: Partial<AppConnection>) {
  apps = apps.map((app) => (app.slug === slug ? { ...app, ...change } : app));
  for (const listener of listeners) listener();
}

export function connectApp(slug: string) {
  set(slug, { status: "INITIATED" });
  setTimeout(() => set(slug, { connected: true, status: "ACTIVE" }), SAMPLE_SIGN_IN_MS);
}

export const cancelConnect = (slug: string) => set(slug, { status: "INACTIVE" });
export const disconnectApp = (slug: string) => set(slug, { connected: false, status: "INACTIVE" });

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useApps() {
  return useSyncExternalStore(subscribe, () => apps);
}
