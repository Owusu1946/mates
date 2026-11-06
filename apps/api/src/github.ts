import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { eq } from "drizzle-orm";
import { getDb } from "./db/client.js";
import { githubInstallations } from "./db/schema.js";

export class GitHubError extends Error {}

const config = () => {
  const { GITHUB_APP_ID, GITHUB_APP_SLUG, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_CLIENT_ID, GITHUB_APP_CLIENT_SECRET } = process.env;
  if (!GITHUB_APP_ID || !GITHUB_APP_SLUG || !GITHUB_APP_PRIVATE_KEY) throw new GitHubError("GitHub isn’t set up on this server yet.");
  return {
    appId: GITHUB_APP_ID,
    slug: GITHUB_APP_SLUG,
    // .env holds the PEM on one line with literal \n.
    privateKey: GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n"),
    clientId: GITHUB_APP_CLIENT_ID,
    clientSecret: GITHUB_APP_CLIENT_SECRET,
  };
};

export const githubConfigured = () => {
  try {
    return !!config().clientId && !!config().clientSecret;
  } catch {
    return false;
  }
};

/** Acts as the App itself: manage installations. */
const appOctokit = () => {
  const { appId, privateKey } = config();
  return new Octokit({ authStrategy: createAppAuth, auth: { appId, privateKey } });
};

/** The narrowest token for one run: one repository, contents and pull requests only. */
export async function repoToken(installationId: number, repo: string) {
  const { appId, privateKey } = config();
  const auth = createAppAuth({ appId, privateKey });
  const { token } = await auth({
    type: "installation",
    installationId,
    repositoryNames: [repo.split("/")[1]!],
    permissions: { contents: "write", pull_requests: "write", metadata: "read" },
  });
  return token;
}

export const repoOctokit = (token: string) => new Octokit({ auth: token });

// ── Install flow ────────────────────────────────────────────────────────────────

const stateKey = () => createHmac("sha256", process.env.GITHUB_STATE_SECRET ?? process.env.CLERK_SECRET_KEY ?? "").update("github-install-state").digest();

const DEFAULT_RETURN = "muse-clone://connections";
/** Only the app's own links: the install flow must never become an open redirect. */
export const safeReturn = (url: string | undefined) => (url && /^(muse-clone|exps?):\/\/[^\s]{1,300}$/.test(url) ? url : DEFAULT_RETURN);

/** A signed, expiring `state` binding the install round-trip to the user who started it. */
export function signState(userId: string, now = Date.now(), returnTo = DEFAULT_RETURN) {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: now + 15 * 60_000, r: safeReturn(returnTo), n: randomBytes(8).toString("hex") })).toString("base64url");
  return `${payload}.${createHmac("sha256", stateKey()).update(payload).digest("base64url")}`;
}

export function verifyState(state: string, now = Date.now()): { userId: string; returnTo: string } | null {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(createHmac("sha256", stateKey()).update(payload).digest("base64url"));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { u, e, r } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { u: string; e: number; r?: string };
    return e > now ? { userId: u, returnTo: safeReturn(r) } : null;
  } catch {
    return null;
  }
}

export const installUrl = (userId: string, returnTo?: string) =>
  `https://github.com/apps/${config().slug}/installations/new?state=${encodeURIComponent(signState(userId, Date.now(), safeReturn(returnTo)))}`;

/**
 * Completes an install. GitHub's redirect carries the installation id in the URL, so it's only
 * trusted once the user's own GitHub sign-in (the `code`) proves they can see that installation.
 */
export async function completeInstall(userId: string, installationId: number, code: string) {
  const { clientId, clientSecret } = config();
  if (!clientId || !clientSecret) throw new GitHubError("GitHub sign-in isn’t set up on this server yet.");
  const exchange = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  const { access_token: userToken } = (await exchange.json()) as { access_token?: string };
  if (!userToken) throw new GitHubError("GitHub didn’t confirm the sign-in. Try connecting again.");
  const user = new Octokit({ auth: userToken });
  const installations = await user.paginate(user.apps.listInstallationsForAuthenticatedUser, { per_page: 100 });
  const installation = installations.find((item) => item.id === installationId);
  if (!installation) throw new GitHubError("That installation doesn’t belong to your GitHub account.");
  const account = installation.account && "login" in installation.account ? installation.account.login : String(installationId);
  await getDb()
    .insert(githubInstallations)
    .values({ installationId, clerkUserId: userId, accountLogin: account })
    .onConflictDoUpdate({ target: githubInstallations.installationId, set: { clerkUserId: userId, accountLogin: account } });
  return { account };
}

export function listInstallations(userId: string) {
  return getDb().select().from(githubInstallations).where(eq(githubInstallations.clerkUserId, userId));
}

export type RepoInfo = { fullName: string; defaultBranch: string; private: boolean; installationId: number };

/** Every repo the bot can reach for this user, across their installations. Uninstalled ones are dropped. */
export async function listRepos(userId: string): Promise<RepoInfo[]> {
  const { appId, privateKey } = config();
  const repos: RepoInfo[] = [];
  for (const { installationId } of await listInstallations(userId)) {
    try {
      const octokit = new Octokit({ authStrategy: createAppAuth, auth: { appId, privateKey, installationId } });
      const items = await octokit.paginate(octokit.apps.listReposAccessibleToInstallation, { per_page: 100 });
      for (const repo of items.slice(0, 500))
        repos.push({ fullName: repo.full_name, defaultBranch: repo.default_branch, private: repo.private, installationId });
    } catch (error) {
      // The user removed the App on GitHub: forget the installation rather than failing every list.
      if ((error as { status?: number }).status === 404)
        await getDb().delete(githubInstallations).where(eq(githubInstallations.installationId, installationId));
      else throw error;
    }
  }
  return repos;
}

/** Removes the App from the user's accounts, e.g. when they delete their Cooper account. */
export async function uninstallAll(userId: string) {
  const octokit = appOctokit();
  for (const { installationId } of await listInstallations(userId))
    await octokit.apps.deleteInstallation({ installation_id: installationId }).catch((error: { status?: number }) => {
      if (error.status !== 404) throw error;
    });
}

// ── Bot identity and pull requests ──────────────────────────────────────────────

let identity: Promise<{ name: string; email: string }> | undefined;
/** Commits authored as `<slug>[bot]`, so GitHub shows the App's avatar and name. */
export function botIdentity() {
  identity ??= (async () => {
    const name = `${config().slug}[bot]`;
    const { data } = await new Octokit().users.getByUsername({ username: name });
    return { name, email: `${data.id}+${name}@users.noreply.github.com` };
  })().catch((error) => {
    identity = undefined;
    throw error;
  });
  return identity;
}

export async function openPullRequest(token: string, input: { repo: string; head: string; base: string; title: string; body: string }) {
  const [owner, repo] = input.repo.split("/") as [string, string];
  const octokit = repoOctokit(token);
  const existing = await octokit.pulls.list({ owner, repo, head: `${owner}:${input.head}`, state: "open" });
  const pull = existing.data[0]
    ? (await octokit.pulls.get({ owner, repo, pull_number: existing.data[0].number })).data
    : (await octokit.pulls.create({ owner, repo, head: input.head, base: input.base, title: input.title, body: input.body })).data;
  return { number: pull.number, url: pull.html_url, title: pull.title, additions: pull.additions, deletions: pull.deletions, files: pull.changed_files };
}
