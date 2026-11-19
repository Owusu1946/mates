import type { CodeCheck, CodeNote } from "./db/schema.js";

/** The kinds of change a branch can be, as most teams name them (`fix/…`, `docs/…`). */
export const BRANCH_TYPES = ["feat", "fix", "docs", "refactor", "test", "chore", "perf"] as const;
export type BranchType = (typeof BRANCH_TYPES)[number];

const SLUG_WORDS = 5;
const SLUG_CHARS = 28;
/** Words that make a sentence read well and a branch name long. */
const FILLER = new Set(
  "a an the to of for in on at by from with into and or but so as is are be been it its this that these those there here i we you me my our your us please can could would should will just also some any all make sure need want lets let".split(" "),
);

/** The task's likely kind of change, when the mate didn't say. Checked in order: a README fix is docs. */
export function branchType(task: string): BranchType {
  const text = task.toLowerCase();
  if (/\b(readme|docs?|documentation|changelog|jsdoc|docstrings?)\b/.test(text)) return "docs";
  if (/\b(fix(es|ed|ing)?|bugs?|broken|crash(es|ing)?|errors?|regression|typos?)\b/.test(text)) return "fix";
  if (/\b(tests?|specs?|coverage)\b/.test(text)) return "test";
  if (/\b(refactor\w*|clean ?up|rename|restructure|simplify)\b/.test(text)) return "refactor";
  if (/\b(perf|performance|faster|speed up|optimi[sz]e\w*)\b/.test(text)) return "perf";
  if (/\b(bump|upgrade|dependenc(y|ies)|deps|lint(er|ing)?|ci|config)\b/.test(text)) return "chore";
  return "feat";
}

/**
 * At most five meaningful words, about 28 characters, cut only between words: ASCII letters,
 * digits and dashes, so it's always a safe git ref and a safe shell argument.
 */
export function branchSlug(text: string, type?: BranchType) {
  const words = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !FILLER.has(word));
  // "fix/fix-login" says it twice.
  if (type && words[0] === type) words.shift();
  const kept: string[] = [];
  for (const word of words) {
    if (kept.length === SLUG_WORDS) break;
    const next = [...kept, word].join("-");
    if (next.length > SLUG_CHARS) {
      if (!kept.length) kept.push(word.slice(0, SLUG_CHARS));
      break;
    }
    kept.push(word);
  }
  return kept.join("-");
}

/**
 * `mates/fix/login-redirect-3f9a`: the kind of change, a few words, and four characters of the run
 * so names never collide. The mate can suggest the name ("fix/login redirect"); whatever it sends
 * is cleaned the same way, and the task fills in anything missing.
 */
export function branchName(task: string, runId: string, suggested?: unknown) {
  const hint = typeof suggested === "string" ? suggested.trim().toLowerCase() : "";
  const [head, ...rest] = hint.split("/");
  const hinted = BRANCH_TYPES.find((type) => type === head?.trim());
  const type = hinted ?? branchType(task);
  const firstSentence = task.split(/\n|(?<=[.!?])\s/)[0] ?? task;
  const slug = branchSlug(hinted ? rest.join(" ") : hint, type) || branchSlug(firstSentence, type) || "change";
  return `mates/${type}/${slug}-${runId.replace(/-/g, "").slice(0, 4)}`;
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
/** Every token the coder reads is paid for: this is how it should move through a repo. */
const ECONOMY =
  "Work economically. Find code with grep and glob before opening anything, read only the parts of a file you need, and change files with targeted edits instead of rewriting them. Skip lockfiles, build output, node_modules and generated files. Don't re-read a file you just edited. When a command prints a lot, keep the end (for example `pnpm test 2>&1 | tail -n 60`).";

/**
 * The coder's brief. A fix round continues the same session, which already holds the task, the
 * rules and what it read, so it gets only the failures: re-sending the rest would pay for it twice.
 */
export function coderPrompt(input: { task: string; rules: string | null; checks: { command: string }[]; failures?: CodeCheck[]; continued?: boolean; installFailed?: boolean }) {
  const failed = input.failures?.length
    ? `These checks failed after your last change. Fix the causes, not the tests:\n\n${input.failures.map((check) => `$ ${check.command}\n${check.output.slice(-2_000)}`).join("\n\n")}`
    : null;
  if (input.continued && failed) return `${failed}\n\nUse targeted edits; don't start over.`;
  const parts = [
    `You are working in a git repository. Make this change:\n\n${input.task}`,
    "Follow the existing code style and structure. Keep the change focused: no unrelated refactors, no new dependencies unless the task needs them. Do not commit, push or create branches; that is handled for you. Never print or write secrets.",
    ECONOMY,
  ];
  if (input.rules) parts.push(`The repository's own instructions:\n\n${input.rules.slice(0, 6_000)}`);
  if (input.installFailed)
    parts.push("The project's dependencies failed to install on this computer, so its checks can't run here. Don't change lockfiles, dependencies or tests to work around that; just make the change carefully.");
  if (input.checks.length) parts.push(`These must pass when you finish: ${input.checks.map((check) => `\`${check.command}\``).join(", ")}. Run each once before you finish and fix what fails.`);
  if (failed) parts.push(failed);
  return parts.join("\n\n");
}

/** Checks and notes as markdown lines, for the PR description and its updates. */
function checksMarkdown(checks: CodeCheck[], notes: CodeNote[]) {
  const lines = checks.length
    ? checks.map((check) => `- ${check.passed ? "✅" : "❌"} \`${check.command}\``)
    : [notes.some((note) => note.kind === "install_failed") ? "- Checks were skipped: dependencies didn’t install." : "- No automated checks were found in this repository."];
  // A failed install shows as the line above; checks still failing already show as ❌.
  for (const note of notes) if (note.kind !== "install_failed" && note.kind !== "still_failing") lines.push(`- ${note.kind === "warning" ? "⚠️" : note.kind === "out_of_time" ? "⏱️" : "ℹ️"} ${note.text}`);
  return lines.join("\n");
}

