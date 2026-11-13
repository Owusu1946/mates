import { Composio } from "@composio/core";
import { OpenAIProvider } from "@composio/openai";
import { eq } from "drizzle-orm";
import { getDb } from "./db/client.js";
import { integrationSessions } from "./db/schema.js";

export type AppConnection = {
  slug: string;
  name: string;
  logo?: string;
  connected: boolean;
  noAuth: boolean;
  status: string;
};
export type WorkflowCard = {
  kind: "step" | "connection" | "choice" | "results" | "browser" | "schedule" | "approval" | "memory" | "plan" | "speaker" | "team" | "handoff" | "note" | "code" | "sources" | "call" | "deck" | "watch";
  phase: "running" | "done" | "error" | "waiting";
  label: string;
  detail?: string;
  routineId?: string;
  routineVersion?: number;
  routineSpec?: Record<string, unknown>;
  nextRunAt?: string;
  approvalFields?: { label: string; value: string }[];
  /** Live progress for the "working" status line; collapses to "Worked for …" when done. */
  activity?: { label: string; state: "running" | "done" }[];
  startedAt?: string;
  finishedAt?: string;
  memory?: { id: string; text: string; action: "saved" | "updated" | "forgotten" };
  /** In a group, marks whose reply the following text is. */
  speaker?: { id: string; name: string; color: string; shape?: string; gradient: [string, string, string] };
  /** Who the leader handed this round to, each with their task and live status. */
  handoff?: {
    round?: number;
    from: { id: string; name: string; color: string; shape?: string; gradient: [string, string, string] };
    items: { mate: { id: string; name: string; color: string; shape?: string; gradient: [string, string, string] }; task: string; status: "queued" | "working" | "review" | "changes" | "done" | "waiting" | "failed"; step?: string; id?: string }[];
  };
  /** A job on the mates' computer: live steps, check results, and the pull request it opened. */
  code?: {
    runId: string;
    repo: string;
    branch: string;
    status: "queued" | "cloning" | "coding" | "checking" | "pushing" | "done" | "failed" | "cancelled";
    checks: { name: string; command: string; passed: boolean; output: string }[];
    /** What the computer has been doing, newest last ("Editing src/app.ts"). */
    activity?: { at: string; text: string }[];
    /** Dollars spent on the coding model, once the run has ended. */
    costUsd?: number;
    pr?: { number: number; url: string; title: string; additions?: number; deletions?: number; files?: number };
    error?: string;
  };
  /** The web pages an answer drew on, cited ones first: shown as a Sources pill under the answer. */
  sources?: { id: string; url: string; title: string; domain: string; publishedAt: string | null; favicon: string }[];
  /** A slide deck a mate is building or has built; the app loads the slides by `deckId`. */
  deck?: {
    deckId: string;
    title: string;
    status: "queued" | "outlining" | "writing" | "ready" | "editing" | "failed" | "cancelled";
    built: number;
    total: number;
    version: number;
    slides: { id: string; layout: string; title: string }[];
    error?: string;
  };
  /** A watch ("watch for X, then do Y"); the app keeps it current by `watchId`. */
  watch?: {
    watchId: string;
    version: number;
    title: string;
    kind: "web" | "app";
    condition: string;
    action: string;
    status: "active" | "paused" | "fired" | "expired" | "cancelled" | "failed";
    /** "every 4 hours" for web watches; null for app watches, which wait for the app's event. */
    every: string | null;
    app: string | null;
    lastNote: string | null;
    lastCheckedAt: string | null;
    expiresAt: string;
    firedAt: string | null;
  };
  /** A finished voice call: who was on it, how long, the summary and action items. */
  call?: { callId: string; durationSec: number; summary: string; actionItems: string[]; mates: { id: string; name: string; color: string; shape?: string; gradient: [string, string, string] }[]; lines: number };
  /** A mission note a mate just wrote. */
  note?: { title: string; version: number; author: string; chatId: string };
  /** A team the leader assembled for a mission. */
  team?: { chatId: string; name: string; members: { id: string; name: string; role: string; color: string; shape?: string; gradient: [string, string, string] }[] };
  plan?: {
    summary: string;
    actions: {
      id: string;
      title: string;
      kind: "app" | "reminder";
      app?: string;
      logo?: string;
      details: { label: string; value: string }[];
      status: "proposed" | "running" | "done" | "failed" | "skipped";
      error?: string;
      links?: { label: string; url: string }[];
      undo?: { kind: "app" | "reminder"; id: string };
    }[];
  };
  toolkit?: string;
  name?: string;
  logo?: string;
  resumeRunId?: string;
  browserSessionId?: string;
  browserStatus?: string;
  browserUrl?: string;
  browserSteps?: { label: string; state: "running" | "done" | "waiting" | "error" }[];
  stage?: "discovery" | "preparation" | "execution" | "summary";
  options?: {
    id: string;
    label: string;
    detail?: string;
    toolkit: string;
    logo?: string;
    accountId?: string;
  }[];
  items?: {
    sourceId: string;
    title: string;
    subtitle?: string;
    preview?: string;
    url?: string;
    metrics?: string[];
    product?: {
      price: string | null;
      currency: string | null;
      imageUrl: string | null;
      specs: string | null;
      availability: "in_stock" | "out_of_stock" | "unknown";
      seller: string;
      observedAt: string;
    };
  }[];
  followUps?: { label: string; prompt: string }[];
};
let composio: Composio<OpenAIProvider> | undefined;
export class IntegrationUnavailable extends Error {
  constructor(configured = true) {
    super(
      configured
        ? "App connections are temporarily unavailable. Please try again."
        : "App connections need a valid Composio key on the server.",
    );
  }
}
async function integrationRequest<T>(request: () => Promise<T>) {
  try {
    return await request();
  } catch (error) {
    const status = (error as { status?: number }).status;
    throw new IntegrationUnavailable(status !== 401 && status !== 403);
  }
}
export function getComposio() {
  if (!process.env.COMPOSIO_API_KEY) throw new IntegrationUnavailable(false);
  return (composio ??= new Composio({
    apiKey: process.env.COMPOSIO_API_KEY,
    provider: new OpenAIProvider(),
  }));
}
export async function getIntegrationSession(userId: string) {
  const client = getComposio();
  const [stored] = await getDb()
    .select()
    .from(integrationSessions)
    .where(eq(integrationSessions.clerkUserId, userId));
  if (stored) {
    try {
      return await client.use(stored.sessionId);
    } catch (error) {
      // Only replace an expired/missing session; service outages must not orphan live sessions.
      const status = (error as { status?: number }).status;
      if (status !== 404 && status !== 410)
        throw new IntegrationUnavailable(status !== 401 && status !== 403);
    }
  }
  // No toolkit allowlist: discovery spans the full Composio app catalog, as in Muse.
  const session = await integrationRequest(() =>
    client.create(userId, { manageConnections: false }),
  );
  await getDb()
    .insert(integrationSessions)
    .values({ clerkUserId: userId, sessionId: session.sessionId })
    .onConflictDoUpdate({
      target: integrationSessions.clerkUserId,
      set: { sessionId: session.sessionId, updatedAt: new Date() },
    });
  return session;
}
type Session = Awaited<ReturnType<typeof getIntegrationSession>>;
export async function listApps(
  session: Session,
  options: { search?: string; cursor?: string; connected?: boolean } = {},
) {
  const data = await integrationRequest(() =>
    session.toolkits({
      search: options.search,
      cursor: options.cursor,
      isConnected: options.connected,
      limit: 40,
    }),
  );
  return {
    apps: data.items.map((app): AppConnection => ({
      slug: app.slug,
      name: app.name,
      logo: app.logo,
      connected: app.connection?.isActive ?? false,
      noAuth: app.isNoAuth,
      status: app.connection?.connectedAccount?.status ?? "NOT_CONNECTED",
    })),
    nextCursor: data.cursor ?? null,
  };
}
export async function getApp(
  session: Session,
  slug: string,
): Promise<AppConnection | null> {
  const data = await integrationRequest(() =>
    session.toolkits({ toolkits: [slug] }),
  );
  const app = data.items.find((item) => item.slug === slug);
  return app
    ? {
        slug: app.slug,
        name: app.name,
        logo: app.logo,
        connected: app.connection?.isActive ?? false,
        noAuth: app.isNoAuth,
        status: app.connection?.connectedAccount?.status ?? "NOT_CONNECTED",
      }
    : null;
}
export async function disconnectApp(userId: string, slug: string) {
  const accounts = await getComposio().connectedAccounts.list({
    userIds: [userId],
    toolkitSlugs: [slug],
  });
  for (const account of accounts.items)
    await getComposio().connectedAccounts.delete(account.id);
}
