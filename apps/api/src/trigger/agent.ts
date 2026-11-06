import { schemaTask, schedules } from "@trigger.dev/sdk";
import { z } from "zod";
import { executeDelegation, publishOutbox, recoverStalledRuns } from "../durable-runs.js";
import { dispatchDueRoutines } from "../scheduling.js";
import { deliverFindings } from "../delivery.js";
import { deliverReminders } from "../reminders.js";
import { executeCodeRun, recoverStalledCodeRuns } from "../code-runs.js";

export const agentExecution = schemaTask({
  id: "cooper-agent",
  schema: z.object({ delegationId: z.string().uuid() }),
  concurrency: { perKey: 1, total: 8 },
  retry: { maxAttempts: 1 }, // Do not replay an ambiguous external mutation.
  maxDuration: 720,
  run: async ({ delegationId }, { signal }) => {
    await executeDelegation(delegationId, signal ?? new AbortController().signal);
    await deliverFindings();
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

export const routineDispatcher = schedules.task({
  id: "cooper-dispatcher",
  cron: { pattern: "* * * * *", timezone: "UTC" },
  concurrency: { total: 1 },
  maxDuration: 120,
  retry: { maxAttempts: 3, minTimeoutInMs: 1000, maxTimeoutInMs: 10_000, factor: 2 },
  run: async () => {
    await recoverStalledRuns();
    await recoverStalledCodeRuns().catch(() => console.warn("code_run_recovery_failed"));
    await deliverReminders().catch(() => console.warn("reminder_delivery_failed"));
    await dispatchDueRoutines();
    await publishOutbox();
    await deliverFindings();
    return { checkedAt: new Date().toISOString() };
  },
});
