# Habits: mates learn how you work and offer to handle it

A mate notices what you do regularly ("you plan your week on Monday mornings", "you email a recap after meetings", "you read about fintech in Ghana most mornings") and offers to do it. It sends a push that opens its chat: *"You usually plan your week around now. Want me to handle it?"* The chat shows **Handle it · Not today · Stop suggesting**. After a few "Handle it"s, it also offers **Make it automatic**.

Before calendar meetings with other people, the lead mate posts a short **meeting prep** brief and offers to join and take notes.

Everything it learned is on **Settings → What I've noticed**, where it can be confirmed, moved, paused or removed.

## How it works

It follows the same split as ChatGPT (memory, "dreaming" and Pulse), Dots and Google Now: a log of what happened, a nightly job that finds patterns, timely offers with feedback, and a page where you can see and control all of it.

### 1. The activity log (`activity_events`)
Metadata only, never message bodies. It's kept 90 days.

| What | Where it's recorded | Notes |
|---|---|---|
| What you ask a mate for | after each finished run (`recordRunActivity`, `durable-runs.ts`) | One small model call names the task (`plan_week`), reusing your existing names, so repeats line up. It also picks a topic, if there is one. Routine, watch and habit runs are skipped. |
| What mates did in your apps | the same run | Each write action, e.g. `GMAIL_SEND_EMAIL`. |
| Calls and meetings | `finishCall` (`calls.ts`) | Uses the prepped meeting's title when there was one. |
| What you open in the app | `POST /v1/activity`, batched every 30 seconds (`src/habits/report-reads.ts`) | Feed results, decks, call transcripts, source links. Titles only. |
| Mail you send (opt in, Plus) | Composio observer trigger on Gmail's SENT label | Only a short key for who it went to (`email_acme`), never the address or content. |
| Calendar changes (opt in, Plus) | Composio observer trigger on Google Calendar | Refreshes meeting prep. |

**Not tracked:** emails you *read*. Apps report new mail, not whether you opened it, and it's the most invasive signal there is.

### 2. The nightly miner (`habits/miner.ts`)
At 3am in each person's timezone, the dispatcher claims them and the `mate-habits` worker task runs. Patterns are found **by counting, not by the model**:

- **Time habits:**
  - at least 3 days, across at least 2 weeks;
  - within 90 minutes of the usual time;
  - on weekdays seen in at least half the weeks since it started.
  - The offer comes at the earlier quarter of the usual times, so it lands just before you'd do it.
- **Follow-ups:** a task that comes after at least 60% of meetings, calls or app events, at least 3 times, within 2 hours.
- **Topics:** asked about or opened at least 3 times on 2 different days. A topic read at a regular time becomes a "short digest?" offer.

**The score** combines regularity, how tight the times are, and how often it happened. Feedback then moves it: each "Handle it" raises it, and skips lower it.

**One model call per person per night** (about $0.002) then describes the patterns in plain words: a title, the offer line, and the task to run. It drops anything about health, religion, sexuality, politics, money trouble, legal matters or other people's private matters, and anything a routine or watch already covers.

**Housekeeping:**
- Candidates not seen for 4 weeks are let go.
- Removed habits stay removed, so they're never learned again.

### 3. Nudges (`habits/nudges.ts`)
Every minute the dispatcher claims time habits coming due. It moves each one to its next occurrence first, so it's offered once.

**A nudge is sent only when all of these hold:**
- learning is on (both the "Learn my habits" switch and the Memory main switch);
- the habit is confirmed, or a candidate that's at least 80% sure;
- it **wasn't already done today**;
- the phone **isn't in quiet hours**;
- it's under **2 nudges today**;
- the chat isn't mid-run.

If the time passed more than an hour ago (for example, the worker was down), it just moves on.

**What a nudge is:** a message in the mate's chat plus a push that opens it. There's no run and no model cost.

**The buttons** (`POST /v1/habits/nudges/:id`):
- **Handle it:** the app puts the task in the composer and sends it, so it streams like any message, with your usual approval rules. The habit becomes confirmed.
- **Not today:** counts as a skip.
- **Stop suggesting:** dismissed for good.
- **Make it automatic** (offered from the third time): a time habit becomes routines, one per weekday, in that mate's chat. A follow-up habit is then done straight after its event.

**Follow-up habits** are offered the moment the event happens: a meeting ends in `finishCall`, or mail is sent through the observer.

### 4. Meeting prep (`habits/prep.ts`), Plus and up
**Reading the calendar:**
- The next 24 hours of Google Calendar are read every 3 hours, nightly, and whenever the calendar observer fires.
- Events count only if they're timed, not declined, and have at least one other person who isn't a room.