/** The PR description: what changed, how it was checked, and who asked. */
export function pullRequestBody(input: { task: string; summary: string; checks: CodeCheck[]; requester: string; notes?: CodeNote[] }) {
  return [
    `## What changed\n\n${input.summary.trim()}`,
    `## Request\n\n> ${input.task.trim().replace(/\n/g, "\n> ")}`,
    `## Checks\n\n${checksMarkdown(input.checks, input.notes ?? [])}`,
    `---\nOpened by Mates on behalf of ${input.requester}.`,
  ].join("\n\n");
}

/** A follow-up's section, added to the existing PR description. */
export function pullRequestUpdate(input: { task: string; summary: string; checks: CodeCheck[]; notes?: CodeNote[]; at: Date }) {
  return [
    `## Update · ${input.at.toISOString().slice(0, 10)}`,
    `> ${input.task.trim().replace(/\n/g, "\n> ")}`,
    input.summary.trim(),
    `**Checks**\n\n${checksMarkdown(input.checks, input.notes ?? [])}`,
  ].join("\n\n");
}

/** If a frozen install fails (often a stale lockfile), the same manager without the freeze. */
export function installFallback(manager: PackageManager) {
  return { pnpm: "pnpm install --no-frozen-lockfile", yarn: "yarn install", bun: "bun install", npm: "npm install" }[manager];
}

/**
 * Splits check results against the base commit's: only checks that passed there and fail now are
 * the change's failures. Ones already failing on the base are reported, never sent to the coder.
 */
export function compareWithBaseline(results: CodeCheck[], baseline: CodeCheck[] | null) {
  const failedBefore = new Set((baseline ?? []).filter((check) => !check.passed).map((check) => check.command));
  const failing = results.filter((check) => !check.passed);
  return {
    failures: failing.filter((check) => !failedBefore.has(check.command)),
    alreadyFailing: failing.filter((check) => failedBefore.has(check.command)),
  };
}

/** Files never allowed in a pushed change, whatever they contain. */
const BLOCKED_FILES = [
  { test: (path: string) => /(^|\/)\.env(\.[^/]*)?$/.test(path) && !/\.env\.(example|sample|template)$/.test(path), why: "an environment file" },
  { test: (path: string) => /(^|\/)(id_rsa|id_ed25519|id_ecdsa|id_dsa)$/.test(path) || /\.(pem|p12|pfx|key)$/.test(path), why: "a private key file" },
];
/** Secrets in added lines: the output patterns plus a few more providers. */
const DIFF_SECRETS = [
  ...SECRET_PATTERNS,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\bsk_live_[0-9A-Za-z]{20,}\b/g, // Stripe secret key
  /\bxox[bap]-[0-9A-Za-z-]{10,}\b/g, // Slack tokens
];
/** Whether text carries a known kind of secret: a token, API key or private key. */
export function looksLikeSecret(text: string) {
  return DIFF_SECRETS.some((pattern) => new RegExp(pattern.source).test(text));
}
const LOCKFILES = ["pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lock", "bun.lockb"];
const BIG_FILE = 5 * 1024 * 1024;

export type DiffCheck = { blocked: string | null; warnings: string[] };

/**
 * The last look before a push. `files` are the staged paths with their sizes; `patch` is the
 * staged diff. A secret, env file or key blocks the push; big files or a lockfile change with no
 * dependency change only warn.
 */
