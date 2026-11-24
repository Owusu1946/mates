# Mates for desktop: the stack

**Date:** 23 November 2026. **Goes with:** [desktop-app.md](desktop-app.md) (what the app does) and the UI prototype on the [design canvas](https://claude.ai/artifact/Dt4VRpHUiWPdngxwbHW6YZ).

This document covers how the desktop app is built:
- the processes and packages;
- what renders the timeline, diffs, terminal and website previews;
- how a coding run starts and shows its progress;
- the performance rules;
- how we keep model spend down.

**Source of truth:** T3 Code (github.com/pingdotgg/t3code, MIT). I read about 40 of its files in `apps/desktop`, `apps/web`, `apps/server`, `packages/provider-core` and `native/`. File names below point at those implementations, so whoever builds this can open the original. For most files I read the comments and imports rather than every line. Where this document says "check", the fact is still unconfirmed.

---

## 1. Processes: who does what

```
Electron main process (small)
│   windows, tray, global shortcuts, deep links (mates://), auto-update,
│   Clerk bridge, device link to our API, notifications
│
├── Renderer (React)
│     crew, chat and cards, coding timeline, diff panel, terminal view,
│     preview tabs, settings, summon bar, caption overlay
│        │  MessagePort (direct, no round trip through our cloud)
│        ▼
├── Code host (Electron utilityProcess)
│     opencode serve · node-pty terminals · git (worktrees, checkpoint refs)
│     · port scanner · local SQLite (run log, full output, diffs)
│     · syncs a bounded run record up to the API
│
├── Preview tabs (Electron <webview>, one per site)
│     sandboxed, own session each; driven by the agent over CDP
│
└── Helpers (child processes, each with a deadline)
      screen control (cua-driver), window capture and accessibility,
      Chrome door, egress door

Cloud (unchanged): Hono API on Railway · Trigger worker · Neon · Modal for cloud code runs
```

**Rules taken from T3 Code** (`docs/internals/01_architecture.md`):
- **Nothing native loads while the main process starts.** Anything that can crash or stall (accessibility, window capture, screen control) runs in a child process or worker with a deadline, never as a top-level import in main.
- **The work runs where the workspace is.** A local code run lives in the code host on the desktop. Our cloud never drives the laptop step by step; it receives a bounded record of the run.
- **The renderer talks to the code host directly** over a `MessagePort`. Live output, diffs and terminals never go through our servers, which is most of why the app can feel as fast as T3 Code.

---

## 2. Packages

### The app shell

| Concern | We use | T3 Code uses (version in their repo) | Notes |
|---|---|---|---|
| Shell | **Electron 44** | `electron` 44.10.1 | Same Chromium everywhere: WebRTC for LiveKit calls, noVNC live view, `<webview>` for previews |
| Packaging | **electron-builder** | 26.16.1 | NSIS (Windows x64/arm64), DMG + zip (macOS universal), AppImage/deb/rpm (Linux) |
| Updates | **electron-updater** | 6.8.9 | Stable and nightly channels, as in their `docs/operations/03_release.md` |
| App URL | custom scheme `mates://` serving the built renderer | `ElectronProtocol.ts` | Turn on V8 code caching for the scheme ("custom schemes must opt into V8 caching"), so second launches start faster |
| Auth | **`@clerk/electron`** (beta) | `@clerk/electron` + `@clerk/electron-passkeys` (`DesktopClerk.ts`) | Email, Apple, Google; QR sign-in via Clerk sign-in tokens (see desktop-app.md, Signing in) |
| Secrets | Electron `safeStorage` | `ElectronSafeStorage.ts`, `@napi-rs/keyring` | Clerk session only; no server secrets on the desktop |

### The renderer

| Concern | We use | T3 Code uses | Notes |
|---|---|---|---|
| UI | **React 19 with React Compiler** | `react({ compiler: true })` in `apps/web/vite.config.ts` | Their rules (`docs/internals/10_web-ui.md`): no manual `useMemo`/`useCallback`; in large, long-lived components, plain handlers wrapped in `useStableCallback` only where they leave the component |
| Build | **Vite** | `vite-plus` (their wrapper) | Plain Vite is enough. Copy `worker: { format: "es" }` and `assetsInclude: ["**/*.wasm"]` |
| Styling | **Tailwind v4**, theme tokens as CSS variables | Tailwind v4 | Tokens per theme (Harmattan, Lagoon, Volta, Kente, Graphite) in light and dark; mate colours are fixed |
| Primitives | **Base UI** (`@base-ui/react`) | the same | Accessible menus, dialogs, popovers |
| Routing | **TanStack Router** | `@tanstack/react-router` | Typed routes: `/chat/:id`, `/code/:runId`, `/settings/:page` |
| Server data | **TanStack Query** over our `hc<AppType>` client | Effect atoms (`@effect/atom-react`) | **We don't adopt Effect** (see section 10). We keep their data rules (section 7) |
| Local UI state | **zustand** | `zustand` | Panels, selection, drafts |
| Timeline | **`@legendapp/list`** | `LegendList` in `MessagesTimeline.tsx` | Virtualised; keeps the reading position while history loads |
| Markdown | **remark + rehype**, with T3's stream-block splitter | `markdownStreamBlocks.ts` | Only the last block of a streaming reply re-renders |
| Diffs | **`@pierre/diffs`** with its worker pool | `DiffWorkerPoolProvider.tsx`, `DiffPanel.tsx` | Parse and highlight in web workers |
| Terminal screen | **xterm.js + WebGL addon** first; **libghostty-vt WASM** later | `apps/web/src/terminal/ghostty/` | See section 5 |
| Shared logic | **`packages/client-core`** (new) | `packages/client-runtime` | Run stream, history merge, mentions, theme tokens, `CodeItem` reducers; mobile imports it too |
| Mascot, pages, decks | `packages/mascot`, `packages/pages`, `packages/decks` | none | Already plain React or TypeScript |

### The code host

| Concern | We use | T3 Code uses | Notes |
|---|---|---|---|
| Coder | **opencode in server mode** (`opencode serve`) | provider adapters (`ClaudeAdapterV2.ts`, `CodexAdapterV2.ts`) | One coder, so no adapter layer. **Check** the exact `opencode serve` HTTP API and event stream against opencode's source before building |
| Terminals | **node-pty** | `NodePtyAdapter.ts` | Ship prebuilt binaries for each platform and architecture |
| Git | the `git` CLI | `GitWorkflowService.ts`, `CheckpointService.ts` | Git for Windows is required; detect it and show one clear card if missing |
| Store | **SQLite** (`better-sqlite3` or `node:sqlite`) | SQLite | Run log, full command output, diffs, checkpoints index |
| Shared rules | **`packages/code-core`** (new) | none | `assertPushable`, `guardDiff`, branch naming, the coder prompt, shared with the Trigger worker |

---

## 3. How a coding run starts

Built from T3 Code's `ThreadLaunchService.ts`, `GitWorkflowService.ts`, `sharedCheckoutGuard.ts`, `CheckpointService.ts`, `CheckpointCaptureService.ts`, `WorktreeSetupCard.tsx` and their `t3.json`.

```
chat / mission task / Code screen
   │  POST /v1/code-runs  (place: local, deviceId)
   ▼
API ──device link──▶ code host
   1. checks       base ref exists, branch name free, repo linked and granted
   2. worktree     git worktree add ~/.mates/worktrees/<repo>/<branch> <base>
   3. setup        .mates/project.json scripts with runOnWorktreeCreate
   4. baseline     hidden ref refs/mates/checkpoints/<run>/0
   5. coder        opencode serve in the worktree; per-run key in env only
   6. turn loop    prompt → events → CodeItems → timeline; output → hub
   7. after turn   checkpoint ref; this turn's changed files and diff
   8. checks       run the repo's checks; failing tails go back to the coder
   9. push         API mints a one-repo token for this push → push mates/… branch
  10. PR           opened or updated as mates[bot]; card everywhere
```

**Details worth keeping:**
- **Check early** (`ThreadLaunchService.ts`: "check a new worktree's base ref and branch name before creation for early errors"). A typo in a branch fails in a second, not after setup.
- **Never move a shared checkout.** T3 Code refuses a branch switch in a checkout another active thread is using (`sharedCheckoutGuard.ts`: "switching a shared checkout's ref moves every thread working in it, mid-turn included"). We never touch the user's own checkout at all: every run gets its own worktree.
- **The project file.** T3 Code keeps run scripts in a checked-in `t3.json`:
  ```json
  { "scripts": [
      { "name": "Dev", "command": "vp run dev", "stopOnSettle": true },
      { "name": "Setup Worktree", "command": "node scripts/setup-worktree.ts", "runOnWorktreeCreate": true }
  ] }
  ```
  We copy the shape as `.mates/project.json` with three keys: `setup` (runs when the worktree is created), `dev` (the preview server, stopped when the run settles) and `checks` (overrides detection). If a repo has none, the mate proposes one in the first run and it's committed with that PR.
- **Setup is visible.** A card shows each setup stage with its own timer, and only ticks while setup runs (`WorktreeSetupCard.tsx`).
- **Checkpoints are cheap and safe** (`CheckpointService.ts`):
  - The baseline has a time budget, so a slow workspace starts without one rather than holding the turn.
  - Git processes are capped per thread.
  - A repository with nothing to show records nothing.
  - **Restore** is refused before touching files when the coder can't rewind its own conversation.
- **What a turn changed** lists only files the turn edited, committed or fixed, never files a pull or merge brought in (`docs/user/source-control.md`).
- **Cloud runs** follow the same steps inside Modal: clone instead of worktree, no terminals, read-only output.

---

## 4. How you see progress

### The timeline (`MessagesTimeline.tsx`, `WorkLog.tsx`, `TimelineWorkGroupRows*`, `CommandOutputPanel.tsx`)
- Consecutive tool calls fold into one row: "Ran 3 commands, edited 4 files". Commands and edits are named before reads and searches (`docs/user/activity-log.md`).
- Each call shows input, status, duration and exit code; a file edit shows `+12 −3` and **Open diff**.
- **Command output streams only into expanded rows.** `CommandOutputPanel` "subscribes only while mounted, so collapsed rows and other threads receive nothing", and pins to the bottom while you follow.
- **Tool calls in chat:** show all, hide successful, or hide all; approvals, questions and errors always show.

### The status line, the timers and the minimap
- A status line says what the coder is doing now, with a timer (`ThreadStatusLine.tsx`, `AgentElapsed.tsx`).
- A minimap down the side of long runs (`TimelineMinimap.tsx`) animates only transform and opacity, so scrolling and streaming stay on the GPU.

### The diff panel (`DiffPanel.tsx`)
- Sources: **this turn**, **the branch against its base**, **one commit**, **uncommitted**.
- A file tree with stats, split or unified view, highlighting in workers.
- Comment on a line and it becomes your next message.

### The terminal drawer
Real terminals in the worktree, with several tabs. Select output and **Add to message** (T3 Code's `TerminalContextInlineChip`).

### The website preview
See the next section. For missions this is how Ama watches Leaf & Ladle being built.

### On the phone
A compact card (status, steps, `+120 −8 · 6 files`, approvals, the PR) and a read-only timeline, built from the same `CodeItem`s. The phone never streams raw output.

---

## 5. Showing the website

T3 Code's preview is a **real browser view inside the window** (Electron `<webview>`), not an iframe (`apps/desktop/src/preview/`, `apps/server/src/preview/`). An iframe fails on sites that refuse framing, can't be driven by the agent, and can't be captured reliably.

| Piece | What it does | T3 Code file | For us |
|---|---|---|---|
| Locked-down tab | `sandbox: true` with its own session per tab; popups can't inherit looser settings; notifications and local-font access denied ("pages could impersonate T3 Code"; "it exposes installed-font fingerprints") | `WebviewPreferences.ts`, `BrowserSession.ts` | Copy as is |
| Opens itself | Every command the agent starts carries an environment variable naming its thread, so a server that starts listening is attributed to that thread and opened in a tab. You can stop it, and it never kills the agent or a shell | `PortScanner.ts` | The preview opens the moment `pnpm dev` is up |
| Stays in front | While a turn runs, its preview tab stays focused between tool calls | `PreviewAgentActivity.ts` | Copy |
| Agent drives the same tab | Playwright reaches the tab through the app's own debugger connection (Electron allows one per page, so it's shared). Screencast frames are paced, one waiting per viewer, so a slow viewer never builds a backlog | `CdpRelay.ts` | **The mate tests its own site**: opens it, clicks "Order now", screenshots the checkout, fixes it, on the tab you're watching |
| Point at an element | Click an element and it's attached to your message: tag, HTML, a cropped screenshot and the React component name. React lookups have a time limit so the overlay never hangs | `PickPreload.ts`, `PickTarget.ts`, `PickedElementPayload.ts` | "Make *this* sticky on phones" |
| Draw and capture | Draw on the page; screenshots handle high-DPI and zoom, and refuse to crop an element that's scrolled out of view rather than attach a wrong strip | `Annotation*`, `Manager.ts` (`capturePage`) | Copy |
| Recording | The cursor and input are captured with the page | `RecordingCursor.ts`, `RecordingInput.ts` | Later: a clip of the mate testing checkout, for the PR |
| Away from the desktop | A headless browser on the server that streams frames | `ServerBrowser*.ts`, `PreviewTunnel.ts` | **Cloud runs and the phone.** For Modal: expose the dev port through a tunnel, or run headless Chrome in the sandbox and stream it. **Check** what Modal supports |
| Remote localhost | A fixed SOCKS5 proxy that routes only loopback through a tunnel, never falling back to your own localhost | `LoopbackTunnel.ts`, `docs/internals/05_remote.md` | Only if we preview a cloud run's localhost from the desktop |

We leave out cookie import from other browsers (`BrowserImport/*`) and passkeys inside previews.

**Deploying** a mission's site is a separate step. Where it's hosted is an open decision (desktop-app.md, 4F). A public deploy waits for the user's OK.

---

## 6. The terminal

### Process side (`apps/server/src/terminal/`): copy almost exactly
- **node-pty**, with `TERM` set explicitly because ConPTY ignores node-pty's name option. Windows process trees end without POSIX signals (`NodePtyAdapter.ts`).
- **The shell:** platform default, or a chosen one such as Git Bash on Windows (`docs/user/terminal.md`).
- **History:** 5,000 lines and 8 MB per terminal, kept on disk and restored on reconnect (`docs/user/terminal.md`).
- **Shared sizing:** "attached viewers share one PTY sized to the smallest of them, so a narrow client still sees the whole TUI" (`Manager.ts`).
- **Batching:** "output that follows an emission this closely waits and rides along in one batch, so a PTY that delivers one line per callback (ConPTY) is not sent one frame per line" (`OutputProtocol.ts`).
- **Flow control** windows by bytes, with one acknowledgement per window ("one ACK round trip per chunk stalls sync on high-latency links").
- **Multiplexer keys stripped** from the environment, so tools don't attach to an unrelated tmux pane.

### Screen side
T3 Code renders the official **libghostty-vt** C ABI compiled to WASM:
- `runtime.ts` owns the WASM instance;
- `core.ts` turns terminal state into render snapshots;
- `renderer.ts` draws batched runs on Canvas 2D;
- `surface.ts` owns input, IME, selection, scrolling and links.

"Do not add React state to the render loop." It handles hard cases carefully: wide glyphs, Nerd Font symbols drawn edge to edge, synchronized updates.

**Our plan:**
1. **Phase 3: xterm.js with the WebGL addon**, the renderer VS Code uses, behind the same process protocol. It's proven and a few days of work.
2. **Later, if needed: T3 Code's ghostty renderer**, vendored with its build script (`apps/web/scripts/build-libghostty-wasm.sh`) and the pinned `native/libghostty-vt`. Both are MIT. The process side doesn't change.

---

## 7. Performance rules

### Data and wire (`docs/internals/09_connection-runtime.md`, `16_performance-regressions.md`)
- **Command output isn't a timeline event** (`CommandOutputHub.ts`). Rows get a tail, coalesced appends, then the stored output. A viewer that falls behind gets the tail instead of a backlog. Least-recently-written commands are evicted beyond a limit.
- **Bounded windows.** Opening a run, paging history and catching up after a resume all have byte and row limits. Snapshots never carry raw command output or tool bodies; those load on demand.
- **Resumes send what changed**, not a full snapshot.
- **Subscription and cache are separate.** All mounted views share one live stream, which stops when the last one unmounts. A short cache keeps state and its resume cursor for fast back-navigation.
- **One owner for retries.** Reconnects use jittered, capped backoff in one place; an HTTP refresh failure never tears down a healthy socket.
- **Text deltas are coalesced on the producer side** (`ProviderTextDeltaCoalescer.ts`), and live events are coalesced before they're sent (`ThreadLiveEventCoalescer.ts`, `LiveStreamBudget.ts`).

### Rendering
- **Streamed text reaches only its own row.** `ThreadTimeline.tsx` reads live turn items, so a delta re-renders the timeline row, not the whole chat view.
- **Streaming markdown is split into blocks** (`markdownStreamBlocks.ts`), so earlier blocks don't re-render.
- **Virtualised timeline** (`LegendList`).
- **Diffs in a worker pool.**
- **React Compiler on**, with every file required to compile (they test this in `reactCompilerCoverage.test.ts`).
- **Compositor-only animation** for anything that moves constantly.
- **No spring motion** (our rule), and Reduce motion follows the system.

### Process
- **The main process stays small**; native work runs in helpers with deadlines.
- **V8 code cache** on our custom scheme.

### Budgets, measured in CI
T3 Code runs `report:renders`, `report:server` and the `test:perf:v2-wire` payload tests. Ours:

| Budget | Target |
|---|---|
| Cold start to a usable chat (mid-range Windows laptop) | < 1.5 s |
| Idle memory | < 250 MB |
| First command output on a local run | < 100 ms |
| Open a 1,000-item run | < 200 ms |
| Typing while a run streams | no dropped frames |
| Payload to open a run | bounded; test fails if it grows |

---

## 8. Keeping model spend down

| T3 Code | What it does | Our version |
|---|---|---|
| **Instructions that don't change are sent once** (`runtimeInstructions.ts`) | "Session-invariant" instructions go once per session; features you haven't turned on add nothing ("users who never opt in pay no context"); folder lists are capped | Keep the coder's system prompt and repo rules **byte-identical every turn**, so the provider's prompt cache hits. Nothing that changes (times, status, counts) at the top |
| **Resume, don't replay** | Follow-ups continue the same provider session | One `opencode serve` session per run. Follow-ups and fix rounds resume it, instead of today's `--continue` re-runs in `code-runs.ts` |
| **Compact just before the cache expires** (`IdleCompaction.ts`, `IdleCompactionService.ts`) | When a thread goes idle, wait until shortly before its prompt cache expires (1 hour on plans, 5 minutes on API keys), and only if the context is over about 100K tokens, then compact while the cache is warm. Never compact a compaction; at most one per idle spell | We pay API rates through OpenRouter, so the window is 5 minutes. Use it for long missions and long code runs; skip short ones |
| **Budgeted handoffs, never AI summaries** (`handoffBudget.ts`, `ContextHandoffService.ts`, `docs/user/portable-handoffs.md`) | When context moves, pick history under a budget (16K tokens by default, clamped 1K to 64K): recent turns and the original request first, with references to the rest that a tool can fetch | Mission tasks get the capped notes digest (already 900 characters per note in `missions.ts`) and a tool to fetch a full note or turn, never the whole group history |
| **Pessimistic estimates** | About 4 bytes per token for stored history, 1 for new text; images about 8K tokens each | Budget screenshots the same way; crop to the picked element instead of the full page |
| **Big text becomes a file** (`docs/user/composer.md`, `attachmentPrompt.ts`) | Pastes of 32 KB or more become a file the agent opens if it needs it; the budget never hides that a file exists | The same for pastes and **failing check logs**: the coder gets the tail and a path |
| **Raw output stays out** | Tool bodies stay out of snapshots and the model's replayed context | Fix rounds carry only failing checks' tails (close to `code-runs.ts` today) |
| **Small text on a separate cheap call** (`textGenerationOperations.ts`) | Titles, branch names, commit messages, PR text | We already do this with `summarise()`. Extend it to branch names and commit messages |
| **Caps** | Bounded tasks and parallelism | Per-run OpenRouter key cap (exists); mission board limits of 14 tasks, 3 at once, 2 revisions (exist in `workboard.ts`) |

**Check:** whether opencode passes Anthropic `cache_control` through OpenRouter for our coding model. If not, caching depends on the provider's automatic caching, and the stable-prefix rule matters even more.

---

## 9. What we vendor or adapt from T3 Code

All MIT. Keep their notice in `apps/desktop/third_party/t3-code/` and list it in About.

| From | Why |
|---|---|
| `apps/desktop/src/preview/CdpRelay.ts` (frame pacing, shared debugger) | Agent-driven preview without memory build-up |
| `apps/desktop/src/preview/PickPreload.ts` and friends | The element picker |
| `apps/desktop/src/preview/WebviewPreferences.ts`, `BrowserSession.ts` (settings) | Safe defaults for untrusted pages |
| `apps/server/src/preview/PortScanner.ts` (approach) | Auto-opening the dev server |
| `apps/server/src/terminal/OutputProtocol.ts` (batching and windows) | Terminal transport |
| `apps/web/src/components/chat/markdownStreamBlocks.ts` | Streaming markdown |
| `apps/web/src/terminal/ghostty/` + build script (later) | The terminal renderer, if xterm.js falls short |
| Their `t3.json` script format | Our `.mates/project.json` |

---

## 10. What we deliberately don't copy

| T3 Code has | Why not |
|---|---|
| **Effect** and the event-sourced orchestrator (`Orchestrator.ts`, `EventSink.ts`, `EffectWorker.ts`) | Our codebase isn't Effect, and adopting it costs months. The code host keeps a simple append-only run log in SQLite; the cloud keeps Postgres rows as today |
| Many providers, ACP, provider instances | The mate is the only coder |
| T3 Connect relay, DPoP, peer links, guest links | Our cloud is already the hub; the device link uses short tickets over Clerk auth |
| `vite-plus`, `gt-i18n`, their lint plugins | Plain Vite; i18n later |
| Browser cookie import, passkeys in previews | Not needed for building sites |
| Multi-repo projects, submodule handling | One repository per run to start |
| Mobile device and simulator panel (`docs/user/devices.md`) | Later, for app-building missions |

---

## 11. Repository layout

```
apps/
  desktop/                 Electron app
    src/main/              windows, tray, shortcuts, protocol, updates, clerk, device link
    src/renderer/          React app (routes, screens, components)
    src/code-host/         utilityProcess: opencode, pty, git, checkpoints, ports, sqlite, sync
    src/preview/           webview tabs, CDP relay, picker, capture (adapted from T3 Code)
    src/helpers/           screen control, capture, Chrome door, egress door
    third_party/t3-code/   LICENSE and notes for vendored files
packages/
  client-core/             shared with mobile: api client, run stream, CodeItem reducers, theme tokens
  code-core/               shared with the worker: push rules, branch names, coder prompt
  api-contract/            + CodeItem, CodeRepo, DeviceView, link frames
  mascot/ pages/ decks/    unchanged
apps/api/src/
  code-runs.ts             + place, items, push-token, key routes
  desktop/local.ts         DesktopProvider "local" (screen control)
  devices.ts               devices, grants, link tickets, desktop sign-in
```

---

## 12. Things to check before building

1. The exact `opencode serve` HTTP API: sessions, sending a message mid-run, abort, permission events.
2. Whether opencode passes prompt-cache hints through OpenRouter for our coding model.
3. Modal: tunnelling a sandbox port for cloud previews, or headless Chrome inside the sandbox.
4. `@clerk/electron` (beta): the ticket strategy for QR sign-in, and OAuth deep links on all three systems.
5. node-pty prebuilds for Windows arm64 and Linux arm64.
6. Hosting for mission websites, and whether the GitHub App may create repositories (desktop-app.md, 4F).
