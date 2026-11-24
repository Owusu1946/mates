/**
 * Sample coding runs for the Code view: Yaw's past runs, one waiting on you, and one that plays
 * live when you open it. Like T3 Code's timeline data, steps carry only a label and ids; patches
 * and command output are looked up by id when a row or panel shows them.
 */

export type StepKind = "think" | "read" | "search" | "edit" | "command";

export type Step = {
  id: string;
  kind: StepKind;
  /** "Read", "Ran", "Thought about…" */
  label: string;
  /** A path or a command, shown in mono after the label. */
  target?: string;
  /** How long the step takes when played. */
  ms: number;
  patchId?: string;
  outputId?: string;
  failed?: boolean;
  /** A think step's reasoning: a **heading** line, then paragraphs and lists. */
  thought?: string;
};

export type RunItem =
  | { type: "message"; id: string; author: "me" | "mate"; text: string }
  | { type: "work"; id: string; steps: Step[]; durationMs: number }
  | { type: "approval"; id: string; command: string; reason: string; state: "open" | "allowed" | "denied" }
  | { type: "changes"; id: string; patchIds: string[] };

/** What a live run does next. Approvals pause it until you answer. */
export type ScriptEvent =
  | { type: "step"; step: Step }
  | { type: "approval"; id: string; command: string; reason: string; denied: string }
  | { type: "message"; text: string }
  | { type: "changes" };

export type Terminal = { id: string; label: string; outputIds: string[] };

export type Run = {
  id: string;
  repoId: string;
  title: string;
  branch: string;
  where: "this PC" | "cloud";
  pr?: number;
  items: RunItem[];
  /** Plays when the run is opened (or, for one waiting on you, once you answer). */
  script: ScriptEvent[];
  /** Cloud runs have none: their output is read-only in the timeline. */
  terminals: Terminal[];
  /** Patches already in the run before anything plays. */
  patchIds: string[];
};

export const MATE_ID = "yaw";

// ── Patches ───────────────────────────────────────────────────────────────────────────────────

