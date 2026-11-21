# Computer use: every user's mates get a real computer

## Context
Mates get their own computer and use it the way a person does. They open the browser, sign in, read, click, type, download and upload files, work in spreadsheets and documents, use the terminal, install apps, and juggle windows. **You watch it happen live** in the app, and **you can take the mouse at any moment** and hand it back. It isn't built for one task: give it a goal ("sort out my visa application", "list these 12 products everywhere", "find me a 2-bed in Spintex", "get me a job") and it works until the goal is done, keeping notes and a tracker as it goes.

**Decisions so far (Ken, 2026-11-19):**
- **Provider: Daytona.**
- **Update (2026-11-21): moving to E2B,** because Daytona below Tier 3 can't reach the open internet. See [E2B](#e2b) below. `COMPUTER_PROVIDER` picks the service for new desktops; each computer keeps its own, so both run side by side and rollback is one setting.
- **The best capabilities come first.** We save money only where it costs no quality: an idle machine is stopped, nobody pays for a screen nobody needs, and nothing is done twice. We never save money by using a weaker model or making the agent less able.
- **Watchable and human-like.** The work happens on the visible desktop at a pace a person can follow, so the preview always shows what the mate is doing.

**What we reuse, not rebuild:**
- **Pause/hand-back/private-typing/verification:** from the Browserbase browser (`apps/api/src/browser.ts`). Its `user_control` → re-check pattern is the takeover model here.
- **Run durability, cancellation and per-user concurrency:** Modal code runs (`computer.ts`, `code-runs.ts`).
- **Composio:** Gmail, Calendar, Sheets and the rest.
- **Watches:** `watches.ts`, with Gmail triggers in real time.
- **Missions + workboard + notes:** `missions.ts`, `workboard.ts`.
- **Routines and reminders.**
- **LiveKit calls:** `calls.ts`.
- **`outbound-check.ts`.**
- **Usage metering:** `usage/`, `SANDBOX_MINUTE`.
- **Trigger.dev durable runs.**

