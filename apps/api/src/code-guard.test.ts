import { describe, expect, it } from "vitest";
import { checkDiff, compareWithBaseline, coderPrompt, installFallback, pullRequestBody, pullRequestUpdate } from "./code-plan.js";

const check = (command: string, passed: boolean) => ({ name: command.split(" ").pop()!, command, passed, output: "" });
const token = `ghp_${"a".repeat(36)}`;

describe("the diff guard", () => {
  it("blocks env files and private keys by name, but allows examples", () => {
    expect(checkDiff([{ path: ".env", bytes: 10 }], "").blocked).toMatch(/environment file \(\.env\)/);
    expect(checkDiff([{ path: "apps/api/.env.production", bytes: 10 }], "").blocked).toMatch(/environment file/);
    expect(checkDiff([{ path: "deploy/id_rsa", bytes: 10 }], "").blocked).toMatch(/private key file/);
    expect(checkDiff([{ path: "certs/server.pem", bytes: 10 }], "").blocked).toMatch(/private key file/);
    expect(checkDiff([{ path: ".env.example", bytes: 10 }], "").blocked).toBeNull();
  });

  it("blocks a secret on an added line and names the file", () => {
    const patch = `diff --git a/src/config.ts b/src/config.ts\n+++ b/src/config.ts\n+export const token = "${token}";`;
    expect(checkDiff([{ path: "src/config.ts", bytes: 40 }], patch).blocked).toBe("The change included what looks like a secret in src/config.ts. Nothing was pushed.");
    expect(checkDiff([{ path: "k.ts", bytes: 1 }], "+++ b/k.ts\n+-----BEGIN RSA PRIVATE KEY-----").blocked).toMatch(/secret in k\.ts/);
    expect(checkDiff([{ path: "aws.ts", bytes: 1 }], "+++ b/aws.ts\n+const id = 'AKIAABCDEFGHIJKLMNOP'").blocked).toMatch(/secret/);
  });

  it("ignores secrets on removed lines (taking one out is fine)", () => {
    expect(checkDiff([{ path: "src/config.ts", bytes: 40 }], `+++ b/src/config.ts\n-const token = "${token}";\n+const token = process.env.TOKEN;`).blocked).toBeNull();
  });

  it("only warns about big files and a lockfile changing alone", () => {
    const result = checkDiff([{ path: "assets/video.mp4", bytes: 8 * 1024 * 1024 }, { path: "pnpm-lock.yaml", bytes: 100 }], "");
    expect(result.blocked).toBeNull();
    expect(result.warnings).toEqual(["assets/video.mp4 is 8 MB.", "A lockfile changed though no package.json did."]);
    expect(checkDiff([{ path: "pnpm-lock.yaml", bytes: 100 }, { path: "package.json", bytes: 100 }], "").warnings).toEqual([]);
  });
});

describe("baselines, installs and PR text", () => {
  it("counts only checks that passed on the base as the change's failures", () => {
    const { failures, alreadyFailing } = compareWithBaseline([check("pnpm lint", false), check("pnpm test", false), check("pnpm typecheck", true)], [check("pnpm lint", false), check("pnpm test", true)]);
    expect(failures.map((c) => c.command)).toEqual(["pnpm test"]);
    expect(alreadyFailing.map((c) => c.command)).toEqual(["pnpm lint"]);
    expect(compareWithBaseline([check("pnpm test", false)], null).failures).toHaveLength(1);
  });

  it("retries an install without the frozen lockfile", () => {
    expect(installFallback("pnpm")).toBe("pnpm install --no-frozen-lockfile");
    expect(installFallback("npm")).toBe("npm install");
  });

  it("tells the coder not to work around a failed install", () => {
    expect(coderPrompt({ task: "Add a button", rules: null, checks: [], installFailed: true })).toMatch(/Don't change lockfiles, dependencies or tests/);
  });

  it("explains skipped checks and notes in the PR, without repeating failing ones", () => {
    const body = pullRequestBody({ task: "x", summary: "- y", checks: [], requester: "Kenneth", notes: [{ kind: "install_failed", text: "no deps" }, { kind: "warning", text: "Big file." }] });
    expect(body).toContain("Checks were skipped: dependencies didn’t install.");
    expect(body).toContain("⚠️ Big file.");
    const failing = pullRequestBody({ task: "x", summary: "- y", checks: [check("pnpm test", false)], requester: "K", notes: [{ kind: "still_failing", text: "Still failing: pnpm test." }] });
    expect(failing).toContain("❌ `pnpm test`");
    expect(failing).not.toContain("Still failing");
  });

  it("writes a dated update section for a follow-up", () => {
    const update = pullRequestUpdate({ task: "Also add tests", summary: "- tests", checks: [check("pnpm test", true)], at: new Date("2026-11-15T10:00:00Z") });
    expect(update).toMatch(/^## Update · 2026-11-15/);
    expect(update).toContain("> Also add tests");
    expect(update).toContain("✅ `pnpm test`");
  });
});