export const PATCHES: Record<string, { path: string; patch: string }> = {
  "signin-apple": {
    path: "apps/mobile/app/sign-in.tsx",
    patch: `--- a/apps/mobile/app/sign-in.tsx
+++ b/apps/mobile/app/sign-in.tsx
@@ -18,7 +18,10 @@ export function SignInScreen() {
   const { startSSOFlow } = useSSO();

   const signInWithApple = async () => {
-    const result = await startSSOFlow({ strategy: "oauth_apple" });
+    const result = await startSSOFlow({
+      strategy: "oauth_apple",
+      redirectUrl: AuthSession.makeRedirectUri({ path: "sso-callback" }),
+    });
     if (result.createdSessionId) {
       await result.setActive?.({ session: result.createdSessionId });
     }
`,
  },
  "signin-layout": {
    path: "apps/mobile/app/_layout.tsx",
    patch: `--- a/apps/mobile/app/_layout.tsx
+++ b/apps/mobile/app/_layout.tsx
@@ -1,8 +1,12 @@
+import * as WebBrowser from "expo-web-browser";
 import { ClerkProvider } from "@clerk/clerk-expo";
 import { Stack } from "expo-router";
 import { tokenCache } from "../lib/tokenCache";

+// Finish the sign-in sheet when the app comes back from Safari.
+WebBrowser.maybeCompleteAuthSession();
+
 export default function RootLayout() {
   return (
     <ClerkProvider tokenCache={tokenCache}>
       <Stack screenOptions={{ headerShown: false }} />
`,
  },
  "signin-test": {
    path: "apps/mobile/app/sign-in.test.tsx",
    patch: `--- /dev/null
+++ b/apps/mobile/app/sign-in.test.tsx
@@ -0,0 +1,8 @@
+import { fireEvent, render } from "@testing-library/react-native";
+import { SignInScreen } from "./sign-in";
+
+test("Apple sign-in passes a redirect back to the app", () => {
+  const { getByText } = render(<SignInScreen />);
+  fireEvent.press(getByText("Continue with Apple"));
+  expect(startSSOFlow).toHaveBeenCalledWith(expect.objectContaining({ redirectUrl: expect.any(String) }));
+});
`,
  },
  "dark-theme": {
    path: "apps/mobile/src/theme/useTheme.ts",
    patch: `--- a/apps/mobile/src/theme/useTheme.ts
+++ b/apps/mobile/src/theme/useTheme.ts
@@ -1,9 +1,15 @@
-import { light } from "./colors";
+import { useColorScheme } from "react-native";
+import { useSettings } from "../settings/store";
+import { dark, light } from "./colors";

-/** The app's colours. */
+/** The app's colours: System follows the phone, or always Light or Dark. */
 export function useTheme() {
-  return light;
+  const system = useColorScheme();
+  const scheme = useSettings((settings) => settings.colorScheme);
+  const isDark = scheme === "dark" || (scheme === "system" && system === "dark");
+  return isDark ? dark : light;
 }

 export type Theme = ReturnType<typeof useTheme>;
`,
  },
  "dark-settings": {
    path: "apps/mobile/app/settings/appearance.tsx",
    patch: `--- a/apps/mobile/app/settings/appearance.tsx
+++ b/apps/mobile/app/settings/appearance.tsx
@@ -6,6 +6,14 @@ export default function Appearance() {
   return (
     <Screen title="Appearance">
       <Section title="App icon">{/* … */}</Section>
+      <Section title="Color scheme">
+        <Segmented
+          options={["System", "Light", "Dark"]}
+          value={label(colorScheme)}
+          onChange={(next) => setColorScheme(next.toLowerCase() as ColorScheme)}
+        />
+      </Section>
+      <Text style={styles.hint}>System follows your phone.</Text>
     </Screen>
   );
 }
`,
  },
  "habits-test": {
    path: "apps/api/src/habits/streaks.test.ts",
    patch: `--- a/apps/api/src/habits/streaks.test.ts
+++ b/apps/api/src/habits/streaks.test.ts
@@ -10,9 +10,11 @@ describe("streaks", () => {
   it("counts today when the habit is done before midnight", () => {
-    const now = new Date();
+    // A fixed clock: the test used to fail when it ran across midnight UTC.
+    vi.setSystemTime(new Date("2026-11-20T23:30:00Z"));
     const streak = currentStreak(doneOn(["2026-11-19", "2026-11-20"]), "Africa/Accra");
     expect(streak).toBe(2);
+    vi.useRealTimers();
   });

   it("breaks after a missed day", () => {
`,
  },
  "csv-export": {
    path: "src/export/csv.ts",
    patch: `--- /dev/null
+++ b/src/export/csv.ts
@@ -0,0 +1,12 @@
+import type { Transaction } from "../types";
+
+const escape = (value: string) => (/[",\\n]/.test(value) ? \`"\${value.replaceAll('"', '""')}"\` : value);
+
+/** Transactions as CSV, in the columns banks and spreadsheets expect. */
+export function toCsv(transactions: Transaction[]): string {
+  const header = "Date,Description,Category,Amount (GHS)";
+  const rows = transactions.map((t) =>
+    [t.date, escape(t.description), t.category, t.amount.toFixed(2)].join(","),
+  );
+  return [header, ...rows].join("\\n");
+}
`,
  },
};

// ── Command output, with the colours test runners print ────────────────────────────────────────

const E = "\u001b[";

