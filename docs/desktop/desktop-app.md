# Mates for desktop: Windows, macOS and Linux

**Date:** 23 November 2026. **Stack and implementation:** [stack.md](stack.md). **Status:** draft; the coding environment (section 4D) is decided, the rest awaits Ken (section 12).

**Built on:**
- our own codebase: the API contract, `computers.ts` and the `Desktop` interface, the mobile app, [computer-use.md](../plans/computer-use.md) and [master-plan.md](../plans/master-plan.md) (item D9, "Desktop link");
- **T3 Code** (github.com/pingdotgg/t3code, MIT): how to build a fast, well-run Electron app that works on all three systems;
- **OpenMausBot** (github.com/milind-soni/OpenMausBot, Apache-2.0): a "team of AI bots in a chat app", the closest product to ours, and how its desktop app lends the person's own computer to bots in the cloud.

---

## 1. The short version

The desktop app has three jobs:

1. **The best place to work with your crew.** Everything the phone does, on a big screen, keyboard first: chat beside the live computer, a page, a deck or a pull request, all at once.
2. **Mates anywhere on your computer.** One shortcut from any app opens a small bar to ask a mate. Hold a key and talk. Send a window, a file or a selection to a mate in one move.
3. **Your computer becomes a place your mates can work, when you let them.** Your internet connection, your Chrome with your sign-ins, the folders you choose, and your screen and apps. Each is off until you turn it on, shown while in use, and paused by moving your mouse.
4. **A real coding environment.** Watch a mate code the way T3 Code shows it: every tool call, command, terminal and diff, live. Code runs happen on your own machine in a worktree of your checkout, or in the cloud when your computer is off. Both places show the same view and end in a `mates[bot]` pull request. The coder is the mate, on your Mates plan: there's nothing else to install or sign in to.

The third job is what nobody in our market does well. Dots, Grok Bot and Muse keep the agent in their cloud. OpenMausBot proved the shape works, but it's local-first and for developers. **We keep our cloud as the home of your mates** (memory, chats, routines, watches keep working when the laptop is shut) **and the desktop lends it a body.**

It also fixes real problems with the cloud computer today:
- **Sites that block data centres** (Google sign-in, Instagram, banks, many Ghanaian portals) load through *your* connection.
- **Passkeys and sign-ins** already live in *your* Chrome.
- **It costs us no compute.** A mate on your own computer uses no E2B minutes, only model tokens.

---

## 2. What we take from each source

| From | What we take | What we leave |
|---|---|---|
| **T3 Code** | Electron with a tiny main process; native helpers in child processes with deadlines, never loaded at startup. `@clerk/electron` with tokens kept encrypted on the device. Signed builds and auto-update for all three systems with stable and nightly channels. One shared client runtime for web, desktop and mobile. Command palette, `F6` between areas, keyboard-first focus rules. **SnapShots** (capture a window plus its accessibility text). Prompt links. WebSocket tickets minted over HTTP, so long-lived tokens never go in a socket URL. Performance budgets in CI. **The whole coding environment (section 4D):**
- the timeline with folded tool calls;
- live command output that bypasses the event log (`CommandOutputHub`);
- the diff panel (`@pierre/diffs` in workers);
- terminals (`node-pty` + libghostty WASM);
- checkpoints as hidden Git refs;
- worktrees per run;
- permission modes;
- the virtualised timeline (`@legendapp/list`). | A local server as the home of everything: for our life features the cloud stays home, and only code runs live on the desktop. **Bring-your-own coders** (Claude Code, Codex, Cursor…): Mates isn't a harness for other agents; the mate is the coder. |
| **OpenMausBot** | **"Your Mac works for your Clouds"**: one device link carrying streams, lent internet (with its egress safety check), lent Chrome over DevTools, lent folders with protected paths, lent screen through an allow-listed tool set, a screen lease so only one driver at a time, a tray indicator with **Pause** and **See activity**, and "only your own conversations may use your computer". Hold-to-talk from any app. Approval and question cards. Calm design rules. | Local-first storage, bring-your-own keys, and its "no new asks" rule: we keep our grants model (master plan A1). Its look and signature parts (rule 7 in its own DESIGN.md says the same). |
| **Mates (ours)** | The cloud is home. `hc<AppType>` contract. The `Desktop` interface and `DesktopProvider` seam in `computers.ts`: **your computer becomes a third provider next to `daytona` and `e2b`**. Run events over SSE. The mascot package (plain React, so it works in a desktop window). Pages and decks renderers. Gates, `isSecretField`, `outbound-check.ts`, the "user always has the mouse" rule. | Nothing; this is the base. |

**Licences:** both are permissive. Where we adapt code (not just ideas), we keep their copyright notices in `apps/desktop/third_party/` and list them in the app's About screen. Apache-2.0 also needs a NOTICE file.

---

## 3. Principles

The master plan's seven principles still hold. These are added for the desktop:

1. **Your computer is yours.** Every kind of lending is off by default, granted one kind at a time, visible while used, and stopped by one click on **Pause** or one move of your mouse.
2. **Show the work, on your own screen too.** When a mate drives your computer, its cursor moves at a pace you can follow, and a caption on screen says what it's doing ("Kofi · filling the visa form"). The mate's cursor wears its mascot.
3. **Commands run on your computer only for code, in repositories you granted.** Elsewhere, mates may look, click and type where you allowed, read folders you lent, and browse through your connection. Shell commands for everything else stay on the cloud computer. Local code runs stay inside worktrees of a repository you linked (section 4D).
4. **Fast is a feature.** Cold start to a usable chat in under 1.5 s on a mid-range Windows laptop. Typing never drops a frame. Idle memory under 250 MB. Measured in CI, as T3 Code does.
5. **One product.** The same mates, chats, colours (the mobile theme tokens and `MATE_PALETTE`, nothing invented) and words as the phone. No spring or bouncy motion.
6. **Fail closed.** A missing OS permission, an unsupported desktop session (Linux Wayland screen control), or a failed health check means "not available, here's why", never a half-working fallback.

---

## 4. What it does

### A. The crew, on a big screen

