# 13 · A general, always-on computer

## What competitors do
- **Grok Bot:** every bot works on **one persistent cloud computer** shared across the account. You can watch it, take control ("I'm done" hands it back), and work carries on when the app is closed. ([docs.x.ai/grok-bot/mobile](https://docs.x.ai/grok-bot/mobile))
- **Dots:** each dot has **its own cloud computer and browser**, which you can open at any time to see what it's doing. ([Engadget](https://www.engadget.com/2272230/dots-are-openais-new-personal-agents-and-soon-youll-be-able-to-control-several-of-them))

## Where Mates is today
- **Modal sandboxes**, only for code runs, booted per run. Their minutes are metered.
- **Browserbase sessions** for browsing (20 minutes, per run).
- So there's no persistent workspace: files don't stay, logins don't stay, and nothing carries across tasks.

## How it works for users
- Each user gets **their mates' computer** (one per account): a Linux desktop with a browser, files, and logged-in sites that **stay** between tasks.
- **Watch and take control:** a "Computer" screen streams it live and offers **Take control** and **Hand back**, the same as our current browser handoff.
- **Mates use it for long tasks:** research with files, spreadsheets, downloading and processing documents, sites that need a logged-in session, multi-hour jobs.
- **Files:** a Files tab to upload and download, and to drop results into chat.

## Architecture (cost-efficient)
The trick is **pause when idle and resume on demand**. Paying for an always-on VM per user would break our budgets.

1. **Provider:**
   - **E2B** or **Daytona**: about **$0.0504 per vCPU-hour + $0.0162 per GiB-hour**, wall-clock, so a 2 vCPU / 4 GiB box costs about **$0.17 per hour while running**. ([Fly.io comparison](https://fly.io/learn/ai-sandbox-pricing/), [morphllm](https://www.morphllm.com/e2b-pricing))
   - **E2B pause:** paused sandboxes aren't billed for compute and stay available indefinitely. But on Pro, an always-on sandbox must pause and resume at least every 24 hours, and pause plus resume takes about 17 seconds for 4 GiB. E2B Pro is $150 per month before usage. ([Northflank](https://northflank.com/blog/e2b-vs-modal), [beri.net](https://www.beri.net/article/e2b-vs-modal-vs-daytona-agent-sandbox-pricing-isolation-2026))
   - **Daytona:** persistent by default; pause and resume for VM sandboxes.
   - **Modal**, which we use now: sandboxes last at most 24 hours, and a snapshot restore creates a *new* sandbox, so it's weaker for persistence.
   - **Pick:** **Daytona** (persistent by default, cheapest rates) or E2B. Keep Modal for code runs until we migrate.
2. **Lifecycle:**
   - Create the computer on first use, from a base image with Chrome, Python, LibreOffice and common tools.
   - Resume when a run needs it; **pause after 5 minutes idle**. Storage persists, and storage cost is small.
   - **Hard cap** on running hours per week per plan.
3. **Access:**
   - The agent gets tools `computer_shell`, `computer_files` and `computer_browser` (Playwright inside the box, replacing Browserbase for long sessions).
   - Logins persist in the box's Chrome profile.
   - The app streams the desktop through the provider's VNC or noVNC URL, behind short-lived signed links.
4. **Safety:**
   - no secrets from our side go into the box (the per-run OpenRouter key pattern from code runs);
   - network egress allowed, with a blocklist for abuse;
   - per-user isolation;
   - approval rules (01) gate sends and purchases made from the box's browser.
5. **Metering:** `computer` usage = running seconds × the price table. Paused time is charged only for storage, roughly a few cents per GB-month.

## Cost per user
- Typical: 1–3 active hours per week × $0.17 ≈ **$0.20–0.50 per week**.
- Plan running-time caps: Plus 2 hours, Pro 8 hours, Max 25 hours per week.
- **Pro and up** recommended (Plus as a trial allowance).

## Delivery
1. Provider integration, lifecycle (create, resume, pause), shell and file tools, metering.
2. Live view with take control, and the Files tab.
3. Persistent browser profile; move long browsing tasks off Browserbase.
4. Move code runs onto the same computer (optional).

## Open decisions
- One computer per account (Grok Bot) or per mate (Dots)? We recommend per account: cheaper, and mates share files.
- Daytona or E2B: decide after a one-week spike measuring resume time and stability.
