import { and, eq } from "drizzle-orm";
import { getDb } from "./db/client.js";
import { slackInstalls, slackLinks, type mates } from "./db/schema.js";
import { decryptToken, encryptToken, signState, slackConfigured, verifyState } from "./slack-security.js";

/** The bot's permissions; kept in step with slack/manifest.json. */
const BOT_SCOPES = ["app_mentions:read", "chat:write", "chat:write.customize", "commands", "im:history", "im:read", "im:write", "users:read"];
/** Where the mates' pictures are served (the mascot pack, in apps/web/public/mates). */
const SITE = () => process.env.SITE_URL ?? "https://agents.askorin.app";

export class SlackApiError extends Error {
  constructor(readonly code: string, readonly retryAfter?: number) {
    super(`Slack answered ${code}`);
  }
}

/** One Web API call as the bot. JSON in, JSON out; Slack reports errors as `ok: false`, not HTTP codes. */
export async function slackApi<T = Record<string, unknown>>(token: string, method: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  if (response.status === 429) throw new SlackApiError("ratelimited", Number(response.headers.get("retry-after") ?? 30));
  const value = (await response.json().catch(() => ({ ok: false, error: `http_${response.status}` }))) as { ok: boolean; error?: string };
  if (!value.ok) throw new SlackApiError(value.error ?? "unknown_error");
  return value as T;
}

/** How a mate appears in Slack: its own name and face, posted through the one Mates bot. */
export const mateIdentity = (mate: Pick<typeof mates.$inferSelect, "name" | "shape" | "color">) => ({
  username: mate.name,
  icon_url: `${SITE()}/mates/${mate.shape}-${mate.color}.png`,
});

// ── Install ─────────────────────────────────────────────────────────────────────

/** Slack's "Add to Slack" page, carrying who started it. Slack returns to the app's one registered redirect. */
export function installUrl(userId: string, returnTo: string) {
  const state = signState("install", { u: userId, r: returnTo });
  const query = new URLSearchParams({ client_id: process.env.SLACK_CLIENT_ID ?? "", scope: BOT_SCOPES.join(","), state });
  return `https://slack.com/oauth/v2/authorize?${query}`;
}

export const verifyInstallState = (state: string) => {
  const data = verifyState("install", state);
  return data?.u ? { userId: data.u, returnTo: data.r ?? "" } : null;
};

type OAuthAccess = { ok: boolean; error?: string; access_token?: string; bot_user_id?: string; team?: { id: string; name: string }; authed_user?: { id: string } };

/**
 * Finishes an install: swaps the code for the workspace's bot token, stores it encrypted, and links the
 * person who installed it to the Mates account that started the install.
 */
export async function completeInstall(userId: string, code: string) {
  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.SLACK_CLIENT_ID ?? "", client_secret: process.env.SLACK_CLIENT_SECRET ?? "", code }),
  });
  const access = (await response.json().catch(() => ({ ok: false }))) as OAuthAccess;
  if (!access.ok || !access.access_token || !access.team || !access.bot_user_id || !access.authed_user) throw new SlackApiError(access.error ?? "oauth_failed");
  const install = { teamId: access.team.id, teamName: access.team.name, botUserId: access.bot_user_id, botTokenEnc: encryptToken(access.access_token), installedBy: userId };
  await getDb().insert(slackInstalls).values(install).onConflictDoUpdate({ target: slackInstalls.teamId, set: { ...install, installedAt: new Date() } });
  await linkUser(access.team.id, access.authed_user.id, userId);
  return { team: access.team.name };
}

/** The workspace's install with its bot token decrypted, or null if it isn't (or no longer) installed. */
export async function installFor(teamId: string) {
  const [row] = await getDb().select().from(slackInstalls).where(eq(slackInstalls.teamId, teamId));
  return row ? { ...row, token: decryptToken(row.botTokenEnc) } : null;
}

/** Slack told us the app was removed or its token revoked: forget the workspace (links and runs go with it). */
export async function uninstall(teamId: string) {
  await getDb().delete(slackInstalls).where(eq(slackInstalls.teamId, teamId));
}

// ── Linking people ──────────────────────────────────────────────────────────────

async function linkUser(teamId: string, slackUserId: string, clerkUserId: string) {
  await getDb().insert(slackLinks).values({ teamId, slackUserId, clerkUserId }).onConflictDoUpdate({ target: [slackLinks.teamId, slackLinks.slackUserId], set: { clerkUserId, createdAt: new Date() } });
}

/** The Mates account behind a Slack user, if they've linked one. */
export async function linkedUser(teamId: string, slackUserId: string) {
  const [row] = await getDb().select().from(slackLinks).where(and(eq(slackLinks.teamId, teamId), eq(slackLinks.slackUserId, slackUserId)));
  return row?.clerkUserId ?? null;
}

/** A link the bot hands an unlinked Slack user; the signed-in app redeems it with `completeLink`. */
export const linkUrl = (teamId: string, slackUserId: string) =>
  `mates://slack-link?token=${encodeURIComponent(signState("link", { t: teamId, s: slackUserId }, Date.now(), 30 * 60_000))}`;

export class LinkError extends Error {}

export async function completeLink(clerkUserId: string, token: string) {
  const data = verifyState("link", token);
  if (!data?.t || !data.s) throw new LinkError("That link has expired. Ask Mates in Slack for a new one.");
  const [install] = await getDb().select({ teamName: slackInstalls.teamName }).from(slackInstalls).where(eq(slackInstalls.teamId, data.t));
  if (!install) throw new LinkError("Mates isn’t installed in that Slack workspace any more.");
  await linkUser(data.t, data.s, clerkUserId);
  return { team: install.teamName };
}

/** The workspaces this person is linked in, for the app's Connections screen. */
export async function listLinks(clerkUserId: string) {
  return getDb()
    .select({ teamId: slackLinks.teamId, teamName: slackInstalls.teamName })
    .from(slackLinks)
    .innerJoin(slackInstalls, eq(slackLinks.teamId, slackInstalls.teamId))
    .where(eq(slackLinks.clerkUserId, clerkUserId));
}

export async function unlink(clerkUserId: string, teamId: string) {
  await getDb().delete(slackLinks).where(and(eq(slackLinks.clerkUserId, clerkUserId), eq(slackLinks.teamId, teamId)));
}

export { slackConfigured };
