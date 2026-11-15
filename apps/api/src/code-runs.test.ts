import { describe, expect, it, vi } from "vitest";
import { executeCodeRun, type CodeRun, type RunDeps } from "./code-runs.js";
import type { CommandResult, Computer } from "./computer.js";
import type { CodeCheck } from "./db/schema.js";

vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger: vi.fn() } }));

const WORKDIR = "/work/repo";
type Rule = [RegExp, CommandResult | ((command: string) => CommandResult)];

/**
 * A run against a scripted computer: each command matches the first rule that fits, else a sane
 * default. `checks` scripts each check's results in order (the baseline run comes first).
 */
function harness(options: {
  run?: Partial<CodeRun>;
  rules?: Rule[];
  checks?: Record<string, boolean[]>;
  baseline?: CodeCheck[] | null;
  packageJson?: string | null;
  patch?: string;
  files?: string;
  coderTurnMs?: number;
  onBoot?: () => void;
} = {}) {
  const run = {
    id: "00000000-0000-0000-0000-000000000001",
    clerkUserId: "user_1",
    chatId: null,
    installationId: 1,
    repo: "owner/app",
    baseBranch: "main",
    branch: "mates/add-thing-000000",
    task: "Add a thing.",
    status: "queued",
    checks: [],
    activity: [],
    notes: [],
    draft: false,
    installFailed: false,
    cancelRequested: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...options.run,
  } as unknown as CodeRun;
  const rows = new Map([[run.id, run]]);
  const commands: string[] = [];
  const saved: unknown[] = [];
  const prs: Parameters<RunDeps["github"]["openPullRequest"]>[1][] = [];
  const queues = Object.fromEntries(Object.entries(options.checks ?? { "pnpm typecheck": [true, true], "pnpm test": [true, true] }).map(([k, v]) => [k, [...v]]));
  const files: Record<string, string | null> = { [`${WORKDIR}/package.json`]: options.packageJson === undefined ? JSON.stringify({ scripts: { typecheck: "tsc", test: "vitest" } }) : options.packageJson };
  let clock = 0;
  const ok = (output = ""): CommandResult => ({ code: 0, output });
  const defaults = (command: string): CommandResult => {
    if (command.startsWith("git ls-remote")) return ok("");
    if (command === "git rev-parse HEAD") return ok("abc123\n");
    if (command === "ls -A") return ok("package.json\npnpm-lock.yaml\nsrc");
    if (command.startsWith("opencode run")) {
      clock += options.coderTurnMs ?? 60_000;
      return ok(JSON.stringify({ type: "text", part: { type: "text", text: "Done." } }));
    }
    if (command in queues) return { code: queues[command]!.shift() === false ? 1 : 0, output: `${command} output` };
    if (command === "git status --porcelain") return ok(" M src/a.ts");
    if (command.includes("> /work/change.patch")) files["/work/change.patch"] = options.patch ?? "+++ b/src/a.ts\n+export const a = 1;";
    if (command.includes("> /work/change.files")) files["/work/change.files"] = options.files ?? "21 src/a.ts";
    if (command.startsWith("git diff --stat")) return ok(" src/a.ts | 1 +");
    return ok();
  };
  const computer: Computer = {
    id: "sb_1",
    async run(command) {
      commands.push(command);
      for (const [pattern, result] of options.rules ?? []) if (pattern.test(command)) return typeof result === "function" ? result(command) : result;
      return defaults(command);
    },
    async writeFile(path, content) {
      files[path] = content;
    },
    async readFile(path) {
      return files[path] ?? null;
    },
    async shutdown() {},
  };
  const deps: RunDeps = {
    store: {
      load: async (id) => rows.get(id) ?? null,
      update: async (id, values) => rows.set(id, { ...rows.get(id)!, ...values }),
      cancelRequested: async () => false,
      baseline: async () => options.baseline ?? null,
      saveBaseline: async (...args) => saved.push(args),
    },
    boot: async () => {
      options.onBoot?.();
      return computer;
    },
    github: {
      repoToken: async () => "ghs_token",
      botIdentity: async () => ({ name: "mates[bot]", email: "1+mates[bot]@users.noreply.github.com" }),
      openPullRequest: async (_token, input) => {
        prs.push(input);
        return { number: 7, url: "https://github.com/owner/app/pull/7", title: input.title, draft: !!input.draft, created: !input.update };
      },
    },
    keys: { create: async () => ({ key: "sk-or-v1-test", hash: "h1" }), usage: async () => 0.42, remove: async () => undefined },
    cap: async () => 3,
    summarise: async () => "- Added a thing",
    requesterName: async () => "Kenneth",
    record: async () => undefined,
    announce: async () => undefined,
    now: () => clock,
  };
  return { deps, run: () => rows.get(run.id)!, commands, prs, saved, id: run.id };
}

const coderRuns = (commands: string[]) => commands.filter((c) => c.startsWith("opencode run")).length;
const signal = () => new AbortController().signal;

