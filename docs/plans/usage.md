# Plan usage: limits, metering and margins

Each plan comes with an allowance that goes down as people use their mates and refills on two clocks:

- **A 5-hour session**, on every plan except Max.
- **A week**, on every plan.

At a limit, new work pauses until the allowance refills. The app shows the reset time and a link to plans.

## Budgets

A budget is what someone's usage may **cost us**, in micro-dollars (millionths of a dollar). It is not what they pay. People only ever see a percentage. The numbers live in `apps/api/src/usage/plans.ts`:

| Plan | Price | Weekly budget | 5-hour budget |
|---|---|---|---|
| Starter | $8 | $0.738 (40% of $8 over 52/12 weeks) | $0.185 (a quarter of the week) |
| Plus | $15 | 2× Starter | 2× Starter |
| Pro | $40 | 6× Starter | 6× Starter |
| Max | $80 | 12× Starter | none |

**What Starter's allowance buys, roughly.**
- A typical agent run costs 1–2¢, so a session holds about 10–15 tasks and a week about 50–70.
- A voice minute costs about 3.2¢, so a session holds about 6 minutes and a week about 23. Calls are the heaviest thing on Starter.

**Overrides.**
- `USAGE_<PLAN>_WEEKLY_MICROS` and `USAGE_<PLAN>_SESSION_MICROS` change a budget.
- `PLAN_<PLAN>_PRICE_MICROS` changes a list price.
- `DEFAULT_PLAN` (default `starter`) is the plan for accounts we haven't set one for. Set it to `none` once payments exist, so new accounts must choose a plan.

## How the windows work

A window opens with the first use after the previous one ended, and resets exactly 5 hours or 7 days later. Every cost is charged to both windows, and the 5-hour window is also tracked on Max for reporting. Someone is stopped when any window their plan checks is used up.

Cost is only known after the work is done, so the step already running always finishes. Longer work is checked as it goes:

- **Agent runs.** Before each extra model step, if the person is out, the mate stops using tools and wraps up in one more step.
- **Calls and meetings.** These start with a time cap worked out from what's left (`usageCapMs`). When the cap is reached, the mate explains why, sets `mates.endReason=usage_limit` and ends the call. The app then says the call ended for usage.
- **Code runs.** The coder's OpenRouter key is capped at whichever is lower: `CODE_RUN_LIMIT_USD` or what's left.
- **Decks.** A deck is checked when it starts and is not stopped halfway. It costs 1–2¢, and a half-built deck would be useless.

### Where checks happen

**When work starts:**
- `submitRun` (app chat, Slack, call tasks, routine "run now")
- `startCall` and `startMeeting`
- deck creation and edits (`checkAllowance`)
- `startCodeRun`
- `POST /v1/attachments` and `POST /v1/transcribe`

**When work comes due without a request:** scheduled routines and mission rounds are checked in `executeDelegation`. If the person is out, the run is skipped with a short note in the chat and a push notification.

**What a refusal looks like:**
- Out of usage: **429** `{ error: { code: "usage_limit", message, window, resetsAt, plan, upgradeUrl } }`
- No plan: **402** `plan_required`

## Turning it on

`USAGE_ENFORCE` takes three values:

| Value | Effect |
|---|---|
| `shadow` (default) | Meters everything and logs `usage_would_block`, but blocks nothing. The app shows the usage screen but no limit messages. |
| `on` | Blocks. |
| `off` | Skips the checks. Costs are still recorded. |

**Rollout:**
1. Deploy with `shadow`: run `db:migrate`, then deploy the API, the worker and the voice agent.
2. Give it about a week, then run `pnpm exec tsx scripts/usage-report.ts 7` in `apps/api` to see real weekly cost per person against each budget.
3. Adjust budgets or prices if needed, then switch to `on`.

## Recording costs

`recordUsage` (`src/usage/record.ts`) is the only writer. It runs one SQL statement that:
- inserts the ledger row in `usage_events`;
- adds the cost to both windows in `usage_windows`, starting a fresh window if the old one ended;
- adds it to the daily totals in `usage_daily`.

The idempotency key on the ledger row means a retried step never charges twice. If recording fails, it retries once and then logs a warning; it never breaks the work it measured.

| What | How it's costed |
|---|---|
| OpenRouter model calls | Cost reported by OpenRouter (`usage: { include: true }`) |
| Agent steps (streamed) | Cost from the stream's last chunk |
| Code-run coder | Spend read off its capped key at the end |
| Embeddings | Reported cost, or tokens × $0.02 per million |
| Call and meeting minutes | `durationSec` × `CALL_MINUTE` / `MEETING_MINUTE` |
| Browserbase | Minutes from session start to close, with a one-minute minimum |
| Modal sandbox | Minutes from boot to shutdown |
| Parallel | Per search (fast or advanced) and per page read |
| Voice typing | Clip length from its size (32 kbps) × Deepgram's rate |

Non-model prices live in `src/usage/prices.ts`. Each can be overridden with `PRICE_<NAME>`, and `PRICE_VERSION` is stamped on every estimated row.

## Money: revenue, costs, margins

**Tables:**