export function checkDiff(files: { path: string; bytes: number }[], patch: string): DiffCheck {
  for (const file of files) {
    const rule = BLOCKED_FILES.find((item) => item.test(file.path));
    if (rule) return { blocked: `The change included ${rule.why} (${file.path}). Nothing was pushed.`, warnings: [] };
  }
  let current = "";
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++ b/")) current = line.slice(6);
    else if (line.startsWith("+") && !line.startsWith("+++") && DIFF_SECRETS.some((pattern) => new RegExp(pattern.source).test(line)))
      return { blocked: `The change included what looks like a secret${current ? ` in ${current}` : ""}. Nothing was pushed.`, warnings: [] };
  }
  const warnings: string[] = [];
  for (const file of files) if (file.bytes > BIG_FILE) warnings.push(`${file.path} is ${Math.round(file.bytes / 1024 / 1024)} MB.`);
  const names = files.map((file) => file.path.split("/").pop()!);
  if (names.some((name) => LOCKFILES.includes(name)) && !names.includes("package.json")) warnings.push("A lockfile changed though no package.json did.");
  return { blocked: null, warnings };
}

/**
 * `retry` is opencode backing off after a failed model call; `failure` is an error that ended
 * its turn. Both carry the provider's message so the run can stop and say why.
 */
export type CoderEvent = { activity?: string; text?: string; retry?: { attempt: number; message: string }; failure?: string };
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

type RawEvent = {
  type?: string;
  attempt?: number;
  error?: { message?: string; data?: { message?: string } };
  part?: { type?: string; tool?: string; text?: string; state?: { status?: string; input?: Record<string, unknown> } };
};

/**
 * One line of `opencode run --format json` as something a person can follow on their phone:
 * a tool call becomes "Editing src/app.ts" or "Running pnpm test", a new model step "Thinking",
 * the coder's own words come back as `text` (kept for the PR summary). Tool lines arrive when
 * the tool finishes. Anything unrecognised is ignored, never thrown on.
 */
export function readCoderEvent(line: string, workdir: string): CoderEvent {
  let event: RawEvent;
  try {
    event = JSON.parse(line);
  } catch {
    return line.trim() ? { text: line } : {};
  }
  if (!event || typeof event !== "object") return {};
  const problem = clip((event.error?.data?.message || event.error?.message || "").trim(), 200);
  if (event.type === "retry") {
    const attempt = typeof event.attempt === "number" ? event.attempt : 1;
    return { retry: { attempt, message: problem }, activity: `The model failed${problem ? ` (${problem})` : ""}; retrying, attempt ${attempt}` };
  }
  if (event.type === "error") return { failure: problem || "The coder stopped with an error.", activity: `Error: ${problem || "the coder stopped"}` };
  if (event.type === "step_start") return { activity: "Thinking" };
  const part = event.part;
  if (!part) return {};
  if (event.type === "text" || part.type === "text") return part.text?.trim() ? { text: part.text } : {};
  if (event.type !== "tool_use" && part.type !== "tool") return {};
  if (part.state?.status === "error") return {};
  const input = part.state?.input ?? {};
  const str = (...keys: string[]) => {
    for (const key of keys) if (typeof input[key] === "string" && input[key]) return input[key] as string;
    return "";
  };
  const file = clip(str("filePath", "file_path", "path").replace(`${workdir}/`, "").replace(/^\.\//, ""), 80);
  switch (part.tool) {
    case "edit":
    case "patch":
    case "multiedit":
    case "apply_patch":
      return file ? { activity: `Editing ${file}` } : { activity: "Editing files" };
    case "write":
      return file ? { activity: `Writing ${file}` } : { activity: "Writing a file" };
    case "read":
      return file ? { activity: `Reading ${file}` } : {};
    case "bash":
    case "shell": {
      const command = str("command", "cmd").split("\n")[0]!.trim();
      return command ? { activity: `Running ${clip(command, 80)}` } : {};
    }
    case "grep":
    case "glob":
    case "codesearch":
      return str("pattern", "query") ? { activity: `Searching for ${clip(str("pattern", "query"), 60)}` } : { activity: "Searching the code" };
    case "list":
    case "ls":
      return { activity: file ? `Looking through ${file}` : "Looking through the files" };
    case "webfetch":
      return str("url") ? { activity: `Reading ${clip(str("url"), 80)}` } : {};
    case "websearch":
      return str("query") ? { activity: `Searching the web for ${clip(str("query"), 60)}` } : {};
    case "todowrite":
      return { activity: "Planning the change" };
    default:
      return part.tool ? { activity: `Using ${clip(part.tool, 40)}` } : {};
  }
}
