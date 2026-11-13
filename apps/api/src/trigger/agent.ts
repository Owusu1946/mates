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
    await publishOutbox();
    await deliverFindings();
    await deliverSlack().catch(() => console.warn("slack_delivery_failed"));
    return { checkedAt: new Date().toISOString() };
  },
});