| Feature | What it does |
|---|---|
| **Three-part window** | Sidebar (mates as contacts, groups, friends, missions), chat, and a right panel for whatever the chat is about: the live computer, a page, a deck, a code PR with its diff, a mission board, a watch's history. Drag the panel into its own window for a second monitor. |
| **Every card the phone has** | Plan, watch, schedule, code, deck, page, comparison, rides, browser, computer, approvals, friend requests, meeting prep. Same data, laid out for width. |
| **Keyboard first** | `Ctrl/⌘K` command palette for everything (new chat, ask a mate, start a call, open a page). `Ctrl/⌘1–9` jumps to mates. `F6` moves between sidebar, chat, composer and panel. Every shortcut can be remapped. |
| **Real takeover of the cloud computer** | The phone's touch takeover is clumsy; the desktop is the best place for it. Real mouse and keyboard, clipboard both ways, drag a file from your desktop into the mates' computer. |
| **Calls** | Voice calls with up to four mates (LiveKit web SDK, same as Chrome). New: **share your screen with a mate on a call**: "look at this spreadsheet with me". Meetings with a mate who speaks, from the desktop. |
| **Notifications with actions** | Native notifications that you can answer: **Allow / Not now** on an approval, **Open PR**, **Reply**. The master plan's "return trip" (B3) lands where you're working. |
| **Offline reading** | Recent chats, pages and decks open without a connection; messages you write queue and send when you're back. |
| **Pages and decks** | Open a page full size, export a deck to PowerPoint into a folder you pick, drop a deck onto a call to present it. |

### B. Mates anywhere on your computer

| Feature | What it does |
|---|---|
| **Summon bar** | `Alt+Space` (`⌥Space` on Mac; changeable) from any app opens a small floating bar. Type, `@` a mate, press Enter. The reply streams in the bar; **Open in Mates** continues in the full app. It never steals focus from the app you were in for longer than you're typing. |
| **Hold to talk** | Hold a key, speak, let go. Works on all three systems through our own `/v1/transcribe` (Deepgram), not only on macOS as OpenMausBot's does. Twi through Khaya once C4 ships. |
| **SnapShot** | One shortcut captures the window you're in, with its app name, title and accessibility text, and attaches it to the summon bar or a chat: "what does this error mean?", "reply to this email for me". Off by default. (T3 Code's design: Windows needs no permission; macOS asks for Screen Recording.) |
| **Send to Mates** | Drag anything onto the tray icon or the window. "Send to Mates" in the right-click menu of Explorer, Finder (a macOS Service) and Linux file managers. Copy something, then `Ctrl/⌘Shift+V` in the summon bar pastes it as context. |
| **Prompt and chat links** | `mates://` links (the scheme the phone already uses) open a chat or a draft prompt. A link never sends anything by itself; you press Send. |
| **Tray / menu bar** | Shows who's working ("Kofi is using this PC"), unread messages, **Pause**, **See activity**, and **Quit**. While lending is on, the app starts with the computer, out of sight. |

### C. Your computer as a place for your mates

This is master plan D9, rebuilt on what OpenMausBot learned. Four kinds of lending, each its own switch in **Settings → This computer**, each shown in the tray while in use:

| Lent | What mates can do | Why it matters | How |
|---|---|---|---|
| **Your internet** | The cloud computer's Chrome loads chosen sites through your connection | Sites that block data centres (Google sign-in, Instagram, YouTube, bank and government portals) work. Ghana-local sites see a Ghanaian address | Device link streams; the desktop connects only to public web ports, never your network, your router or cloud metadata addresses (OpenMausBot's `device-egress` rules) |
| **Your Chrome** | A mate works inside your real, signed-in Chrome | No sign-in, no passkey problem, no CAPTCHA wall from a new browser | Chrome DevTools over the device link. Chrome itself asks you to **Allow**. The connection closes after 10 idle minutes so Chrome stops showing "controlled" |
| **Folders** | Read (and, if you choose, edit) the folders you pick | "Find my 2025 bank statements and make a budget", "sort my Downloads" | Lent folder list with protected paths that are never lent: `.ssh`, keychains, browser profiles, shell start-up files, `AppData`, `Library`, git settings |
| **Screen and apps** | See and operate your desktop apps | Desktop-only software: Tally, Excel macros, a company VPN app, WhatsApp Desktop | `@trycua/cua-driver` in a child process, behind an allow-list of screen tools (no paths, commands or ports). Implements our `Desktop` interface, so the same computer agent drives it |

**How a mate decides where to work:** each computer goal gets a place: **cloud computer** (default) or **this computer**. The mate suggests "this computer" only when a grant exists and the task needs it (a site that blocked the cloud, a desktop app, a local file). If the computer is asleep or the app is closed, the chat says so in one line with **Turn on** or **Use the cloud computer instead**; it never silently switches.

**The rules for your computer (code, not prompts):**
- **Only your own conversations may use it.** Not a friend's mate's request (E3), not a group chat someone else wrote in, not a watch or routine started by outside content, unless you allowed that routine by name.
- **One driver at a time.** A screen lease, as on the cloud computer. **You always have the mouse:** any real mouse or keyboard input pauses the mate at once, and it re-checks the screen before carrying on (the `resumeBrowser` pattern).
- **The gates from [computer-use.md](../plans/computer-use.md) apply unchanged:** money, secrets, calls, new people, commitments, deleting and installing always pause. `isSecretField` fields are never typed by a mate.
- **Visible always:** caption window, mascot cursor, tray state, and an activity log on the computer and on the server that lists refused requests too.
- **Pause** stops every kind of lending at once and lasts across restarts.
- **Linux Wayland screen control stays off** until it's proven safe (OpenMausBot hit real input-safety problems on GNOME Wayland, their issue #345). Linux X11 is opt-in. Internet, Chrome and folders work on every Linux desktop.

### D. The coding environment

**Decided (Ken, 23 November 2026): in the plan.** Mates gets a real coding environment on the desktop, as good as T3 Code: you can watch every tool call, command and diff as it happens, steer it, and ship a PR in one click. Code runs can happen **on your own machine**, in a worktree of the checkout you already have, with your own dev setup. The cloud (Modal) still runs code when your computer is off, and **both places show the same view**.