describe("a coding run", () => {
  it("opens a normal PR when the checks pass, and caches the baseline", async () => {
    const h = harness();
    await executeCodeRun(h.id, signal(), h.deps);
    expect(h.run()).toMatchObject({ status: "done", prNumber: 7, draft: false, runKeyHash: "h1", costUsd: 0.42 });
    expect(h.saved).toHaveLength(1);
    expect(h.prs[0]).toMatchObject({ draft: false, base: "main", head: "mates/add-thing-000000" });
    expect(h.prs[0]!.update).toBeUndefined();
  });

  it("fixes a failing check on the next round", async () => {
    const h = harness({ checks: { "pnpm typecheck": [true, true, true], "pnpm test": [true, false, true] } });
    await executeCodeRun(h.id, signal(), h.deps);
    expect(coderRuns(h.commands)).toBe(2);
    expect(h.run()).toMatchObject({ status: "done", draft: false });
  });

  it("opens a draft that needs attention when a check still fails", async () => {
    const h = harness({ checks: { "pnpm typecheck": [true, true, true, true, true], "pnpm test": [true, false, false, false, false] } });
    await executeCodeRun(h.id, signal(), h.deps);
    expect(coderRuns(h.commands)).toBe(4);
    expect(h.run()).toMatchObject({ status: "done", draft: true });
    expect(h.run().notes).toContainEqual({ kind: "still_failing", text: "Still failing: `pnpm test`." });
    expect(h.prs[0]!.draft).toBe(true);
  });

  it("leaves checks that already failed before the change alone", async () => {
    const h = harness({ baseline: [{ name: "test", command: "pnpm test", passed: false, output: "" }], checks: { "pnpm typecheck": [true], "pnpm test": [false] } });
    await executeCodeRun(h.id, signal(), h.deps);
    expect(coderRuns(h.commands)).toBe(1);
    expect(h.saved).toHaveLength(0);
    expect(h.run()).toMatchObject({ status: "done", draft: false });
    expect(h.run().notes).toContainEqual({ kind: "already_failing", text: "Already failing before this change: `pnpm test`." });
  });

  it("skips checks when dependencies won't install, and says so", async () => {
    const h = harness({ rules: [[/^pnpm install/, { code: 1, output: "ERR_PNPM_OUTDATED_LOCKFILE" }]] });
    await executeCodeRun(h.id, signal(), h.deps);
    expect(h.commands).toContain("pnpm install --no-frozen-lockfile");
    expect(h.commands.some((c) => c === "pnpm test")).toBe(false);
    expect(h.run()).toMatchObject({ status: "done", installFailed: true, draft: false });
    expect(h.prs[0]!.body).toContain("Checks were skipped: dependencies didn’t install.");
  });

  it("fails without pushing when nothing changed", async () => {
    const h = harness({ rules: [[/^git status --porcelain$/, { code: 0, output: "" }]] });
    await executeCodeRun(h.id, signal(), h.deps);
    expect(h.run()).toMatchObject({ status: "failed", error: "The coder finished without changing anything. Try describing the change in more detail." });
    expect(h.commands.some((c) => c.startsWith("git push"))).toBe(false);
  });

  it("blocks a secret in the change: nothing is pushed", async () => {
    const h = harness({ patch: `+++ b/src/config.ts\n+export const t = "ghp_${"x".repeat(36)}";`, files: "60 src/config.ts" });
    await executeCodeRun(h.id, signal(), h.deps);
    expect(h.run()).toMatchObject({ status: "failed", error: "The change included what looks like a secret in src/config.ts. Nothing was pushed." });
    expect(h.commands.some((c) => c.startsWith("git push"))).toBe(false);
    expect(h.prs).toHaveLength(0);
  });

  it("says so when GitHub rejects the push", async () => {
    const h = harness({ rules: [[/^git push/, { code: 1, output: "protected branch" }]] });
    await executeCodeRun(h.id, signal(), h.deps);
    expect(h.run()).toMatchObject({ status: "failed", error: "GitHub rejected the push. The branch may be protected or the bot lost access." });
  });

  it("stops when cancelled", async () => {
    const controller = new AbortController();
    const h = harness({ onBoot: () => controller.abort() });
    await executeCodeRun(h.id, controller.signal, h.deps);
    expect(h.run().status).toBe("cancelled");
    expect(h.prs).toHaveLength(0);
  });

  it("pushes what's ready as a draft when it runs out of time", async () => {
    const h = harness({ coderTurnMs: 45 * 60_000, checks: { "pnpm typecheck": [true, true], "pnpm test": [true, false] } });
    await executeCodeRun(h.id, signal(), h.deps);
    expect(coderRuns(h.commands)).toBe(1);
    expect(h.run()).toMatchObject({ status: "done", draft: true });
    expect(h.run().notes.map((n) => n.kind)).toContain("out_of_time");
  });

  it("continues an existing branch: fetches the base and updates the PR", async () => {
    const h = harness({ rules: [[/^git ls-remote/, { code: 0, output: "abc\trefs/heads/mates/add-thing-000000" }]] });
    await executeCodeRun(h.id, signal(), h.deps);
    expect(h.commands).toContain("git fetch --depth 50 origin main:refs/remotes/origin/main");
    expect(h.commands.some((c) => c.startsWith("git checkout -b"))).toBe(false);
    expect(h.prs[0]!.update).toMatch(/^## Update · /);
    expect(h.prs[0]!.comment).toBe("Pushed an update: Add a thing.");
  });
});