| Table | What it holds |
|---|---|
| `usage_events` | Every cost, with source, provider, model, tokens, seconds and the plan at the time. Estimated costs are flagged. |
| `usage_daily` | Daily totals of the ledger. Rebuild a range with `scripts/rebuild-usage-daily.ts`. |
| `plan_periods` | What someone paid for a stretch of time: `grossMicros` and `storeFeeMicros`. Written by `setPlan` now (list price), and by the store's webhook later (real amounts, with `externalId` for idempotency). |
| `fixed_costs` | Monthly bills that aren't any one person's (hosting, base fees), one row per month and vendor, entered by hand. |

**Views (migration 0027).** All money is in micro-dollars.

| View | What it shows |
|---|---|
| `v_revenue_month` | Each paid period spread over the months it covers. A yearly plan counts a twelfth in each month. |
| `v_cost_by_day` | Cost, tokens, seconds, events and number of users per day, plan, source, provider and model. |
| `v_user_margin` | Per person per month: gross, store fee, net, cost, margin and margin %. |
| `v_plan_margin` | Per plan per month: people, net revenue, cost, margin %, and p50/p90/max cost per person. |
| `v_profit_month` | Net revenue − usage cost = gross profit; minus fixed costs = profit. |

Accounts on `DEFAULT_PLAN` before payments have no `plan_periods`, so their cost appears with zero revenue, as pre-launch spend.

**Admin API.** Server to server only, with the `x-admin-key: $ADMIN_API_KEY` header. The routes are closed when `ADMIN_API_KEY` is unset.

| Route | What it does |
|---|---|
| `PUT /internal/users/:id/plan` | `{ plan, recordPayment?, grossMicros?, storeFeeMicros? }` |
| `GET /internal/finance/summary?from=YYYY-MM&to=YYYY-MM` | Monthly profit and per-plan margins |
| `GET /internal/finance/costs?from=YYYY-MM-DD&to=YYYY-MM-DD&groupBy=source\|provider\|model\|plan\|user\|day` | Costs grouped by any dimension |
| `GET /internal/finance/users/:id` | One person's months, recent costs and where they stand |

**Scripts** (`apps/api`):

| Command | What it does |
|---|---|
| `pnpm exec tsx scripts/set-plan.ts <email or user id> <plan> [--no-payment]` | Sets a plan by hand |
| `pnpm exec tsx scripts/usage-report.ts [days]` | Real usage against budgets |
| `pnpm exec tsx scripts/reconcile-costs.ts [YYYY-MM]` | Metered costs against provider bills |
| `pnpm exec tsx scripts/rebuild-usage-daily.ts <from> <to>` | Rebuilds the daily totals |

**Account deletion.** Personal rows are deleted. The money ledgers (`usage_events`, `usage_daily`, `plan_periods`) are kept so past months still add up, but their user id is replaced with a random one.

## In the app

- **Settings → Plan & usage** shows the plan, one bar per allowance with its reset time, and "See plans" (which opens `UPGRADE_URL` until in-app purchase exists).
- **Line above the composer** appears from 80% of an allowance, and again when someone is out. While they're out, sending is disabled.
- **A refused reply** shows why and when the person can pick it up, instead of "Try again". The app doesn't retry 402 or 429 responses.

## Plans and where they come from

A person can have a plan for more than one reason at once. Each reason is a **grant** in `plan_grants`, with one row per kind:

| Kind | Set by | Ends |
|---|---|---|
| `manual` | `setPlan()`, the `/internal` route or `scripts/set-plan.ts` | When we change it (`none` removes it) |
| `grandfather` | `scripts/grandfather.ts` at the start of enforcement | On its date (the 30-day grace period) |
| `revenuecat` | RevenueCat syncs (purchase, restore, webhook) | When the subscription lapses or is refunded |

**How grants combine:**
- **The plan in force** is the best active grant (Max > Pro > Plus > Starter). It's cached on `profiles.plan`, so every check still reads one column.
- **No active grant** means `DEFAULT_PLAN`. A subscription ending falls back to whatever else the person has, never below the default.
- **Expiry:** `profiles.plan_expires_at` holds the next time a grant lapses, and the every-minute dispatcher works the plan out again then (`expireGrants`).

## Payments (RevenueCat)

Purchases and restores in the app call `POST /v1/billing/sync`. RevenueCat also calls `POST /webhooks/revenuecat`. Both end in `syncFromRevenueCat` (`src/usage/revenuecat.ts`), which reads the customer's **current** state from RevenueCat and turns their best active subscription into the `revenuecat` grant.

**How it's kept safe:**
- **Unknown products** never grant or take away access. Products map to plans by name: `mates_<plan>_<monthly|yearly>`, `mates_starter_annual` and `rc_promo_<plan>_*`.
- **Sandbox receipts** count only when `REVENUECAT_ALLOW_SANDBOX=true`, which is for staging only.
- **Ordering:** an older RevenueCat state never overwrites a newer one (by RevenueCat's `request_date`), so a late webhook or a slow client sync can't undo a purchase.
- **Webhook events** are stored in `billing_events` (once each, by id) and answered at once. They're processed from there, and the dispatcher retries failures, up to 8 attempts with a growing wait.
- **Revenue:** production purchases, renewals and plan changes become `plan_periods` rows, with the real price, the store's commission and tax, and the real period (a year for yearly plans), keyed by transaction id. Refunds are recorded as the negative amounts RevenueCat sends, keyed `refund_<transaction_id>`. The finance views pick these up as they are.