**Also decided (23 November): the mate is the coder, on the user's Mates plan.** No bring-your-own Claude Code or Codex. Mates isn't a harness tool; coding is one thing your crew does, like decks and pages. One coder means:
- one bill;
- no third-party installs or sign-ins;
- no dependence on Anthropic's or OpenAI's rules for subscription use;
- a fixed set of abilities the view can rely on.

#### What's wrong today
`code-runs.ts` drives opencode inside Modal and turns its JSON events into one-line strings ("Editing src/app.ts", "Running pnpm test") through `readCoderEvent` in `code-plan.ts`. Those lines are capped on the `code_runs` row and grouped back into four steps by `code-steps.ts` on the phone. The tool inputs, command output, exit codes and diffs are thrown away. You see that something happened, not what. You can't steer a run, open a terminal or review a change before the PR.

#### What you see while a mate codes
Taken from T3 Code's timeline, diff panel and terminal drawer (`apps/web/src/components/chat/ThreadTimeline.tsx`, `WorkLog.tsx`, `TimelineWorkGroupRows.tsx`, `CommandOutputPanel.tsx`, `DiffPanel.tsx`, `ThreadTerminalDrawer.tsx`), in our own look:

| Part | What it does |
|---|---|
| **Timeline** | Your messages, the mate's replies streaming in, and its work between them. Consecutive tool calls fold into one summary row: **"Ran 3 commands, edited 4 files, read 6"**. Commands and edits rank above reads and searches. Open it for every call. |
| **Tool calls** | Each call shows its kind, input, status, duration and exit code. **Commands** show their output live (the latest part for long output) with ANSI colours. **File edits** show `+12 −3` and **Open diff**. **Searches and reads** stay one line. **MCP calls**, **subagents** and **web fetches** have their own rows. A failed call says why in one line. |
| **Approvals and questions** | Inline cards in the timeline (**Allow / Allow for this run / Deny**, or the question's choices), also pushed to the phone. Every request can be declined. |
| **Plan cards** | When the coder proposes a plan, it shows as a card you can accept, edit or reject before any edits happen. |
| **Diff panel** | The run's changed files as a tree, each with its diff, split or unified, highlighted. Three sources: **this turn**, **the whole branch against its base**, or **one commit**. Comment on a line and the comment goes to the coder as your next message. |
| **Terminal drawer** | Real terminals in the run's worktree (local runs), several tabs, 5,000 lines of scrollback. Select output and **Add to message** to give it to the coder. On cloud runs, a read-only view of the sandbox's output. |
| **Checkpoints** | Each turn saves the workspace as a hidden Git ref. **Restore to before this turn** puts the files back. If the coder can't rewind its own conversation, restore is refused before any file is touched (T3 Code's rule). |
| **Branch bar** | Repo, branch, base, place (this computer or cloud), which mate is coding, permission mode, and **Commit & push** / **Open pull request** / **Update pull request**. After that it shows the PR's checks and review state. |
| **Steer and stop** | Type while it works: the message goes in at the coder's next safe point. **Stop** waits for the coder to end the turn, then offers **Force stop**. |
| **Hide the noise** | **Tool calls in chat**: show all, hide successful ones, or hide all. Approvals, questions and errors always show. |

**On the phone** the same run is a compact card: status line, steps, `+120 −8 · 6 files`, approvals, the PR, and **Open on your computer**. A tap opens a read-only timeline. The phone never streams raw command output.

