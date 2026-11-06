import "../src/load-env.js";
import { runs, schedules } from "@trigger.dev/sdk";
import { like, eq } from "drizzle-orm";
import { getDb } from "../src/db/client.js";
import { delegations, submissionOutbox } from "../src/db/schema.js";
import { workerConfigured, publishOutbox } from "../src/durable-runs.js";
if (process.argv[2] === "publish-smoke") {
  process.env.COOPER_BACKGROUND_ENABLED = "true";
  console.log("Worker configured:", workerConfigured(), "Trigger key present:", !!process.env.TRIGGER_SECRET_KEY);
  const smokeJobs = await getDb().select({ id: delegations.id }).from(delegations).where(like(delegations.clerkUserId, "cooper_smoke_%"));
  for (const job of smokeJobs) await publishOutbox(job.id);
}
const recent = await runs.list({ limit: 10 });
console.log(JSON.stringify(recent.data.map(run => ({ id: run.id, task: run.taskIdentifier, status: run.status })), null, 2));
const configured = await schedules.list({ perPage: 20 });
console.log(JSON.stringify(configured.data.map(schedule => ({ id: schedule.id, task: schedule.task, cron: schedule.generator, active: schedule.active, nextRun: schedule.nextRun, effective: schedule.nextRunEffectiveAt, policy: schedule.appliedSchedulePolicy })), null, 2));
console.log("Laptop clock:", new Date().toISOString());
console.log(JSON.stringify(await getDb().select({ id: delegations.id, status: delegations.status, createdAt: delegations.createdAt, nextAttempt: submissionOutbox.nextAttemptAt, providerRun: delegations.providerRunId, error: delegations.error, lease: submissionOutbox.leaseUntil, submitted: submissionOutbox.submittedAt, attempts: submissionOutbox.attempts }).from(delegations).leftJoin(submissionOutbox, eq(submissionOutbox.delegationId, delegations.id)).where(like(delegations.clerkUserId, "cooper_smoke_%")), null, 2));
