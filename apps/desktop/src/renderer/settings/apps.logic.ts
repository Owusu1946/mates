/** Apps your mates can use, as the API returns them from Composio (apps/api/src/integrations.ts AppConnection, GET /v1/apps). */

export type AppConnection = { slug: string; name: string; logo?: string; connected: boolean; noAuth: boolean; status: string };

export type AppState = "ready" | "connected" | "connecting" | "reconnect" | "available";

/**
 * Where an app stands, in words a person acts on. Composio's statuses: ACTIVE, INITIATED, EXPIRED,
 * FAILED, INACTIVE. "Connecting" is only while this app waits on your browser: Composio keeps
 * INITIATED for a sign-in you walked away from, which is just not connected.
 */
export function appState(app: AppConnection, connecting = false): AppState {
  if (app.noAuth) return "ready";
  if (connecting && !app.connected) return "connecting";
  if (app.connected) return "connected";
  if (app.status === "EXPIRED" || app.status === "FAILED") return "reconnect";
  return "available";
}

export const STATE_LABEL: Record<AppState, string> = {
  ready: "Ready to use",
  connected: "Connected",
  connecting: "Finish in your browser",
  reconnect: "Needs reconnecting",
  available: "Not connected",
};

/** What needs you first (a sign-in to redo), then what's connected, then the rest in the API's order. */
export function sortApps(apps: AppConnection[]): AppConnection[] {
  const rank = (app: AppConnection) => ({ reconnect: 0, connecting: 1, connected: 2, ready: 3, available: 4 })[appState(app)];
  return apps.map((app, at) => ({ app, at })).sort((a, b) => rank(a.app) - rank(b.app) || a.at - b.at).map(({ app }) => app);
}

/** Pages of apps as one list, without the repeats a page boundary can bring when a list changes. */
export function joinPages(pages: { apps: AppConnection[] }[]): AppConnection[] {
  const seen = new Set<string>();
  return pages.flatMap((page) => page.apps).filter((app) => !seen.has(app.slug) && Boolean(seen.add(app.slug)));
}

/** An app's logo, through the app (main/app/DesktopFavicons.ts), so the page's CSP stays closed to the web. */
export const logoSrc = (logo: string | undefined) => (logo?.startsWith("https://") ? `mates://app/logo?src=${encodeURIComponent(logo)}` : undefined);

/** The ones a mate can use right now, for the @ menu. */
export const usableApps = (apps: AppConnection[]) => apps.filter((app) => app.connected || app.noAuth);