#### Two places, one view
| | **This computer** | **Cloud** (today's Modal run) |
|---|---|---|
| When | You've linked the repo on this computer and it's on | Your computer is off, or you chose cloud |
| Checkout | A Git worktree of your clone under the app's data folder. Your own working copy is never touched | A fresh shallow clone in Modal |
| Coder | The mate (opencode on our coding model, with a capped per-run key, as today) | The same |
| Terminals | Yes, real ones | Read-only output |
| Cost to us | Model tokens only, no sandbox minutes | Sandbox minutes and model tokens, as today |
| Speed | No boot, no clone, warm dependencies | About a minute to boot and clone |

**The PR flow doesn't change.** Commits are by `mates[bot]`. The API mints a one-repo, one-hour installation token **for each push** and passes it to the desktop in memory, never to disk. `assertPushable` (never the default branch) and `guardDiff` move into a shared package so both places run the same checks. The bot still never merges.

#### The coder: the mate, on its Mates plan
- **The engine stays opencode**, hidden behind the mate as it is today. On the desktop it runs in **server mode** (`opencode serve` with its HTTP API and event stream; check the exact API against opencode's source when building) instead of `opencode run`. Server mode lets us send a message mid-run (steer), abort cleanly, answer permission requests, and resume a session for follow-ups. The cloud run moves to the same mode, so both places speak one protocol.
- **The model is ours** (`CODE_MODEL` in `models.ts`, through OpenRouter). Each run gets a **capped per-run key** from `openrouter-keys.ts`, exactly as cloud runs do. The key lives only in the code host's memory and is deleted when the run settles.
- **Usage counts on the user's Mates plan** through the existing usage meter (`usage/`). Local runs record model spend but no `SANDBOX_MINUTE`s.
- **The coder speaks as the mate.** The timeline shows the mate's name, colour and mascot, not "opencode". A routine or watch can hand a coding task to the mate like any other task.
- **Why not users' own Claude Code or Codex** (checked 23 November 2026, kept for the record):
  - Anthropic allows a product to run the user's own unmodified Claude Code only if the user signs in themselves, the product never stores the token, and the company signs Anthropic's Commercial Terms.
  - OpenAI says Codex app-server sign-in "has never been permitted for commercial or hosted services"; commercial apps must join **Sign in with ChatGPT** (waitlist).
  - Both rules have changed several times in 2026. That's work and risk for a feature that pulls people out of Mates.

#### Permission modes
Enforced by opencode's own permission settings (`edit` and `bash` set to `allow` or `ask`), never by us auto-answering (T3 Code: "never emulate missing permission modes"):

| Mode | Behaviour |
|---|---|
| **Supervised** | Asks before commands and file changes |
| **Auto-accept edits** | Edits go ahead; commands ask |
| **Full access** | No asks inside the worktree |

**Defaults:** a run *you* start from the Code screen uses your default (Full access to start, as in T3 Code; you're watching). A run a **mate starts from chat, a routine or a watch** uses **Supervised** unless that repository's grant says otherwise. Its approvals go to your phone and desktop.

#### The grant: one per repository
"Let mates code in **owner/repo** on this computer" is the only place commands run on your machine, so it's its own switch, per repository, in **Settings → This computer → Code**:
- You link a repository by choosing its folder. The app checks the remote matches a repo the GitHub App can reach.
- Runs work in **worktrees under the app's data folder**, never in your checkout. Your uncommitted changes are never touched.
- The coder's environment is clean: no ambient tokens we didn't put there. Our secrets go in memory only.
- **Pause** in the tray stops local code runs too.
- Only your own conversations may start one, the same rule as the rest of "your computer".

#### Where runs start
- **From any chat:** "ship dark mode in muse-clone". The mate picks **this computer** when the repo is linked and the app is online, otherwise the cloud, and says which. You can say "do it in the cloud" or "on my laptop".
- **From the Code screen:** a new sidebar section, **Code**, lists your linked repositories and their runs, like T3 Code's projects and threads. Pick a repo, a mate and a mode, and talk to your coding mate directly. A run is a thread you can come back to.
- **Follow-ups** ("also add a toggle") continue the same run and branch, as today.

#### How it's built
- **A code host in the desktop.** An Electron `utilityProcess`, not the main process, owns:
  - the coder (opencode in server mode);
  - terminals (`node-pty`);
  - Git (worktrees, checkpoint refs under `refs/mates/checkpoints/…`);
  - a local SQLite store for full output and diffs.

  It's T3 Code's rule that **execution stays where the workspace is**. Our cloud doesn't drive your machine step by step: the run lives on the desktop and reports up.
- **The renderer talks to the code host directly** (a `MessagePort`), so live output, diffs and terminals never round-trip through our cloud. That's what makes it as fast as T3 Code.
- **The code host syncs a bounded record up to the API:** the run's status, its items without raw output, diff stats, approvals and the PR. Then the phone, Slack and the mate's chat stay in step, and an approval from the phone reaches the run through the device link.
- **One item model for both places.** A new `CodeItem` type in `packages/api-contract`: `message | command | file_change | read | search | mcp | subagent | web | approval | question | plan | checkpoint | error`, each with status, title, input, duration, exit code and diff stat. Cloud runs produce the same items: `readCoderEvent` becomes a mapper from opencode's events to `CodeItem`s instead of one-line strings.
- **Output is not an event.** T3 Code's `CommandOutputHub` rule: live command output streams separately from the timeline, only to clients that have that command open, coalesced and capped. Only a tail (16 KB) is kept on the item. Full output stays on the desktop for local runs and is dropped after cloud runs.

#### Speed (T3 Code's bar, measured in CI)
- **The timeline is virtualised** (`@legendapp/list`, as T3 Code uses), so a run with thousands of items opens in under 200 ms and scrolls at 60 fps.
- **Diffs are parsed and highlighted in a worker pool** (`@pierre/diffs`, as T3 Code's `DiffWorkerPoolProvider` does), never on the UI thread.
- **Terminals render with libghostty's VT parser compiled to WASM** (T3 Code's `native/libghostty-vt`) or xterm.js. Choose on a benchmark in phase 3; both are MIT.
- **Streaming text is coalesced** (T3 Code's `ProviderTextDeltaCoalescer`), so a fast coder doesn't re-render on every token.
- **React Compiler on**, with T3 Code's rules for large long-lived components (plain handlers, `useStableCallback` only where they leave the component).
- **Budgets:**
  - typing never drops a frame while a run streams;
  - the first byte of command output shows within 100 ms on a local run;
  - a cold open of a 1,000-item run takes under 200 ms;
  - the wire payload per run open stays bounded.

### E. Themes

Shaped like T3 Code's **Settings → Appearance** (`ThemeSettings.tsx`, `ThemeWireframe.tsx`):
- **Appearance mode.** System, Light or Dark. `Ctrl+Alt+Shift+A` cycles it.
- **Themes come in light and dark pairs**, each shown as a small preview of our own window. Each can be used for both modes, light only, or dark only. The previews are drawn from tokens, never screenshots.
- **Your own themes.** Add theme, edit, duplicate, and export or import a theme file (JSON).

**Our look gets a name: Harmattan.** It's the current palette:
- light: the app's warm cream (`#F8F7F4`), the landing's neutrals and amber;
- dark: the app's olive charcoal (`#151714` / `#242821` / `#3B4136`);
- the mascot's amber (`#d27e41`) as the one accent in both.

Four more ship with it, each light and dark:

| Theme | Feel |
|---|---|
| **Lagoon** | Teal from `MATE_PALETTE`; calm and cool |
| **Volta** | Lake blue; crisp and focused |
| **Kente** | Gold and green; bold, for people who want colour |
| **Graphite** | No colour but the mates; highest contrast |

**Ask a mate to restyle the app** (from OpenMausBot's themes): "make Mates feel like Labadi at sunset".
- The mate writes a theme: colours, font, corners, chat background, and optional CSS. The window switches at once.
- The card in chat has **Keep** and **Undo**, and the last 30 looks are kept.
- The theme editor shows what changed and checks contrast as you edit.

**Rules:**
- Themes change tokens only. **Mates keep their own colours in every theme** (Kofi is always amber).
- Every token must pass 4.5:1 on its surfaces.
- No spring motion, and **Reduce motion** follows the system.
- Themes are per device, like T3 Code; the phone keeps its own.

### F. Missions build the website now

**Missions already exist** and stay as they are. Ask the lead mate for something big ("start a waakye delivery business", "launch my product", "plan the wedding"):
1. It calls `cooper_assemble_team` (`missions.ts`): a team name, a goal that says what "done" means, and one to six members, each with a role and a job (for example "the CFO: owns pricing, costs and the financial model"). Mates you already have are reused by role; missing ones are created.
2. That makes a **group** led by the lead mate, posts the **team card** (**Open <team>**), and starts the mission.
3. The mission runs in **rounds** (`workboard.ts`). The lead mate works as chief of staff:
   - it breaks the goal into tasks with a "done when";
   - hands each to the mate whose role fits, up to three at once;
   - reviews what comes back (accept, revise, reassign);
   - checks in with you when it needs a decision;
   - finishes with a summary.
4. The group shows the **mission banner** ("Esi and Nana working · 3/9"), which opens the board. Each task shows owner, status, step and timer. **Notes**, **Pause** and **Stop** sit on the board.
5. The team's work lives in **mission notes**, versioned and authored.

**What the desktop adds: the team can build the website.** A mission task like "build the ordering site" becomes a **code run** owned by the builder mate:
- on **this computer** when the repository is linked here, with the full coding view from section 4D: timeline, diffs, terminal and live preview;
- otherwise in the cloud, as today.

The task's row on the board shows the run's status, and the lead mate reviews the result like any other task. The PR flow and `mates[bot]` stay as they are. On the desktop the board also gets room: it sits as a right panel beside the group chat, instead of the phone's bottom sheet.

**Open questions for the website task:**
- **New repository.** A brand-new business has no repo yet. Either the mate creates one through the GitHub App (needs permission to create repositories, which isn't granted today), or the user picks or creates one when the task starts.
- **Hosting and domain.** Where the site deploys (Vercel? Cloudflare Pages?), and whether buying a domain is a payment gate (it is: money always asks).

**Safety:** nothing changes. Missions run while you aren't watching, so `permissions.ts` already asks first for sends, shares, deletes and spending. Going public (posts, emails to new people, deploys to a public domain) waits for your OK.

---

## 5. One crew everywhere: how it fits the product

- **One account, one crew.** Desktop, phone, Slack and shared pages are windows onto the same cloud. A message sent on the phone appears on the desktop as it streams (the existing run events).
- **Pick up where you left off.** Open the desktop and it offers the chat you just had on the phone. A mate that needs a big screen ("review these 40 rows") can say **Continue on your computer**, which opens the chat there.
- **Notify where you are.** If the desktop app is active, notifications go there and the phone stays quiet; when you've been away from the computer for a few minutes, the phone gets them again (a presence check in `delivery.ts`).
- **The phone approves what the computer does.** A mate working on your PC while you're out sends the approval to your phone. Later: watch your PC's screen from the phone through the same link.
- **Devices in Settings** on every client: phones and computers, what each one lends, last seen, **Remove**.
- **Mates for other AI apps (MCP).** A remote MCP server on our API with OAuth, so Claude Desktop, ChatGPT or Cursor can ask your mates things and hand them work. Both reference apps ship this; ours lives on the API, so it works without the desktop app too. Read-only and "send a message" first; no approvals, no deletes.
- **The download page** on agents.askorin.app/download picks the right build for your system, with Windows (`winget`), macOS (Homebrew cask) and Linux packages listed.

---

## 6. Architecture

```
┌──────────────────── apps/desktop (Electron) ───────────────────┐
│ Renderer: React + Vite + Tailwind                              │
│   chat, cards, panels, summon bar, caption overlay             │
│   └─ packages/client-core (shared with mobile)                 │
│        hc<AppType>, run stream, history merge, mentions…       │
│ Main process (small; no native modules at startup)             │
│   windows, tray, shortcuts, deep links, updates, notifications │
│   Clerk bridge (tokens in the OS keychain)                     │
│   Device link ──────────────────────────────┐                  │
│ Helpers (child processes, with deadlines)   │                  │
│   cua-driver (screen), capture + a11y,      │                  │
│   Chrome door, egress door, folder reader   │                  │
│ Code host (utilityProcess)  ◀─MessagePort─▶ renderer           │
│   the mate's coder (opencode serve);        │                  │
│   node-pty terminals;                       │                  │
│   git worktrees + checkpoint refs; SQLite   │                  │
│   (syncs a bounded run record up) ──────────┤                  │
└─────────────────────────────────────────────┼──────────────────┘
          HTTPS (same API as the phone)       │ one WebSocket, many streams
                                              ▼
┌──────────────────── apps/api (Hono, Railway) ──────────────────┐
│ /v1/* as today       /v1/devices/link (ticket → WebSocket)     │
│ desktop/local.ts: DesktopProvider "local" over the link        │
│ computers.ts: provider = daytona | e2b | local                 │
│ E2B Chrome ──SOCKS──▶ API ──link──▶ your connection ("internet") │
└────────────────────────────────────────────────────────────────┘
```

### Why Electron, not Tauri
The master plan (D9) said Tauri. **I recommend Electron:**
- **Both reference apps chose it**, and both ship to all three systems today.
- **The same Chromium everywhere.** LiveKit calls, the noVNC live view and screen sharing behave exactly as in Chrome. Tauri uses each system's own web view; WebKitGTK on Linux is weak at WebRTC.
- **Node in the main process** runs `@trycua/cua-driver`, Chrome DevTools, `@clerk/electron` (email, Apple, Google) and `electron-updater` without writing Rust.
- **The cost** is a bigger download (about 100 MB) and more memory. T3 Code shows it can still be fast; principle 4 holds us to a budget.

### Why a new React DOM renderer, not Expo web
The mobile app depends on native modules (LiveKit React Native, glass effects, the share extension) and is laid out for one column and touch. A desktop renderer built for width and keyboard will be better, and **the logic is shared, not the screens**:
- New **`packages/client-core`** takes the pure parts of `apps/mobile/src/chat` (`run-stream.ts`, `history-merge.ts`, `mention-choices.ts`, `plan-rows.ts`, `code-steps.ts`, `links.ts`, `chat-model.ts`) plus the API client factory. Mobile imports it from there; its tests move with it.
- **`packages/mascot`**, **`packages/pages`** and **`packages/decks`** are already plain React or TypeScript and work as they are.
- The theme tokens move into `packages/client-core/theme` so both apps read one source.

### Server changes
- **Devices:** the `devices` table (today for push) gains `kind` (`phone|desktop`), `platform`, `appVersion`, `capabilities`, `grants` (which kinds of lending are on) and `lastSeenAt`. Routes: `GET /v1/devices`, `PATCH /v1/devices/:id`, `DELETE /v1/devices/:id`.
- **Device link:** `POST /v1/devices/link/ticket` mints a 60-second ticket over normal Clerk auth; the WebSocket at `/v1/devices/link` accepts only the ticket. Frames follow OpenMausBot's protocol idea: JSON control frames (`open`, `opened`, `refused`, `credit`, `end`, `ping`) and binary stream frames with flow control, plus a request/response channel for screen and folder calls.
- **Where the link lives:** the Trigger worker runs the computer agent but can't hold sockets, so it calls the API, which holds them. That works while the API runs as one instance. **When we scale the API past one instance**, the link moves to a Cloudflare Durable Object per user (OpenMausBot runs its control plane on Cloudflare the same way).
- **`apps/api/src/desktop/local.ts`:** a `DesktopProvider` named `local`. `screenshot`, `elements`, `click`, `type` and the rest go over the link; `exec` refuses in v1; `caption` shows the overlay window on your screen. `liveUrl` isn't needed on the desktop itself; on the phone it's the later "watch your PC" feature.
- **Computer goals** gain `place` (`cloud|local`). The computer agent and its tests don't change: they only know `Desktop`.
- **Your internet for the cloud computer:** E2B's Chrome starts with a SOCKS proxy that sends only the chosen sites through the API to the link. If the computer isn't lending, those sites load from E2B as today and the mate is told why a site may refuse.
- **Code runs** (section 4D):
  - `code_runs` gains `place` (`cloud|local`), `deviceId`, `mateId`, `permissionMode` and `threadTitle`.
  - A new `code_run_items` table holds `runId`, `seq`, `kind`, `status`, `title`, `input` (bounded jsonb), `exitCode`, `durationMs`, `diffStat` and `outputTail` (≤ 16 KB). It replaces the capped `activity` lines.
  - A new `code_repos` table holds per-device repository links and their grant: `deviceId`, `repo`, `defaultMode`, `enabled`. The local path stays on the device.
  - `POST /v1/code-runs/:id/key` (local runs only) mints the run's capped OpenRouter key.
  - Routes:
    - `GET /v1/code-runs/:id/items` (paged) and `GET /v1/code-runs/:id/stream` (SSE with a sequence cursor, the same pattern as `/v1/runs/:id/events`);
    - `POST /v1/code-runs/:id/messages` (steer or follow up);
    - `POST /v1/code-runs/:id/approvals/:itemId`;
    - `POST /v1/code-runs/:id/push-token`, local runs only: mints the one-repo installation token for one push.
  - `readCoderEvent` in `code-plan.ts` maps opencode events to `CodeItem`s.
  - `executeCodeRun` writes items through the same buffered writer that `activityLog` uses today (every 1.5 s).
  - `assertPushable`, `guardDiff`, branch naming and the coder prompt move to a shared package, `packages/code-core`, so the desktop's code host and the worker run the same rules.
- **Contract:** export `DeviceView`, `DeviceGrant`, `CodeItem`, `CodeRepo` and the link frame types from `packages/api-contract`. Secrets stay in `apps/api` (AGENTS.md); the desktop bundle holds only the Clerk publishable key and the API URL.

### Signing in
**Decided (23 November): the same Mates account, however you made it.** No new account, no separate desktop login. Three ways in, on the first screen:

| Way | How | Notes |
|---|---|---|
| **Scan with your phone** (shown first) | The desktop shows a QR code. Open Mates on your phone, tap **Scan to sign in** (also in Settings → Devices), point the camera, confirm. Done in about five seconds | The fastest way for everyone who already has the app, which is nearly every desktop user |
| **Apple or Google** | Opens your normal browser, you pick your account, and it comes back to the app | `@clerk/electron` OAuth: the system browser plus a `mates://` deep link. Works only in packaged builds, so we test it on real installers |
| **Email** | A code to your email, or your password, the same as on the phone | Works everywhere, including development builds |

**How QR sign-in works** (built on Clerk sign-in tokens, which are one-time and redeemed with the `ticket` strategy; the phone pairing follows OpenMausBot's flow):
1. The desktop calls `POST /v1/desktop-signin` (no account yet; rate-limited per IP). The API stores a request with a random **secret**, a short **match code** (like `K7-42`), the desktop's name and system, and a 2-minute expiry. It returns the id, the secret and the code. The QR holds only `mates://signin/<id>`; the secret never leaves the desktop.
2. The phone scans the code (`expo-camera` barcode scanning) and calls `GET /v1/desktop-signin/:id` with its Clerk session. It shows: **"Sign in on KEN-LAPTOP (Windows), near Accra? Code K7-42"**. You check the code matches the desktop's screen, then tap **Sign in**.
3. `POST /v1/desktop-signin/:id/approve` (Clerk auth) has Clerk's Backend API create a sign-in token for that user with `expiresInSeconds: 60`. It's stored on the request, which is marked approved.
4. The desktop, polling `GET /v1/desktop-signin/:id/result` **with its secret**, gets the token once. It signs in with the `ticket` strategy, and the request is deleted. A wrong secret, an expired request or a second read gets nothing.
5. The new desktop registers itself in `devices` and appears in Settings → Devices on the phone, with **Remove**.

**After sign-in:**
- The session token is stored by `@clerk/electron` (encrypted with Electron's `safeStorage`).
- Signing out on the desktop removes the device.
- **Remove** on the phone ends the desktop's session and its device link.
- Passkeys come later, once Clerk's Electron support for them is verified (their docs mark native passkeys as "not verified").

### Building and shipping
- **Builds:** `electron-builder` from GitHub Actions on Windows, macOS and Linux runners.
  - Windows: NSIS installer (x64 and arm64), plus `winget`.
  - macOS: universal `.dmg` plus `.zip` for updates, signed and notarised, plus a Homebrew cask.
  - Linux: AppImage, `.deb` and `.rpm` (x64 and arm64); Flatpak later.
- **Signing:**
  - macOS uses our Apple Developer account (the one for the iPhone app) for a Developer ID certificate and notarisation.
  - Windows needs a code-signing certificate, or SmartScreen warns everyone and antivirus may flag an app that moves the mouse. Options are Azure Trusted Signing (cheapest, but check eligibility for a Ghanaian business) or an OV certificate from a CA such as Certum or SSL.com.
- **Updates:** `electron-updater` with **stable** and **nightly** channels, as in T3 Code. Our repo is private, so release files go to a public `mates-desktop-releases` repo or to Cloudflare R2 (decision 6). The app asks before a restart that would end a call or a takeover.
- **Crash reports:** Sentry for Electron (main and renderer), the same project family as mobile.

---

## 7. Safety and privacy

Everything in [computer-use.md](../plans/computer-use.md) "Safety" applies. Added for the desktop:

| Threat | What stops it |
|---|---|
| A web page or email tells a mate to do something on your computer | Lending is only for your own conversations; content is data, never instructions; gates pause anything consequential; the screen tool allow-list has no paths, commands or ports |
| A mate reaches your home network through "your internet" | The desktop resolves names itself and connects only to public addresses on web ports; private, link-local, metadata and your own public address are refused |
| A mate reads your secrets from a lent folder | Protected paths are never lent, whatever you choose; folder reads are logged; files over a size cap need a new OK |
| A stolen token drives your computer | Link tickets last 60 seconds; tokens live in the OS keychain; **Remove** in Devices ends the link at once; desktop sessions don't renew themselves after removal |
| A mate types a password | `isSecretField` blocks it; private input goes straight from you to the field, never to the model, logs or history |
| You don't notice a mate working | Tray state, caption window, mascot cursor; your own mouse or keyboard pauses it at once |
| A bad update breaks everyone | Nightly first, staged stable rollout, rollback to the previous version, forward-migration smoke test on packaged builds |

Privacy: screenshots from your computer are kept only as long as the goal's timeline (30 days, the same as cloud goals, or less if decision 5 in computer-use.md says so) and are deleted with the goal. Our privacy notice and the Data Protection Commission registration (P10) must name this data.

---

## 8. The order of work

Each phase ships on its own, behind `DESKTOP_ENABLED` on the API where the server changes. One PR at a time against `main`, no stacking.

**Phase 0: foundation (2–3 weeks)**
1. `packages/client-core`: move the shared chat logic and theme out of mobile; mobile tests still pass.
2. `apps/desktop`: Electron, Vite, React, Tailwind. Sign in with email, Apple or Google (`@clerk/electron`), and **QR sign-in** (the `desktop-signin` routes, plus **Scan to sign in** on the phone). One window with the sidebar and a working chat (send, stream, history).
3. Signed builds for all three systems, auto-update on the nightly channel, Sentry.
4. A download page on agents.askorin.app (internal link only).

*Demo: install on Windows, Mac and Ubuntu; sign in; chat with Kofi; a nightly updates itself.*

**Phase 1: daily driver (3–4 weeks)**
5. Every chat card, the right panel (computer, page, deck, code PR, mission), groups, friends, memory and settings screens.
6. Command palette, shortcuts, `F6` areas, deep links (`mates://`).
7. Native notifications with actions; presence-aware delivery; the tray.
8. Calls (LiveKit web) and full keyboard-and-mouse takeover of the cloud computer.
9. Offline reading and queued sends.

*Launch gate for the public download:* cold start under 1.5 s on a mid-range Windows laptop, crash-free sessions ≥ 99.5% over two weeks of internal use, every mobile card renders.

**Phase 2: mates anywhere (2–3 weeks)**
10. Summon bar.
11. Hold to talk on all three systems.
12. SnapShot.
13. Send to Mates (drag onto the tray, the right-click menu on each system, paste as context).
14. Share your screen with a mate on a call.
14b. Themes: Appearance settings, Harmattan plus four themes (light and dark), theme files, and "ask a mate to restyle" with Undo (section 4E).

**Phase 3: the coding environment (5–6 weeks)**

*3a. See everything, in the cloud first (no desktop needed for the server half):*

15. `CodeItem` in the contract, `code_run_items`, and the items and stream routes. `readCoderEvent` maps opencode events to items; cloud runs write them.
16. Desktop timeline, folded tool calls, live command output (separate from the timeline), diff panel with the worker pool, plan, approval and question cards, steer and stop. The phone's code card reads the same items.
17. `packages/code-core` holds the shared push rules (`assertPushable`, `guardDiff`, branch names, the coder prompt).

*3b. Code on your computer:*

18. The code host in a `utilityProcess`: worktrees, checkpoint refs, a local SQLite store, `node-pty` terminals, and the terminal renderer chosen by benchmark.
19. Linking a repository and its grant (`code_repos`), the push-token route, and the code host's sync up to the API.
20. The mate's coder in opencode server mode, locally and in the cloud: steer, abort, permission requests mapped to the modes, resumed sessions for follow-ups, the per-run key route, usage on the plan. Approvals reach the phone.
21. The **Code** section in the sidebar (repos and their runs), and the mate choosing **this computer** or **cloud** from chat.
22. Checkpoints and **Restore to before this turn**; branch comparison and per-commit diffs; comment on a line.

*Gate:* a 20-task coding suite on a real repo (ours), run on Windows, macOS and Ubuntu, both locally and in the cloud, meets the speed budgets in section 4D. No push ever reaches a default branch.

**Phase 4: your computer, part one (3 weeks)**
23. Devices table, routes, Settings → Devices on desktop and phone. (The device link's request channel is already used by phase 3b's approvals and sync; this phase adds streams.)
24. The device link: tickets, WebSocket, streams with flow control, reconnects, sleep and wake.
25. **Your internet** for the cloud computer (egress door + E2B SOCKS proxy).
26. **Folders** (read only first, then edit as its own grant).
27. Tray **Pause** and **See activity**; the activity log on the server.

**Phase 5: your computer, part two (4 weeks)**
28. **Your Chrome** over DevTools.
29. **Screen and apps:** `local` DesktopProvider with `cua-driver` on Windows and macOS; Linux X11 opt-in; Wayland off.
30. Caption window and the mascot cursor; user input pauses the mate.
31. `place` on computer goals; the mate picks and explains the place.
32. The 30-task suite from computer-use.md, run again on Windows and macOS.

**Missions build websites (with phase 3b)**
- A mission task can be a code run (local or cloud), its status on the board, and the mission board as a desktop side panel (section 4F).
- Decide the new-repository and hosting questions first.

**Phase 6: power (later)**
33. Remote MCP server so other AI apps can work with your mates.
34. Watch your PC from the phone.
35. Windows-only software through your PC as a documented playbook.

The minimal device link (ticket, WebSocket, request channel) is built in phase 3b because local code runs need it for approvals and sync. Phase 4 adds the stream multiplexing.

---

## 9. How we'll know it's working

| Metric | Target 90 days after the public download |
|---|---|
| Paying users with the desktop app installed | ≥ 30% |
| Weekly active desktop users who also use the phone | ≥ 70% (one crew, many windows) |
| Summon bar or hold-to-talk uses per desktop user per week | ≥ 10 |
| Computer goals run on the user's own computer | ≥ 25% of all computer goals (and that much less E2B spend) |
| Cloud computer goals that failed on a blocked site, after "your internet" | down by half |
| Code runs on the user's own computer | ≥ 50% of code runs by desktop users (and that much less Modal spend) |
| Code runs that end in a PR the user merges | ≥ 60% |
| Code runs where the user opened the diff or a terminal before the PR | tracked; the point of the view |
| Pushes to a default branch | 0 |
| Unwanted actions on a user's computer | 0 |
| Cold start, p50 / p95 | < 1.5 s / < 3 s |
| Crash-free sessions | ≥ 99.5% |

---

## 10. Risks

| Risk | What we do |
|---|---|
| A mate does damage on someone's real computer | Off by default, grants per kind, only your own conversations, gates in code, instant pause on your input, screen allow-list, no local commands in v1 |
| Windows antivirus or SmartScreen flags an app that moves the mouse | A proper code-signing certificate from day one; submit builds to Microsoft for analysis; screen control is a separate helper, started only when granted |
| macOS permissions confuse people | Ask for Screen Recording and Accessibility only when a mate first needs them, with one clear card and a restart prompt (OpenMausBot's flow) |
| Linux is many systems | Support Ubuntu LTS and Fedora officially; others best effort; Wayland screen control off |
| The device link doesn't scale | One API instance for now; a Durable Object per user when we scale; links reconnect by themselves |
| Electron is heavy | Memory and start-time budgets in CI; lazy panels; no native modules at startup |
| Two clients drift apart | `packages/client-core` holds the logic both use; card rendering has one test fixture set shared by both apps |
| Local code runs spend more of our tokens than we expect | The per-run key cap as today; local runs count on the same plan quota as cloud runs; cost per run tracked from day one |
| `@clerk/electron` is in beta | Pin the version; email code and QR sign-in don't depend on its OAuth deep links, so they still work if OAuth breaks; follow Clerk's changelog |
| Someone tricks a user into scanning their QR code (QR phishing) | The phone shows the computer's name, system and rough location plus a code that must match the desktop's screen; requests last 2 minutes and work once; the desktop that made the request is the only one that can redeem it |
| A local coder damages a user's repository | Worktrees under our data folder, never the user's checkout; checkpoints each turn; pushes only to a `mates/…` branch with a token minted per push; `guardDiff` before every push |
| `node-pty` and native Git differences on Windows | Prebuilt `node-pty` per platform and architecture in the build; run the coding suite on all three systems in CI; Git for Windows required and detected, with one clear card if it's missing |
| A busy coder floods the app | Output bypasses the timeline and goes only to open rows; coalesced streaming; tails capped; virtualised timeline (T3 Code's wire budgets) |
| Electron and Chromium security updates | Follow Electron's stable line within two weeks of each release; context isolation and sandbox on in every window; no Node in renderers |

---

## 11. Not in this plan
- Running mates without our cloud (a local-only mode). Our home is the cloud; that's what keeps routines and watches running when the laptop is shut.
- Bring-your-own API keys or agent subscriptions (Claude Code, Codex and the like), for chat or code. Model choice stays ours; the mate is the coder (section 4D).
- A general code editor. You review and comment on diffs; editing files by hand happens in your own editor (**Open in editor** on any file).
- An iMessage bridge through the Mac. Same reasons as the master plan (section 8).
- A Windows desktop in the cloud. Your own Windows PC covers most of that need first.

---

## 12. Decisions needed from Ken
1. **Electron instead of Tauri** (master plan D9 said Tauri)? *Recommend: Electron* (section 6).
2. **Who gets what?** *Recommend:* the app, summon bar, hold to talk, SnapShot and calls on every plan. "Your computer" on every paid plan, not just Pro and Max, because it costs us no compute; the cloud computer stays Pro and Max.
3. **Lending defaults:** all four kinds off until turned on (recommended), or **your internet** on by default once the app is signed in, as OpenMausBot does?
4. **Windows signing:** Azure Trusted Signing (if a Ghanaian business qualifies) or an OV certificate (about $200–400 a year)?
5. ~~Local code runs and your own Claude Code or Codex~~ **Decided 23 November:** local code runs are in, with the T3 Code-grade view (section 4D, phase 3). The mate is the coder on the user's Mates plan, and there are no bring-your-own coders. Still open:
   - **Which plans get local code runs?** *Recommend:* the same as cloud runs (Pro and Max). Local runs spend our tokens but no sandbox minutes, so each run can get a higher cap than in the cloud.
8. ~~How people sign in~~ **Decided 23 November:** with their existing Mates account (email, Apple, Google), plus QR sign-in from the phone (section 6, "Signing in").
6. **Where updates are published:** a public `mates-desktop-releases` GitHub repo (simplest, free) or Cloudflare R2?
7. **Name:** "Mates for desktop", or just "Mates" with the platform on the download page?
