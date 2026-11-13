# Watches: "watch for X, then do Y"

A user tells a mate "Watch for a 5% drop in BTC and email me when it happens". The mate sets up a watch. It fires **once** when the condition is met: a push notification arrives straight away, and a run in the chat carries out the action the user asked for when they set it up. After that the watch stops.

## How it works

It follows the same two patterns Zapier and IFTTT use.

### Web watches: checked on a timer
**Setup:**
1. One short model call writes 1–3 search queries.
2. A first check records the **baseline**, e.g. "BTC $96,400". That gives relative conditions like "5% drop" a starting point.
3. If the condition is already true, the user is told so and no watch is created.

**Each check:**
1. One fast Parallel search, about $0.001.
2. A structured judgement on luna, about $0.0005. It returns `{ met, confidence, note, evidence }`.

**It fires only if all three hold:**
- `met` is true;
- `confidence` is at least 0.7;
- there's at least one quote from a source. Any number in the condition must appear in a quote.

**Scheduling:**
- The every-minute `cooper-dispatcher` claims due checks atomically, using `FOR UPDATE SKIP LOCKED`, and moves each watch's next check forward first. That way every check runs exactly once.
- The checks themselves run in the `mate-watch-check` Trigger task.

### App watches: Composio triggers
- At setup, the mate lists the app's real events with `cooper_watch_triggers`, then creates a trigger narrowed to the condition where possible (e.g. a Gmail query).
- Gmail and Google Calendar push events in real time. Slack, GitHub and others either push or are polled by Composio, at most every 2 minutes.
- Events arrive at `POST /v1/composio/webhook`, which checks Composio's signature. Each event is judged once: a redelivered event is skipped by its event id.

### Firing
- **One SQL statement** marks the watch `fired` and queues its run in its chat. This uses the same claim pattern as routines, so a watch can never fire twice.
- **Busy chat:** if the chat already has a run going, the firing is saved as `pendingFire` and the dispatcher starts it on a later tick, without checking again.
- **The run's prompt** gives the evidence and the approved action only: "Don't take any other external action".
- **In the chat**, the run's turn shows as a "Watch triggered" marker.
- **Usage:** the run is charged to the `watch` source.

## Limits (`apps/api/src/usage/plans.ts`, `WATCH_LIMITS`)

| Plan | Active watches | Fastest web check |
|---|---|---|
| Starter | none (the mate explains watches come with Plus) | — |
| Plus | 5 | every 4 hours |
| Pro | 15 | every 2 hours |
| Max | 40 | every hour |

**Other rules:**
- **Pace:** the mate picks the check interval, never faster than the plan allows and never slower than daily.
- **Expiry:** watches stop after 30 days. A push goes out the day before, and "Keep watching" renews for another 30.
- **Out of usage:** checks are skipped while the person is out of usage ("Paused until your usage resets") and resume after the reset.
- **App events while out of usage:** they're still judged. A judgement costs a fraction of a cent, and an event can't be replayed later.
- **A firing always runs,** even when the person is out of usage. It's a single action they asked for in advance.

## Where it lives

**API**
- `apps/api/src/watches.ts`: the tools, `createWatch`, `runCheck` and `checkWatch`, `handleWatchEvent`, `fireWatch`, `dispatchWatches` (with expiry), the controls and the card.
- **Tables:** `watches` and `watch_events` (migration 0028).
- **Routes:**
  - `GET /v1/watches`
  - `GET /v1/watches/:id/events`
  - `POST /v1/watches/:id/control` (`pause | resume | cancel | renew`, versioned)
  - `POST /v1/composio/webhook`
- **Agent:** the `cooper_watch` and `cooper_watch_triggers` tools. The routine instructions now send conditional requests to watches.

**Mobile**
- `src/chat/watch-card.tsx`: the chat card.
- `src/watches/use-watches.ts`: the shared data hook.
- **Routines screen:** the "Watching" section, with a switch to pause or resume and a tap for details or to stop.

**Scripts** (in `apps/api`):

| Command | What it does |
|---|---|
| `pnpm exec tsx scripts/watch-check.ts <id>` | Runs a watch's check now, for testing |
| `pnpm exec tsx scripts/composio-webhook.ts https://<api-host>` | Registers the webhook, once per environment |

## Deploy
1. Run `pnpm --filter @expojet/api db:migrate`.
2. Deploy the API, then the worker (`worker:deploy`).
3. **For app watches:** run `scripts/composio-webhook.ts` once, then put the secret it prints on Railway (API service) as `COMPOSIO_WEBHOOK_SECRET`. Web watches work without it.
4. **No new app build** is needed; the mobile changes are JavaScript only.
