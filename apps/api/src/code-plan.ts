import type { CodeCheck } from "./db/schema.js";

/** `mates/add-dark-mode-3f9a1c`: readable in GitHub's branch list, unique per run. */
export function branchName(task: string, runId: string) {
  const slug = task
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return `mates/${slug || "change"}-${runId.replace(/-/g, "").slice(0, 6)}`;
}

/** The bot only ever proposes changes: it never pushes to the branch a PR would merge into. */
export function assertPushable(branch: string, defaultBranch: string) {
  if (!branch.startsWith("mates/") || branch === defaultBranch) throw new Error(`Refusing to push to ${branch}.`);
}

export type PackageManager = "pnpm" | "yarn" | "bun" | "npm";
export type RepoChecks = { manager: PackageManager; install: string; checks: { name: string; command: string }[] };

const CHECK_SCRIPTS = ["typecheck", "lint", "test"] as const;
// `npm init`'s placeholder test script fails by design; it isn't a real check.
const PLACEHOLDER_TEST = /no test specified/i;

/** How to install and verify a JavaScript repo, from its root package.json and lockfiles. */
export function detectChecks(packageJson: string | null, files: string[]): RepoChecks | null {
  if (!packageJson) return null;
  let scripts: Record<string, string> = {};
  try {
    scripts = (JSON.parse(packageJson) as { scripts?: Record<string, string> }).scripts ?? {};
  } catch {
    return null;
  }
  const has = (name: string) => files.includes(name);
  const manager: PackageManager = has("pnpm-lock.yaml") ? "pnpm" : has("yarn.lock") ? "yarn" : has("bun.lock") || has("bun.lockb") ? "bun" : "npm";
  const install = {
    pnpm: "pnpm install --frozen-lockfile",
    yarn: "yarn install --frozen-lockfile",
    bun: "bun install --frozen-lockfile",
    npm: has("package-lock.json") ? "npm ci" : "npm install",
  }[manager];
  const run = manager === "npm" ? "npm run" : manager;
  const checks = CHECK_SCRIPTS.filter((name) => scripts[name] && !(name === "test" && PLACEHOLDER_TEST.test(scripts[name]!))).map((name) => ({ name, command: `${run} ${name}` }));
  return { manager, install, checks };
}

const SECRET_PATTERNS = [
  /gh[opsur]_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /sk-or-v1-[A-Za-z0-9]{20,}/g, // OpenRouter keys
  /x-access-token:[^@\s]+@/g, // credentials embedded in a git remote
];

/** Command output is stored and shown in chat: strip secrets, keep only the useful tail. */
export function scrub(output: string, secrets: string[] = [], keep = 4_000) {
  let text = output;
  for (const secret of secrets) if (secret.length >= 8) text = text.split(secret).join("[secret]");
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, "[secret]");
  return text.length > keep ? `…${text.slice(-keep)}` : text;
}

/** Matches what the user said ("muse-clone", "Owusu1946/mates") to one repo the bot can reach. */
export function resolveRepo(query: string, repos: string[]): { repo: string } | { candidates: string[] } {
  const wanted = query.trim().toLowerCase().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/+$/, "");
  const exact = repos.find((repo) => repo.toLowerCase() === wanted);
  if (exact) return { repo: exact };
  const byName = repos.filter((repo) => repo.split("/")[1]!.toLowerCase() === wanted);
  if (byName.length === 1) return { repo: byName[0]! };
  const partial = byName.length ? byName : repos.filter((repo) => repo.toLowerCase().includes(wanted));
  return partial.length === 1 ? { repo: partial[0]! } : { candidates: partial.slice(0, 8) };
}

/** What the coding agent is asked to do: the task, the repo's own rules, and the bar to clear. */
export function coderPrompt(input: { task: string; rules: string | null; checks: { command: string }[]; failures?: CodeCheck[] }) {
  const parts = [
    `You are working in a git repository. Make this change:\n\n${input.task}`,
    "Follow the existing code style and structure. Keep the change focused: no unrelated refactors, no new dependencies unless the task needs them. Do not commit, push or create branches; that is handled for you. Never print or write secrets.",
  ];
  if (input.rules) parts.push(`The repository's own instructions:\n\n${input.rules.slice(0, 6_000)}`);
  if (input.checks.length) parts.push(`These must pass when you finish: ${input.checks.map((check) => `\`${check.command}\``).join(", ")}. Run them and fix what fails.`);
  if (input.failures?.length)
    parts.push(`These checks failed after your last change. Fix the causes, not the tests:\n\n${input.failures.map((check) => `$ ${check.command}\n${check.output.slice(-2_000)}`).join("\n\n")}`);
  return parts.join("\n\n");
}

/** The PR description: what changed, how it was checked, and who asked. */
export function pullRequestBody(input: { task: string; summary: string; checks: CodeCheck[]; requester: string }) {
  const checks = input.checks.length
    ? input.checks.map((check) => `- ${check.passed ? "✅" : "❌"} \`${check.command}\``).join("\n")
    : "- No automated checks were found in this repository.";
  return [`## What changed\n\n${input.summary.trim()}`, `## Request\n\n> ${input.task.trim().replace(/\n/g, "\n> ")}`, `## Checks\n\n${checks}`, `---\nOpened by Mates on behalf of ${input.requester}.`].join("\n\n");
}

export type CoderEvent = { activity?: string; text?: string };
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/**
 * One line of `opencode run --format json` as something a person can follow on their phone:
 * a tool call becomes "Editing src/app.ts" or "Running pnpm test", the coder's own words come
 * back as `text` (kept for the PR summary). Anything unrecognised is ignored, never thrown on.
 */
export function readCoderEvent(line: string, workdir: string): CoderEvent {
  let event: { type?: string; part?: { type?: string; tool?: string; text?: string; state?: { status?: string; input?: Record<string, unknown> } } };
  try {
    event = JSON.parse(line);
  } catch {
    return line.trim() ? { text: line } : {};
  }
  const part = event?.part;
  if (!part) return {};
  if (event.type === "text" || part.type === "text") return part.text?.trim() ? { text: part.text } : {};
  if (event.type !== "tool_use" && part.type !== "tool") return {};
  if (part.state?.status === "error") return {};
  const input = part.state?.input ?? {};
  const str = (key: string) => (typeof input[key] === "string" ? (input[key] as string) : "");
  const file = clip(str("filePath").replace(`${workdir}/`, "").replace(/^\.\//, ""), 80);
  switch (part.tool) {
    case "edit":
    case "patch":
    case "multiedit":
      return file ? { activity: `Editing ${file}` } : { activity: "Editing files" };
    case "write":
      return file ? { activity: `Writing ${file}` } : {};
    case "read":
      return file ? { activity: `Reading ${file}` } : {};
    case "bash": {
      const command = str("command").split("\n")[0]!.trim();
      return command ? { activity: `Running ${clip(command, 80)}` } : {};
    }
    case "grep":
    case "glob":
      return str("pattern") ? { activity: `Searching for ${clip(str("pattern"), 60)}` } : {};
    case "list":
      return { activity: "Looking through the files" };
    case "webfetch":
      return str("url") ? { activity: `Reading ${clip(str("url"), 80)}` } : {};
    case "todowrite":
      return { activity: "Planning the change" };
    default:
      return {};
  }
}
