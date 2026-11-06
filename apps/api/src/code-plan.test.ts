import { describe, expect, it } from "vitest";
import { assertPushable, branchName, coderPrompt, detectChecks, pullRequestBody, resolveRepo, scrub } from "./code-plan.js";

describe("code runs", () => {
  it("names branches after the task and the run", () => {
    expect(branchName("Add dark mode to the Settings page!", "3f9a1c2d-0000-4000-8000-000000000000")).toBe("mates/add-dark-mode-to-the-settings-page-3f9a1c");
    expect(branchName("🚀", "abcdef12-0000")).toBe("mates/change-abcdef");
    expect(branchName("x".repeat(80), "123456")).toHaveLength("mates/".length + 40 + 7);
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
  });

  it("writes a PR description with checks and the requester", () => {
    const body = pullRequestBody({ task: "Add a /health route", summary: "Adds GET /health.", checks: [{ name: "test", command: "pnpm test", passed: true, output: "" }], requester: "Kenneth" });
    expect(body).toContain("✅ `pnpm test`");
    expect(body).toContain("on behalf of Kenneth");
  });
});
