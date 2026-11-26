/**
 * Apps your mates can use, in the shape the API returns them from Composio (apps/api/src/integrations.ts
 * AppConnection, GET /v1/apps), so wiring it up is a swap of the data source.
 */

export type AppConnection = { slug: string; name: string; logo?: string; connected: boolean; noAuth: boolean; status: string };

export type AppState = "ready" | "connected" | "connecting" | "reconnect" | "available";

/** Where an app stands, in words a person acts on. Composio's statuses: ACTIVE, INITIATED, EXPIRED, FAILED, INACTIVE. */
export function appState(app: AppConnection): AppState {
  if (app.noAuth) return "ready";
  if (app.status === "INITIATED") return "connecting";
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

/** Search by name or slug; "Connected" also keeps the ones that need you to reconnect. Those come first. */
export function filterApps(apps: AppConnection[], search: string, connectedOnly: boolean): AppConnection[] {
  const query = search.trim().toLowerCase();
  const rank = (app: AppConnection) => ({ reconnect: 0, connecting: 1, connected: 2, ready: 3, available: 4 })[appState(app)];
  return apps
    .filter((app) => !query || `${app.name} ${app.slug}`.toLowerCase().includes(query))
    .filter((app) => !connectedOnly || ["connected", "reconnect", "connecting", "ready"].includes(appState(app)))
    .sort((a, b) => rank(a) - rank(b));
}

/** The ones a mate can use right now, for the @ menu. */
export const usableApps = (apps: AppConnection[]) => apps.filter((app) => app.connected || app.noAuth);