export const OUTPUTS: Record<string, string> = {
  "dev-expo": `${E}2m$ pnpm --filter mobile dev${E}0m\r\n${E}36mStarting Metro Bundler${E}0m\r\n${E}2mwarning: Bundler cache is empty, rebuilding (this may take a minute)${E}0m\r\n\r\n› Metro waiting on ${E}1mexp://192.168.1.14:8081${E}0m\r\n› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)\r\n\r\n› Press ${E}1mi${E}0m │ open iOS simulator\r\n› Press ${E}1mr${E}0m │ reload app\r\n\r\n${E}32miOS Bundled 1834ms${E}0m apps/mobile/index.ts ${E}2m(1412 modules)${E}0m\r\n`,
  "add-testing-lib": `${E}2m$ pnpm --filter mobile add -D @testing-library/react-native${E}0m\r\nPackages: ${E}32m+3${E}0m\r\n${E}32m+++${E}0m\r\nProgress: resolved 1288, reused 1285, downloaded 3, added 3, done\r\n\r\ndevDependencies:\r\n${E}32m+${E}0m @testing-library/react-native ${E}2m13.2.0${E}0m\r\n\r\nDone in 3.4s\r\n`,
  "signin-test-pass": `${E}2m$ pnpm --filter mobile test sign-in${E}0m\r\n\r\n ${E}1;32mPASS${E}0m apps/mobile/app/sign-in.test.tsx\r\n  ${E}32m✓${E}0m Apple sign-in passes a redirect back to the app ${E}2m(41 ms)${E}0m\r\n\r\n${E}1mTest Suites:${E}0m ${E}1;32m1 passed${E}0m, 1 total\r\n${E}1mTests:${E}0m       ${E}1;32m1 passed${E}0m, 1 total\r\n${E}1mTime:${E}0m        1.82 s\r\n`,
  "typecheck-pass": `${E}2m$ pnpm typecheck${E}0m\r\n${E}2m• Packages in scope: @muse-clone/api, @muse-clone/mobile, @muse-clone/web${E}0m\r\n${E}2m• Running typecheck in 6 packages${E}0m\r\n\r\n ${E}1mTasks:${E}0m    ${E}32m6 successful${E}0m, 6 total\r\n${E}1mCached:${E}0m    4 cached, 6 total\r\n  ${E}1mTime:${E}0m    9.204s\r\n`,
  "habits-fail": `${E}2m$ pnpm --filter api test habits${E}0m\r\n\r\n ${E}31m❯${E}0m src/habits/streaks.test.ts ${E}2m(4 tests | 1 failed)${E}0m\r\n   ${E}31m×${E}0m counts today when the habit is done before midnight\r\n     ${E}31mAssertionError: expected 1 to be 2${E}0m\r\n\r\n ${E}1mTest Files${E}0m  ${E}1;31m1 failed${E}0m ${E}2m(1)${E}0m\r\n      ${E}1mTests${E}0m  ${E}1;31m1 failed${E}0m ${E}2m|${E}0m ${E}1;32m3 passed${E}0m ${E}2m(4)${E}0m\r\n`,
  "habits-pass": `${E}2m$ pnpm --filter api test habits${E}0m\r\n\r\n ${E}32m✓${E}0m src/habits/streaks.test.ts ${E}2m(4 tests)${E}0m 38ms\r\n\r\n ${E}1mTest Files${E}0m  ${E}1;32m1 passed${E}0m ${E}2m(1)${E}0m\r\n      ${E}1mTests${E}0m  ${E}1;32m4 passed${E}0m ${E}2m(4)${E}0m\r\n`,
  "install-frozen": `${E}2m$ pnpm install --frozen-lockfile${E}0m\r\nLockfile is up to date, resolution step is skipped\r\nProgress: resolved 1288, reused 1288, downloaded 0, added 0, done\r\nDone in 2.1s\r\n`,
  "csv-test": `${E}2m$ npm test -- export${E}0m\r\n\r\n ${E}32m✓${E}0m src/export/csv.test.ts ${E}2m(3 tests)${E}0m 12ms\r\n\r\n ${E}1mTests${E}0m  ${E}1;32m3 passed${E}0m ${E}2m(3)${E}0m\r\n`,
};

// ── Runs ─────────────────────────────────────────────────────────────────────────────────────

