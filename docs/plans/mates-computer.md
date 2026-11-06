# Mates' computer: ship code to GitHub as a bot

## Context
The user wants their mates to have a personal computer: connect GitHub, say "ship dark mode in muse-clone", and a mate clones the repo, writes the code, runs the checks, pushes a branch and opens a pull request authored by a bot (`mates[bot]`). No approval prompts (standing preference), but the bot **never merges and never pushes to the default branch**: a PR is always the hand-off. Decisions:
- **Computer:** Modal Sandboxes (JS SDK `modal`, $30 free credit every month, no session cap, full network).
- **Coder:** opencode (open-source coding agent) running headless inside the sandbox, using OpenRouter models.
- **Bot identity:** our own GitHub App named `mates` → fallbacks `matebot`, `mateagent` (first one free on GitHub). Commits and PRs show as `<slug>[bot]`.

## How a run works
```
"Ship X in owner/repo" ─► Cooper tool cooper_ship_code ─► code_runs row + Trigger task "cooper-code"
  1. mint GitHub installation token: this one repo only, contents+pull_requests write, 1h
  2. mint OpenRouter key with a $ cap for this run (provisioning API), deleted afterwards
  3. Modal sandbox (2 CPU / 4 GB, 60-min timeout) from our image: git, node 22, pnpm/yarn/bun, python, opencode
  4. clone (shallow) → branch mates/<slug>-<short id> from the default (or given) base
  5. detect stack + checks (package.json scripts typecheck/lint/test, AGENTS.md / CLAUDE.md / CONTRIBUTING)
  6. opencode run "<task + repo rules + checks to pass>"  (streams JSON events → progress)
  7. run the checks ourselves; failures go back to opencode, up to 3 fix rounds
  8. commit as <slug>[bot], push branch (token scoped to the repo)
  9. open PR via GitHub API: title, summary of changes, checks result, "Requested by <user> via Cooper"
 10. terminate sandbox, delete the run's OpenRouter key; card + push notification with the PR link
```
Follow-ups ("also add a toggle", "fix the failing test") reuse the run's branch: new run, same branch, pushes to the open PR. Stop from the app cancels the task and terminates the sandbox.

## Data (migration `0014`)
`apps/api/src/db/schema.ts`
- **`github_installations`**: `clerkUserId`, `installationId` (unique), `accountLogin`, `createdAt`. One user may install on several accounts/orgs.
- **`code_runs`**: `id`, `clerkUserId`, `chatId`, `delegationId?`, `repo` (`owner/name`), `baseBranch`, `branch`, `task`, `status` (`queued|cloning|coding|checking|pushing|done|failed|cancelled`), `prNumber`, `prUrl`, `summary`, `checks jsonb` (name, passed, tail of output), `sandboxId`, `error`, timestamps. Partial unique index: **one active run per repo+branch** (no two runs pushing to the same branch).

## API (`apps/api`, contract preserved, secrets only here)
New files:
- **`src/github.ts`** — GitHub App auth with `@octokit/app` (JWT → installation token with `repositories:[repo]` + minimal permissions), `listRepos(userId)`, `openPullRequest`, `botIdentity()` (reads slug + bot user id once: `<slug>[bot]`, `<id>+<slug>[bot]@users.noreply.github.com`).
- **`src/computer.ts`** — Modal sandbox lifecycle (`modal` JS SDK: `sandboxes.create(app, image, { cpu, memoryMiB, timeoutMs, secrets })`, `exec`, `terminate`), image definition, check detection, and output trimming. All secrets passed per-run as sandbox env, never baked into the image.
- **`src/code-runs.ts`** — the run state machine above, progress events, cancellation (heartbeat on `code_runs.status`), cleanup in `finally`, error mapping to plain sentences.
- **`src/openrouter-keys.ts`** — create/delete a capped per-run key (provisioning key `OPENROUTER_PROVISIONING_KEY`); falls back to the main key only if provisioning isn't configured (documented risk).

Routes in `src/app.ts`:
- `GET /v1/github/install` → returns the App install URL with a signed `state` (user id + nonce).
- `GET /v1/github/callback` → verifies `state`, stores `installationId`, deep-links back to the app (`cooper://connections?github=connected`).
- `GET /v1/github/repos` → repos the bot can reach (for the picker and for the agent).
- `GET /v1/code-runs/:id`, `POST /v1/code-runs/:id/cancel`.
- `POST /v1/github/webhook` (verified signature): `installation.deleted` / `installation_repositories` keep the table in sync. (PR review comments → follow-up runs are a later phase.)