This is master-plan item F4 (persistent cloud computer). D9 (driving the user's own laptop) comes last and uses the same interface.

## What "uses a computer like a person" means
The mate can do anything a person at a Linux desktop can:
- **Browser:** Chrome with one persistent profile. Logins, cookies, saved sites and downloads survive between sessions. Tabs, pop-ups, file pickers, drag and drop, PDF viewing.
- **Files:** a real home folder. Download, rename, sort into folders, zip, convert (PDF ↔ image ↔ doc), fill PDF forms, scan text out of images.
- **Office:** LibreOffice Calc/Writer/Impress for `.xlsx`, `.docx` and `.pptx` people actually open. It makes trackers, budgets, letters and slides, and opens the files you send it.
- **Web apps as a person uses them:** WhatsApp Web, Gmail web, marketplace seller dashboards, government and bank portals. These are the sites with no API, and only a real screen reaches them.
- **Terminal and apps:** install what a task needs (`apt`, Flatpak, pip), run scripts, use command-line tools when they're the quicker way.
- **Clipboard, keyboard shortcuts, several windows, a second workspace.**
- **Memory of its own machine:** it knows what's in its folders, which sites it's logged into, and what it did yesterday (see *Computer journal*).
- **Later:** a Windows desktop on Daytona for Windows-only software, and an Android emulator for app-only services such as some banks and ride apps.

## Principles
1. **Show the work.** Every action happens on the visible desktop: the cursor glides to its target, typing appears at a readable pace, windows open in front of you. A thin **caption bar** on the desktop says what the mate is doing ("Kofi · opening Acme's careers page"). When something runs through an app API instead (sending through Gmail with Composio), a desktop notification and the step line show it, so nothing happens off screen.
   **Two paces:** *Live* is human pace, used whenever someone has the preview open or the task is interactive. *Background* runs full speed when nobody is watching. It's the same actions in the same places, so a replay looks the same in both.
2. **Best perception, best model.** The mate sees through every channel at once: the **screenshot**, the **accessibility tree** (Daytona exposes it), the **page DOM** through Chrome DevTools, and **OCR** for text inside images. Combining these is how it clicks accurately and reads pages correctly. The model is the strongest computer-use model available (below), with deeper thinking on hard steps.
3. **Plan → act → verify, always.** Each step checks its own result before the next. The mate never says something happened without evidence: a confirmation page, a file it read back, an email that arrived.
4. **Code owns state and rules; the model owns meaning.** Trackers, statuses, timers, approval gates, spend caps and "never submit twice" live in the database and in code. The model decides what a screen means and what to write.
5. **Stop paying when idle.** The machine is stopped the moment it isn't needed and starts in seconds with everything where it was. Watching inboxes, waiting for replies and timing follow-ups run on the server (watches and routines), not on a running desktop.

## E2B
Source of truth: github.com/e2b-dev/E2B (`packages/js-sdk`, `packages/desktop-js`), github.com/e2b-dev/desktop (`template/`) and docs.e2b.dev. The adapter is `apps/api/src/desktop/e2b.ts`; its header lists every fact it relies on.
- **Template:** `scripts/computer-template.ts` builds `mates-desktop-v<N>` on E2B's `desktop` template (Ubuntu 22.04, xfce, Chrome, LibreOffice, x11vnc, noVNC). Its start command (`scripts/computer/mates-desktop run`) boots the whole desktop during the build, so a new computer is on when it's created (about 6s warm).
- **Stop is pause:** memory and disk are kept (about 2s to pause, 1s to resume) and every window comes back as it was. Paused desktops are kept until deleted.
- **Live view:** noVNC on port 6080, public traffic on (the page's websocket can't send E2B's traffic token). x11vnc guards it with two passwords, control and watch-only, rotated per link; watch-only is enforced by the server.
- **Accessibility:** `mates-a11y` (pyatspi) prints the same tree shape as Daytona's API. Chrome needs `ACCESSIBILITY_ENABLED=1` to join the bus, and `--password-store=basic` so it never asks for a keyring password.
- **Limits:** Hobby runs 10 desktops at once and at most 1 hour before E2B pauses one; Pro is 100 at once and 24 hours.
- **Check it end to end:** `pnpm exec tsx scripts/computer-smoke.ts` makes a desktop, drives it through the adapter and deletes it.

## Daytona
Facts from Daytona's docs, as of November 2026. Re-check the exact defaults when we build.
- **Computer-use API** on the sandbox: `sandbox.computerUse.start()` starts the desktop stack (Xvfb, Xfce, x11vnc, noVNC). It provides `mouse` (move/click/drag/scroll), `keyboard` (type/press/hotkey), `screenshot` (full screen and regions), `display` (windows and screen info), **accessibility** operations and **recording**.
- **Live view:** noVNC served through the sandbox's preview URL. Third-party code uses port 6080; confirm it against the docs. We send the app a short-lived signed URL, never a lasting one.
- **Lifecycle:** **stopped** keeps the filesystem and starts again quickly. **Archived** moves it to object storage: it costs less to keep and is slower to start. The defaults are auto-stop after 15 min and auto-archive after 7 days stopped. **We never set auto-delete.** Our reaper stops a desktop 5 min after its last goal; archiving after 7 days stays as the default.
- **Snapshot (image):** our own, built on Daytona's desktop image. It adds Chrome, LibreOffice, Noto fonts (including Ghanaian language glyphs), a PDF tool, OCR (`tesseract`), `ffmpeg`, `xdotool`, `jq`, the caption-bar helper, and Ghana timezone and locale by default. Version it like `TOOLCHAIN` in `computer.ts`.
- **Size:** 4 vCPU / 8 GB RAM / 20 GB disk, so Chrome with many tabs plus LibreOffice stays smooth in the live view. At about $0.0504 per vCPU-hour + $0.0162 per GB-hour that's **~$0.33 per running hour**. A 2 vCPU / 4 GB fallback costs ~$0.17. While stopped, a container's disk counts against quota (~$0.000108 per GB-hour above 5 GB, roughly **$1.20 per user per month** for 20 GB). Archiving after a week of idle makes that cheaper.
- **Account:** $200 free trial credit (some new accounts got $100), no monthly fee, no session cap. Apply for the startup credit programme (up to $50k advertised).
- **Isolation:** containers by default. Each user's desktop is its own sandbox with no route to our internal services, and no server secrets ever go on it (AGENTS.md). Ask Daytona about VM-backed sandboxes for stronger isolation when we have paying users.

```ts
// apps/api/src/desktop/types.ts: the mate only knows this; Daytona is one implementation
type Desktop = {
  id: string;
  observe(opts?: { a11y?: boolean; dom?: boolean; ocr?: boolean }): Promise<Observation>; // screenshot + trees
  act(action: DesktopAction): Promise<ActResult>;  // move, click, double, right, drag, scroll, type, key, hotkey, wait
  browser(): Promise<CdpHandle>;                   // the visible Chrome, for DOM reading and precise targeting
  exec(cmd: string, opts?: ExecOptions): Promise<CommandResult>;
  files: { read(p: string): Promise<Buffer | null>; write(p: string, b: Buffer): Promise<void>; list(dir: string): Promise<Entry[]> };
  clipboard: { get(): Promise<string>; set(text: string): Promise<void> };
  caption(text: string | null): Promise<void>;     // the on-screen "what I'm doing" bar
  liveUrl(opts: { interactive: boolean }): Promise<string>;
  recording: { start(): Promise<void>; stop(): Promise<string> };
  start(): Promise<void>; stop(): Promise<void>;
};
```

## Who has the computer: one per user, shared by all their mates
- **One machine holds your world:** logins, files and history in one place. You sign into a site once, for every mate.
- **One driver at a time.** A lease (`computers.driverMateId`, with a heartbeat) means one mate holds the mouse, and the app shows "**Kofi is using the computer**". Other mates can queue for it, keep working without it (`web_read`, Composio email and calendar, planning, writing), or ask for a helper.
- **Helper computers (phase 5).** For parallel work ("apply to these 8", "get quotes from 10 vendors"), start temporary desktops from the user's latest disk, one goal each, shown as tiles in the app. They're destroyed afterwards. Files they produce are copied back. Logins created on a helper are not copied back automatically, so you approve any new sign-ins.
- **Folders:** `~/Mates/<mate>/` (each mate's scratch), `~/Shared/<mission>/` (deliverables: trackers, letters, downloads), `~/Downloads`.
- **Any mate can drive.** The lead mate is the default. Missions can name a specialist mate, and the playbook can suggest one ("Career", "Home", "Shop").

## The agent
```
goal ("List these 12 products on Jiji and Jumia") ──► planner: break into sub-goals, pick the playbook if any
  └► for each sub-goal, holding the lease:
        observe   screenshot + accessibility tree + DOM (if browser) + OCR where needed + last result
        think     what's on screen, what changed, what's next (deeper thinking on hard steps)
        gate      code checks the intended action against policy BEFORE it runs
        act       one action, on screen, at the current pace; caption updated
        verify    re-observe; expected change? if not, recover (below)
        record    step, screenshot, reasoning summary → timeline + journal
  └► sub-goal done → evidence saved, tracker/notes updated, next sub-goal
```
- **Models:** Claude Opus 5.5 is the actor for hard and unfamiliar work. Sonnet 5.5 runs routine, well-known flows. Anthropic's own reported OSWorld 2.1 numbers put them at the top: Opus 5.5 at 81.8, Sonnet 5.5 at 80.1. A step that fails twice moves up to Opus with more thinking. The planner is Opus too. First check whether OpenRouter passes through Anthropic's native `computer` tool. If it doesn't, we expose our own `click/type/key/scroll/drag/observe` function tools. That works with any vision model and lets us A/B test.
- **Grounding:** screenshots go at the model's native resolution, and coordinates are mapped back to the screen. Accessibility and DOM elements are overlaid as numbered marks ("set-of-marks"), so the model can say "click [14]" and code clicks the element's exact centre. Raw coordinates are kept for canvas or custom widgets.
- **Smart routes, still on screen:** where the browser DOM gives a reliable target, code aims the visible cursor at it. Where an app API is strictly better (sending an email from your Gmail account), it's used and shown as a notification. A visible desktop is never traded for a hidden shortcut when someone is watching.
- **Recovery:** cookie banners, pop-ups, "are you still there?", crashed tabs, a frozen app (kill and reopen), session expired (re-login from the vault, or hand off), unexpected page (go back and re-plan). Three failed recoveries on a sub-goal → pause and ask, with a screenshot and what it tried.
- **Recipes (learned skills):** when a site flow succeeds, it's saved as a replayable recipe (targets with fallbacks) in `site_recipes`. Next time the mate follows the recipe and only thinks where the page differs. The result is faster, steadier and cheaper over time without lowering quality. Recipes are per site, shared across users only when they contain no personal data.
- **Computer journal:** a running log per user of which sites it's logged into, where files are, what each mission did, and which flows failed. It's summarised into the mate's context, so "send the letter you wrote yesterday" works.
- **Long tasks:** a checkpoint after every sub-goal, so a worker crash resumes at the last sub-goal and never redoes a submit (idempotency keys on any irreversible action).

## Watching and taking over
- **The computer card** in chat: live noVNC view, the step line ("Filling the form, 3 of 5"), the mate's caption, **Take over**, **Stop**. Tap to go full screen, landscape on the phone.
- **The Computer screen** (from the mate or the home tab): the live desktop whenever it's on, plus the **timeline** of recent goals with screenshots, files the mate made, sites it's signed into (sign out of any), and the journal.
- **Take over:** the mate pauses at the next step boundary, the lease passes to you, and the stream becomes interactive (touch → mouse, plus an on-screen keyboard and key bar on mobile). **Hand back:** the mate re-observes, notes what changed ("You signed in and accepted the cookies") and carries on. It never assumes; it always re-checks, exactly like `resumeBrowser`.
- **Point, don't take over:** tap on the live view and type "use this one". The mate gets the tap position plus your words. Guiding is often all that's needed.
- **Watch together on a call:** during a LiveKit call the mate works and narrates. You say "no, the second one" and it adjusts.
- **Private input:** passwords, OTPs and card numbers go straight into the remote field (as `browserInput` does). They never reach the model, logs or history. Screenshots and recordings blur focused password fields.
- **Replay:** every goal keeps its recording and step screenshots for 30 days, so "what did you do at 3 pm?" is answerable.

## What it's for (examples, not limits)
**Most use is ad hoc**, one sentence with no setup:
- "Fill this PDF form with my details."
- "Download all my bank statements from this year into one folder."
- "Make a spreadsheet of every hostel near KNUST under GH₵4,000."
- "Turn these photos into a PDF and email it to the embassy."
- "Compare three insurance quotes and tell me which is best."

For long-running goals, a **playbook** adds a tracker (`mission_items`), statuses, columns, follow-up rules and the right gates. A new playbook is a definition, not new infrastructure:

| Playbook | What the mate does on the computer | Pauses for you |
|---|---|---|
| **Job hunt** | CV → profile and answer bank, search boards and career pages, shortlist, apply, `.xlsx` tracker, watch Gmail, follow up, interview hand-off with prep | Shortlist approval, calls, accepting times |
| **Scholarships, admissions, visas** | Find and shortlist by deadline/eligibility, fill portals, upload documents, chase referees, fill visa forms, watch for appointment slots | Fees, declarations, booking the slot |
| **House hunt** | Daily sweep of listing sites, agents and groups; scam flags; message agents; book viewings; comparison sheet with photos | Calls, deposits, signing |
| **Online shop back office** | Post one product everywhere, keep stock in sync across marketplaces, answer routine questions, orders → sheet, weekly MoMo/bank profit sheet | Refunds, big price changes, paying suppliers |
| **Life admin** | Log into utility/bank/GRA/SSNIT/insurer portals, download and file statements, renewals calendar, start renewals and book appointments, monthly budget | Every payment, OTPs, tax submission |
| **Quotes & buying** | Brief vendors by email/WhatsApp Web/forms, chase, compare quotes side by side, negotiate within limits, line up the order | Choosing, paying, calls |
| **Research → deliverable** | Visit dozens of sources, extract into a spreadsheet, write the report or deck in LibreOffice, cite every number | Sending it anywhere |
| **Prospecting (freelancers)** | Find leads, research each one, personal outreach, CRM sheet, follow-ups, book calls | New recipients past a daily cap |

The **job hunt** is the first playbook we build end to end because it exercises everything: documents, many sites, accounts, a tracker, an inbox loop, follow-ups and a hand-off. Quotes & buying comes second to prove the machinery works for a different playbook.

## Safety (enforced in code, not prompts)
The owner decision of 2026-11-06 ("act without asking for what the user requested") still holds. Approving a mission's plan or shortlist counts as requesting the actions in it. **Hard gates always pause:**
- **Money:** any payment, fee, subscription or order.
- **Secrets:** a password not in the vault, OTPs, ID numbers. These are handed to you.
- **Calls,** and messages to a **new person** outside the mission's scope or past a daily cap.
- **Commitments:** accepting times, offers or terms; signing; submitting to government or tax.
- **Destructive acts:** deleting accounts, emails, or files outside `~/Mates/` and `~/Shared/`.
- **Installing software** outside the curated list. The same-session request counts as approval, and it's shown on the Done card.

Other rules:
- **Truthfulness:** forms and messages use only facts from your profile and answers. Missing facts are asked once and remembered.
- **Prompt injection:** pages, emails, documents and file names are data, never instructions. Outbound messages go through `outbound-check.ts`. A recipient not tied to the mission needs approval.
- **Vault:** passwords the mate creates are encrypted per user (KMS-wrapped) and typed by code, never by the model. You can view, export or delete them. Any site can be signed out of from the Computer screen.
- **Limits:** a per-mission model spend cap (per-mission OpenRouter key, as code runs do), computer minutes from the plan quota, per-site rate limits, daily caps per playbook.
- **Terms of service and bot checks:** some sites (LinkedIn, some visa booking sites) ban automation and ban accounts. The mate reads there and asks before acting, or alerts you to act yourself. Human pacing and a real browser help, but CAPTCHAs always go to you. A residential proxy is a later option for datacenter-IP blocks.
- **Your data:** "delete my computer" archives, then deletes the sandbox and its files after a 7-day grace period. Shown in Account.

## Data (one migration)
- `computers`: `clerkUserId` (unique), `provider` (`daytona`), `providerId`, `snapshotVersion`, `state` (`off|starting|on|stopping|archived|error`), `driverMateId`, `leaseUntil`, `watchers` (live view count → pace), `lastActiveAt`.
- `computer_goals`: `computerId, missionId?, chatId, mateId, goal, status, steps jsonb, recordingUrl, evidence[], model, tokens, seconds, error`.
- `computer_journal`: `clerkUserId, kind (login|file|done|failed|note), subject, detail, at`.
- `mission_items`: `missionId, kind, title, url, status, fields jsonb, nextActionAt, evidence[]`, the generic tracker that playbooks use.
- `profiles_structured` (the CV/profile and answer bank, versioned), `vault_secrets` (`site, username, ciphertext`), `site_recipes` (`host, flow, steps jsonb, successRate, personal`).

## API / worker / app
- `apps/api/src/desktop/`: `types.ts`, `daytona.ts` (sandbox + computerUse + preview URL), `lease.ts`, `lifecycle.ts` (start/stop/archive, reaper), `caption.ts`.
- `computer-agent.ts`: planner/actor/verifier, gates, recovery, recipes, journal. `playbooks/` holds one file per playbook (statuses, columns, prompts, gates, follow-up rules).
- Trigger tasks: `computer-goal` (`maxDuration` 60 min, per-user concurrency 1 on the main desktop, no automatic retry past an irreversible step), `computer-reaper` (every minute: stop desktops idle for 5 min), `mission-followups` (routine).
- Routes: `GET /v1/computer` (state, signed live URL, driver), `POST /v1/computer/start|stop|takeover|handback|point`, `GET /v1/computer/timeline`, `GET /v1/computer/files`, `GET /v1/missions/:id/items(.xlsx)`.
- `DAYTONA_API_KEY` (+ target region) only in `apps/api` and the Trigger worker's `syncEnvVars`.
- Contract (`packages/api-contract`): `WorkflowCard` kind `computer` `{ state, goal, step, caption, driver, liveAvailable }`, plus types for computer, goal, item and journal.
- Mobile: computer card, full-screen live view with take over and point, Computer screen (live, timeline, files, sign-ins, journal), mission tracker list and item detail, approval cards for gates, profile and answers editor.

## Cost (measure in phase 2, then set plan quotas)
- **Compute:** ~$0.33 per running hour at 4 vCPU/8 GB. Most users run it for minutes a day because it stops on idle.
- **Storage:** ~$1.20 per user per month for 20 GB stopped; less once archived.
- **Model:** the main cost. Opus-class with screenshots is expensive per step. Recipes, accessibility marks (fewer retries) and routing routine flows to Sonnet keep the cost down *without* lowering quality. Track cost per goal and per playbook item from day one.

## Build order
1. **Desktop foundation:** Daytona account + snapshot, `Desktop` interface, start/stop/reaper, lease, caption bar, signed live view in the app, take over / hand back, private typing. Demo: watch the mate open LibreOffice, build a table and save it, take over halfway, hand back.
2. **General agent:** observe/think/gate/act/verify with screenshot + accessibility + DOM + OCR, set-of-marks, Opus/Sonnet routing, recovery, timeline + recording, journal. Ship **ad-hoc goals** (no playbook). Measure success rate and cost on 30 real tasks.
3. **Missions on the computer:** the playbook engine, `mission_items` tracker with `.xlsx`/Sheets mirror, **job hunt** playbook (profile, answer bank, search, shortlist, apply, tracker).
4. **The outside world:** Gmail watch → item status, follow-up routine, call-with-approval (LiveKit + SIP), interview hand-off with prep. Then the **quotes & buying** playbook.
5. **Breadth and power:** helper computers in parallel, recipes, vault, point-to-guide, watch-together on calls, more playbooks (scholarships/visa, house hunt, shop, life admin, research, prospecting).
6. **Beyond Linux:** a Windows desktop for Windows-only software, an Android emulator for app-only services, and the desktop link to your own laptop (D9) implementing the same `Desktop` interface.

## Verification
- `pnpm typecheck && pnpm test`. Unit tests:
  - gates (payment, OTP, call, new recipient and install always pause);
  - lease exclusivity and takeover hand-off;
  - idempotency on irreversible steps;
  - recovery paths;
  - playbook status transitions;
  - follow-up timing;
  - `.xlsx` mirror equals the table;
  - injection fixtures never cause an off-mission send;
  - live URL is short-lived and per-user.
- Live checks:
  - the 30-task suite, measured each release (success, steps, minutes, cost);
  - take over mid-form and hand back;
  - kill the worker mid-goal → resumes without resubmitting;
  - idle → stopped within 5 min;
  - stopped → started with logins and files intact;
  - archived → restored.

## Decisions still needed from Ken
1. Approval granularity: once per mission plan/shortlist (recommended), or per irreversible action?
2. May mates create site accounts with your email and vault passwords?
3. Calls over a real phone line (SIP) in phase 4, or later?
4. The default pace when you're not watching: background full speed (recommended), or always human pace?
5. Retention: keep recordings for 30 days (recommended), or shorter?