**20 minutes before:** the `mate-meeting-prep` task gathers:
- earlier chats and meeting notes (recall);
- the last few meeting summaries;
- the subjects and dates of mail with the attendees over the last 30 days, read only;
- meeting-related habits.

One model call (metered as `prep`, about $0.01) writes:
- the brief;
- what's still open;
- when you last spoke to each person;
- what you usually do.

**Then:** the lead mate posts it with **Send <mate> to take notes** when there's a meeting link. At most 6 a day.

**If a mate joins that meeting,** the brief goes into its meeting instructions (`callContext.brief` → `meetingInstructions`), so it knows the people and the open items.

## Limits and costs

| | Plan | Limit | Cost |
|---|---|---|---|
| Learning from use, nudges | every plan | 2 nudges a day | about $0.0003 a request + $0.002 a night |
| Learning from apps | Plus and up | opt in | free (Composio triggers) |
| Meeting prep | Plus and up | 6 a day | about $0.01 each |

Usage is metered under the `habit` and `prep` sources, so it shows up in the margin views.

## Privacy
- Every habit says why ("seen 5 Mondays") and can be removed. Nothing is done without a tap, or without it having been made automatic.
- **Switches:**
  - Turning off **Learn my habits** stops learning and clears what was learned. Turning off Memory pauses it.
  - Turning off **Learn from my apps** deletes the observer triggers and everything that came from apps.
  - **Clear everything** deletes habits, topics, nudges, the activity log and upcoming preps at once.
- **Account deletion** removes all the habit tables and the observer triggers.

## Where it lives

**API** (`apps/api/src/habits/`)

| File | What it does |
|---|---|
| `shared.ts` | The flag, the switches, timezone, the small model call |
| `activity.ts` | Recording runs and reads, "done today", pruning |
| `miner.ts` | Patterns, topics, the nightly description, the 3am claim |
| `nudges.ts` | Sending, the dispatcher, follow-ups, the buttons, making it automatic |
| `prep.ts` | Calendar sync, the due claim, the brief, the brief for a joining mate |
| `observers.ts` | "Learn from my apps" triggers and their events |
| `manage.ts` | The "What I've noticed" list, changes, settings, clear everything |
| `dispatch.ts` | Its share of the every-minute dispatcher |

**Tables** (migration 0029):
- `activity_events`, `habits`, `habit_nudges`, `interests`, `meeting_preps`;
- `profiles` gains `habit_learning`, `learn_from_apps`, `meeting_prep`, `observer_triggers`, `habits_mined_at` and `preps_synced_at`.

**Routes:**
- `GET /v1/habits`
- `PATCH /v1/habits/:id` (`confirm | pause | resume | retime`, versioned)
- `DELETE /v1/habits/:id`
- `DELETE /v1/habits`
- `DELETE /v1/habits/topics/:topic`
- `POST /v1/habits/settings`
- `POST /v1/habits/nudges/:id`
- `POST /v1/activity`

**Worker:** the `mate-habits` and `mate-meeting-prep` tasks, plus `dispatchHabits` in `cooper-dispatcher`.

**Voice agent:** `brief` in the call context, used in `meetingInstructions`.

**Mobile**
- `src/chat/nudge-card.tsx` and `src/chat/meeting-prep-card.tsx`
- `app/(app)/noticed.tsx` ("What I've noticed"), linked from Settings and Memory
- `src/habits/use-habits.ts` and `src/habits/report-reads.ts`

## Deploy
1. Run `pnpm --filter @expojet/api db:migrate`.
2. Deploy the API, the worker (`worker:deploy`) and the voice agent.
3. On Railway, set `HABITS_ENABLED=true` on **both the API and the worker**. Leave it unset to ship dark: nothing is recorded or sent, and the page says it's being switched on.
4. "Learn from my apps" uses the same Composio webhook as app watches, so `COMPOSIO_WEBHOOK_SECRET` must already be set.
5. **No new app build** is needed; the mobile changes are JavaScript only.

## Trying it on a dev build
1. Turn on `HABITS_ENABLED`, then ask a mate to "plan my week" on a few different Mondays (or insert `activity_events` rows with `kind = 'ask'` and `task_key = 'plan_week'`).
2. Run the miner for yourself: `pnpm exec tsx -e "import('./src/habits/miner.ts').then(m => m.mineHabits('<user id>'))"`. The habit appears in What I've noticed.
3. Set its `next_due_at` to a minute from now. A push arrives and opens the chat with the nudge.
4. For meeting prep (on Plus), add a calendar event with another attendee 25 minutes ahead. The brief arrives 20 minutes before.