Agent (`src/agent-chat.ts`, `src/action-policy.ts`):
- Tool **`cooper_ship_code`** `{ repo, task, base_branch?, follow_up_of? }`. Resolves `repo` fuzzily against the user's installed repos ("muse-clone" → `owner/muse-clone`); unknown/uninstalled repo → a card with "Give Mates access to this repo". Inserts the `code_runs` row, triggers the task, returns immediately with a live **code card**; the chat turn ends ("On it — I'll open a PR").
- Activity labels: "Setting up the computer", "Writing code", "Running checks", "Opening the pull request".
- System prompt line: when asked to build/fix/ship code in a repo, use `cooper_ship_code`; never claim a PR exists before the card says so.

Worker (`src/trigger/agent.ts`): new `schemaTask` `cooper-code`, `maxDuration` 3600, `retry: 1 attempt` (pushes aren't idempotent), `concurrency: { perKey: 1 per user, total: 3 }`. Progress is written into the run's chat message via the existing `mergePayload`/`persist` pattern used by `executeDelegation` (`src/durable-runs.ts`), so the chat updates live like other runs. `MODAL_TOKEN_ID/SECRET`, `GITHUB_APP_*`, `OPENROUTER_PROVISIONING_KEY` added to `trigger.config.ts` `syncEnvVars`.

`WorkflowCard` (`src/integrations.ts`) gains kind **`code`**: `{ repo, branch, status, steps[], checks[], pr?: {number,url,title}, filesChanged?, additions?, deletions? }`.

## Safety rules (enforced in code, not prompts)
- Token scoped to **one repo**, contents + pull_requests only, 1-hour life; refuses to push to the default branch; never calls merge.
- Per-run OpenRouter key with a spend cap; deleted after the run (repo code can't drain the main key).
- Sandbox timeout 60 min; one active run per branch; per-user concurrency 1; idle sandbox killed in `finally` and by the dispatcher's stalled-run sweep.
- Secrets never written to disk, logs, PR body or chat; command output is trimmed and scrubbed of token patterns before it's stored.
- Text from the repo/issues is data, not instructions to Cooper (same rule as web/email).

## Mobile (`apps/mobile`)
- **Apps & connections → GitHub (Mates bot)** row: "Connect" opens the install URL (`expo-web-browser` auth session), returns via deep link; shows connected accounts and repo count; "Manage repos" reopens GitHub's install settings.
- **Code card** (`src/chat/code-card.tsx`, rendered in `chat-thread.tsx` renderToolCall for `kind: "code"`): repo + branch, live step list with the same pulsing activity line, checks (✓/✗ with expandable output tail), final **PR #42 · +120 −8 · 6 files** with **Open pull request** (in-app browser) and **Stop** while running.
- Feed/notifications reuse existing delivery: "mates[bot] opened PR #42 in muse-clone".

## Setup the user does once
1. Create the GitHub App (I'll provide a manifest link / exact settings): name `mates` (→ `matebot` / `mateagent`), permissions Contents RW, Pull requests RW, Metadata R; webhook URL; callback URL. Put `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET` in `apps/api/.env`.
2. Modal account → `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET`.
3. OpenRouter provisioning key → `OPENROUTER_PROVISIONING_KEY`.
4. `pnpm --filter @expojet/api add modal @octokit/app @octokit/rest` (exact command given at build), `pnpm db:migrate`, redeploy the Trigger worker.

## Build order
1. GitHub App auth, install/callback/webhook, repos list, migration; Apps screen GitHub row.
2. Sandbox + run engine without the model: clone → trivial change → checks → push → PR (proves token, identity, PR flow).
3. opencode inside the sandbox with per-run OpenRouter key; fix-loop on failing checks.
4. `cooper_ship_code` tool, code card, cancel, follow-ups on the same branch, notifications.

## Verification
- `pnpm typecheck && pnpm test`. Unit tests: token request is single-repo + minimal permissions; default-branch push refused; branch naming/slug; check detection from sample `package.json`s; output scrubbing removes tokens; repo fuzzy resolution; state machine transitions and cancellation; webhook signature verification.
- End-to-end on a throwaway repo: "add a /health endpoint" → PR opened by `<slug>[bot]` with passing checks; break a test on purpose → fix loop; Stop mid-run → sandbox gone (Modal dashboard), status cancelled; follow-up message → second commit on the same PR; uninstall the App → repo disappears from the list.
- Cost check: Modal dashboard usage per run (target a few cents) and the per-run OpenRouter key spend.