const step = (id: string, kind: StepKind, label: string, target: string | undefined, ms: number, extra: Partial<Step> = {}): Step => ({ id, kind, label, ...(target ? { target } : {}), ms, ...extra });

/** A thinking step. It takes as long as its words need to stream in, at a reading pace. */
const think = (id: string, thought: string): Step => step(id, "think", "Thought", undefined, Math.min(9000, 600 + thought.split(/\s+/).length * 32), { thought });

export const RUNS: Run[] = [
  {
    id: "run-signin",
    repoId: "muse-clone",
    title: "Fix the iOS sign-in sheet",
    branch: "yaw/ios-sign-in-sheet",
    where: "this PC",
    items: [{ type: "message", id: "s0", author: "me", text: "The Apple sign-in sheet on iOS never closes after you pick your account. Fix it and add a test." }],
    script: [
      {
        type: "step",
        step: think(
          "s1",
          `**Understanding the sign-in flow**

The sheet opens, but it never closes after you pick an Apple account. So the browser session isn't handing control back to the app. That usually comes down to one of two things: the redirect doesn't point back into the app, or nothing finishes the auth session when the app comes back.

I'll check, in order:
1. How \`sign-in.tsx\` starts the SSO flow, and what redirect it passes.
2. Whether the root layout completes the auth session.
3. Whether anything else in the app already calls \`maybeCompleteAuthSession\`.`,
        ),
      },
      { type: "step", step: step("s2", "read", "Read", "apps/mobile/app/sign-in.tsx", 700) },
      { type: "step", step: step("s3", "read", "Read", "apps/mobile/app/_layout.tsx", 600) },
      { type: "step", step: step("s4", "search", "Searched for", "maybeCompleteAuthSession", 900) },
      {
        type: "step",
        step: think(
          "s5",
          `**Found it: two gaps**

\`startSSOFlow\` gets no \`redirectUrl\`, so Apple sends you back to a URL the app doesn't own. And the search came back empty: nothing calls \`maybeCompleteAuthSession\`. Both need fixing for the sheet to close.

Plan:
- Pass a redirect built with \`AuthSession.makeRedirectUri\` in \`sign-in.tsx\`.
- Call \`WebBrowser.maybeCompleteAuthSession()\` once, at the top of \`_layout.tsx\`.
- Add a test that the redirect is passed. The mobile app has no test library yet, so adding one needs your OK.
- Run the test and the typecheck before I report back.`,
        ),
      },
      { type: "step", step: step("s6", "edit", "Edited", "apps/mobile/app/sign-in.tsx", 1100, { patchId: "signin-apple" }) },
      { type: "step", step: step("s7", "edit", "Edited", "apps/mobile/app/_layout.tsx", 900, { patchId: "signin-layout" }) },
      { type: "approval", id: "s8", command: "pnpm --filter mobile add -D @testing-library/react-native", reason: "Adds a test library to the mobile app.", denied: "OK, I left the dependencies alone. The fix is in; the test can come once you've added a test library." },
      { type: "step", step: step("s9", "command", "Ran", "pnpm --filter mobile add -D @testing-library/react-native", 1800, { outputId: "add-testing-lib" }) },
      { type: "step", step: step("s10", "edit", "Created", "apps/mobile/app/sign-in.test.tsx", 1000, { patchId: "signin-test" }) },
      { type: "step", step: step("s11", "command", "Ran", "pnpm --filter mobile test sign-in", 2200, { outputId: "signin-test-pass" }) },
      {
        type: "step",
        step: think(
          "s11b",
          `**Checking nothing else broke**

The new test passes. \`_layout.tsx\` wraps every screen, though, so a mistake there would show up far from sign-in. I'll run the whole repo's typecheck before calling it done.`,
        ),
      },
      { type: "step", step: step("s12", "command", "Ran", "pnpm typecheck", 2000, { outputId: "typecheck-pass" }) },
      { type: "message", text: "Fixed. The sheet had no way back into the app: Apple's redirect had no path, and the app never finished the browser session. Sign-in now passes a redirect and the root layout completes the session when Safari hands back. I added a test for the redirect; it and the typecheck pass." },
      { type: "changes" },
    ],
    terminals: [
      { id: "t-tests", label: "Tests", outputIds: [] },
      { id: "t-dev", label: "dev", outputIds: ["dev-expo"] },
    ],
    patchIds: [],
  },
  {
    id: "run-habits",
    repoId: "muse-clone",
    title: "Flaky habits test",
    branch: "yaw/flaky-streaks",
    where: "this PC",
    items: [
      { type: "message", id: "h0", author: "me", text: "The streaks test fails every few runs in CI. Find out why." },
      {
        type: "work",
        id: "h1",
        durationMs: 48_000,
        steps: [
          step("h1a", "read", "Read", "apps/api/src/habits/streaks.test.ts", 0),
          step("h1b", "read", "Read", "apps/api/src/habits/streaks.ts", 0),
          step("h1c", "command", "Ran", "pnpm --filter api test habits", 0, { outputId: "habits-fail", failed: true }),
          think(
            "h1d",
            `**Why it only fails sometimes**

The failing case is "counts today when the habit is done before midnight", and it builds today's date with \`new Date()\`. The streak is counted in Africa/Accra time, which is UTC. So when CI runs just after midnight, "today" moves on and the streak drops from 2 to 1.

The fix is to pin the clock in the test with \`vi.setSystemTime\`, not to change \`currentStreak\`, which is right.`,
          ),
        ],
      },
      { type: "message", id: "h2", author: "mate", text: "It's the clock: the test uses today's date, so it fails when CI runs across midnight UTC. I'll pin the time. The lockfile also changed since the last install, so I need to reinstall first." },
      { type: "approval", id: "h3", command: "pnpm install --frozen-lockfile", reason: "Installs the packages the lockfile asks for.", state: "open" },
    ],
    script: [
      { type: "step", step: step("h4", "command", "Ran", "pnpm install --frozen-lockfile", 1600, { outputId: "install-frozen" }) },
      {
        type: "step",
        step: think(
          "h4b",
          `**Pinning the clock**

Packages are in. I'll set the system time to 23:30 UTC on the 20th inside the test, the edge case that was failing, and put real timers back afterwards so the other tests aren't affected.`,
        ),
      },
      { type: "step", step: step("h5", "edit", "Edited", "apps/api/src/habits/streaks.test.ts", 1000, { patchId: "habits-test" }) },
      { type: "step", step: step("h6", "command", "Ran", "pnpm --filter api test habits", 1800, { outputId: "habits-pass" }) },
      { type: "message", text: "Pinned the clock in the test, so it no longer depends on when it runs. All 4 streak tests pass." },
      { type: "changes" },
    ],
    terminals: [{ id: "t-habits", label: "Tests", outputIds: ["habits-fail"] }],
    patchIds: [],
  },
  {
    id: "run-dark",
    repoId: "muse-clone",
    title: "Ship dark mode",
    branch: "yaw/dark-mode",
    where: "this PC",
    pr: 142,
    items: [
      { type: "message", id: "d0", author: "me", text: "Ship dark mode in the mobile app. System, Light and Dark in Settings." },
      {
        type: "work",
        id: "d1",
        durationMs: 3 * 60_000 + 12_000,
        steps: [
          step("d1a", "read", "Read", "apps/mobile/src/theme/colors.ts", 0),
          step("d1b", "read", "Read", "apps/mobile/src/theme/useTheme.ts", 0),
          step("d1c", "read", "Read", "apps/mobile/app/settings/appearance.tsx", 0),
          step("d1d", "edit", "Edited", "apps/mobile/src/theme/useTheme.ts", 0, { patchId: "dark-theme" }),
          step("d1e", "edit", "Edited", "apps/mobile/app/settings/appearance.tsx", 0, { patchId: "dark-settings" }),
          step("d1f", "command", "Ran", "pnpm typecheck", 0, { outputId: "typecheck-pass" }),
        ],
      },
      { type: "message", id: "d2", author: "mate", text: "Done: PR #142 is up. The theme follows the system, Settings has Light / Dark / System, and all checks pass." },
      { type: "changes", id: "d3", patchIds: ["dark-theme", "dark-settings"] },
    ],
    script: [],
    terminals: [{ id: "t-dark", label: "Checks", outputIds: ["typecheck-pass"] }],
    patchIds: ["dark-theme", "dark-settings"],
  },
  {
    id: "run-csv",
    repoId: "finora",
    title: "Add CSV export",
    branch: "yaw/csv-export",
    where: "cloud",
    pr: 18,
    items: [
      { type: "message", id: "c0", author: "me", text: "Let people export their transactions as CSV." },
      {
        type: "work",
        id: "c1",
        durationMs: 1 * 60_000 + 40_000,
        steps: [
          step("c1a", "read", "Read", "src/types.ts", 0),
          step("c1b", "edit", "Created", "src/export/csv.ts", 0, { patchId: "csv-export" }),
          step("c1c", "command", "Ran", "npm test -- export", 0, { outputId: "csv-test" }),
        ],
      },
      { type: "message", id: "c2", author: "mate", text: "Added CSV export with the columns banks use, amounts in GH¢ to 2 places. Tests pass; PR #18 is open." },
      { type: "changes", id: "c3", patchIds: ["csv-export"] },
    ],
    script: [],
    terminals: [],
    patchIds: ["csv-export"],
  },
];

