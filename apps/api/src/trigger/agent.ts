import { schemaTask, schedules } from "@trigger.dev/sdk";
import { z } from "zod";
import { executeDelegation, publishOutbox, recoverStalledRuns } from "../durable-runs.js";
import { dispatchDueRoutines } from "../scheduling.js";
import { deliverFindings } from "../delivery.js";
import { deliverSlack } from "../slack-delivery.js";
import { deliverReminders } from "../reminders.js";
import { executeCodeRun, recoverStalledCodeRuns } from "../code-runs.js";
import { executeDeck, executeDeckEdit, recoverStalledDecks } from "../decks.js";
import { checkWatch, dispatchWatches } from "../watches.js";
import { dispatchHabits } from "../habits/dispatch.js";
import { expireGrants } from "../usage/grants.js";
import { processBillingEvents } from "../usage/revenuecat.js";
import { mineHabits } from "../habits/miner.js";
import { runPrep, syncPreps } from "../habits/prep.js";

export const agentExecution = schemaTask({
  id: "cooper-agent",
  schema: z.object({ delegationId: z.string().uuid() }),
  concurrency: { perKey: 1, total: 8 },
  retry: { maxAttempts: 1 }, // Do not replay an ambiguous external mutation.
  maxDuration: 720,
  run: async ({ delegationId }, { signal }) => {
    await executeDelegation(delegationId, signal ?? new AbortController().signal);
    await deliverFindings();
    await deliverSlack().catch(() => console.warn("slack_delivery_failed"));
    return { delegationId };
  },
});

/** One job on the mates' computer. Long, and never retried: a push isn't safe to replay. */
export const codeExecution = schemaTask({
  id: "cooper-code",
  schema: z.object({ runId: z.string().uuid() }),
  concurrency: { perKey: 1, total: 3 },
  retry: { maxAttempts: 1 },
  maxDuration: 3600,
  run: async ({ runId }, { signal }) => {
    await executeCodeRun(runId, signal ?? new AbortController().signal);
    return { runId };
  },
});

/** Builds a deck. Safe to retry: it rewrites only its own row from the start. */
export const deckBuild = schemaTask({
  id: "mate-deck",
  schema: z.object({ deckId: z.string().uuid() }),
  concurrency: { perKey: 1, total: 10 },
  retry: { maxAttempts: 2 },
  maxDuration: 600,
  run: async ({ deckId }, { signal }) => {
    await executeDeck(deckId, signal ?? new AbortController().signal);
    return { deckId };
  },
});

/** Changes some slides of a deck and saves a new version. */
export const deckEdit = schemaTask({
  id: "mate-deck-edit",
  schema: z.object({ deckId: z.string().uuid(), instruction: z.string().min(1).max(2_000), slideIds: z.array(z.string()).nullable() }),
  concurrency: { perKey: 1, total: 10 },
  retry: { maxAttempts: 1 },
  maxDuration: 300,
  run: async ({ deckId, instruction, slideIds }, { signal }) => {
    await executeDeckEdit(deckId, instruction, slideIds, signal ?? new AbortController().signal);
    return { deckId };
  },
});

/** One scheduled check of a web watch: a search and a judgement. Never retried; the next check comes anyway. */
export const watchCheck = schemaTask({
  id: "mate-watch-check",
  schema: z.object({ watchId: z.string().uuid() }),
  concurrency: { total: 10 },
  retry: { maxAttempts: 1 },
  maxDuration: 120,
  run: async ({ watchId }) => {
    await checkWatch(watchId);
    return { watchId };
  },
});

/** One person's nightly habit mining (with a calendar read for meeting prep), or just the calendar read. */
export const habitsJob = schemaTask({
  id: "mate-habits",
  schema: z.object({ userId: z.string().min(1), job: z.enum(["mine", "sync"]) }),
  concurrency: { total: 5 },
  retry: { maxAttempts: 2 },
  maxDuration: 180,
  run: async ({ userId, job }) => {
    if (job === "mine") await mineHabits(userId);
    await syncPreps(userId).catch((error) => console.warn("prep_sync_failed", { message: error instanceof Error ? error.message : String(error) }));
    return { userId, job };
  },
});

/** A meeting prep brief, posted 20 minutes before the meeting. Not retried: a late brief is no use. */
export const meetingPrep = schemaTask({
  id: "mate-meeting-prep",
  schema: z.object({ prepId: z.string().uuid() }),
  concurrency: { total: 10 },
  retry: { maxAttempts: 1 },
  maxDuration: 120,
  run: async ({ prepId }) => {
    await runPrep(prepId);
    return { prepId };
  },
});

export const routineDispatcher = schedules.task({
  id: "cooper-dispatcher",
  cron: { pattern: "* * * * *", timezone: "UTC" },
  concurrency: { total: 1 },
  maxDuration: 120,
  retry: { maxAttempts: 3, minTimeoutInMs: 1000, maxTimeoutInMs: 10_000, factor: 2 },
  run: async () => {
    await recoverStalledRuns();
    await recoverStalledCodeRuns().catch(() => console.warn("code_run_recovery_failed"));
    await recoverStalledDecks().catch(() => console.warn("deck_recovery_failed"));
    await deliverReminders().catch(() => console.warn("reminder_delivery_failed"));
    await dispatchDueRoutines();
    await dispatchWatches().catch((error) => console.warn("watch_dispatch_failed", { message: error instanceof Error ? error.message : String(error) }));
    // Billing: store events not yet processed (or failed and due a retry), and plans whose grant lapsed.
    await processBillingEvents().catch((error) => console.warn("billing_events_failed", { message: error instanceof Error ? error.message : String(error) }));
    await expireGrants().catch((error) => console.warn("grant_expiry_failed", { message: error instanceof Error ? error.message : String(error) }));
    await dispatchHabits().catch((error) => console.warn("habits_dispatch_failed", { message: error instanceof Error ? error.message : String(error) }));
    await publishOutbox();
    await deliverFindings();
    await deliverSlack().catch(() => console.warn("slack_delivery_failed"));
    return { checkedAt: new Date().toISOString() };
  },
});