/** A follow-up turn for any run: Yaw checks again and answers. */
export function followUpScript(text: string, turn: number): ScriptEvent[] {
  return [
    {
      type: "step",
      step: think(
        `f${turn}a`,
        `**Reading your message**

You asked: "${text.trim().slice(0, 120)}". Nothing in the change needs undoing for that. I'll run the typecheck again to make sure everything still holds before I answer.`,
      ),
    },
    { type: "step", step: step(`f${turn}b`, "command", "Ran", "pnpm typecheck", 1800, { outputId: "typecheck-pass" }) },
    { type: "message", text: text.trim().endsWith("?") ? "Good question. I checked again and everything still passes, so nothing else changes." : "Done. I checked the change again and everything still passes." },
  ];
}

/** A run started from a repo's page: Yaw looks around, checks, and reports back. */
export function newRun(repo: { id: string; where: Run["where"] }, where: Run["where"], text: string, count: number): Run {
  const title = text.trim().replace(/\s+/g, " ");
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "change";
  const id = `run-new-${count}`;
  return {
    id,
    repoId: repo.id,
    title: title.length > 48 ? `${title.slice(0, 47)}…` : title,
    branch: `yaw/${slug}`,
    where,
    items: [{ type: "message", id: `${id}-0`, author: "me", text: text.trim() }],
    script: [
      {
        type: "step",
        step: think(
          `${id}-a`,
          `**Getting my bearings**

Before changing anything I want to know where this lives in the code and how the project is checked. I'll:
1. Search for the parts of the code this touches.
2. Read the README for how the repo is built and tested.
3. Run the typecheck, so I know it's clean before I start.`,
        ),
      },
      { type: "step", step: step(`${id}-b`, "search", "Searched for", slug.split("-")[0] ?? slug, 900) },
      { type: "step", step: step(`${id}-c`, "read", "Read", "README.md", 700) },
      { type: "step", step: step(`${id}-d`, "command", "Ran", "pnpm typecheck", 1900, { outputId: "typecheck-pass" }) },
      { type: "message", text: "I've looked around and the project builds cleanly. Here's my plan: make the change in a new branch, add a test for it, and open a PR when the checks pass. Say go, or tell me what to change." },
    ],
    terminals: where === "cloud" ? [] : [{ id: `${id}-t`, label: "Tests", outputIds: [] }],
    patchIds: [],
  };
}
