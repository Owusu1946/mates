import "../src/load-env.js";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../src/db/client.js";
import { agentRuns, chats, delegations, findings, routines } from "../src/db/schema.js";
import { claimRoutineOccurrence } from "../src/scheduling.js";
import { ownedRun, publishOutbox, runSnapshot } from "../src/durable-runs.js";

const db = getDb();
const user = `cooper_smoke_${randomUUID()}`;
const mode = process.argv[2] ?? "claim";
const spec = { title: "Worker smoke check", prompt: "Reply with exactly COOPER_WORKER_OK. Do not use any tools.", frequency: "once", timezone: "Africa/Accra", time: "12:00", weekday: null, onceAt: new Date(Date.now() - 1000).toISOString() };
let finished = false;
try {
  const [routine] = await db.insert(routines).values({ clerkUserId: user, title: spec.title, spec, status: "active", nextRunAt: new Date(spec.onceAt) }).returning();
  const claim = async () => {
    const id = randomUUID();
    const chatId = `smoke_${id}`;
    const request = { messages: [{ role: "user", content: spec.prompt }], chatId, requestKey: `smoke_${id}`, assistantMessageId: `assistant_${id}`, parentId: `user_${id}` };
    await claimRoutineOccurrence(routine!, null, id, chatId, spec.prompt, request, new Date());
  };
  await Promise.all([claim(), claim()]);
  const jobs = await db.select().from(delegations).where(eq(delegations.clerkUserId, user));
  if (jobs.length !== 1) throw new Error("Atomic schedule claim did not produce exactly one job");
  if (await ownedRun("another_owner", jobs[0]!.id)) throw new Error("Ownership isolation failed");
  console.log("PASS: concurrent claims produced one occurrence/job/outbox; other owner cannot read it.");
  if (mode === "hosted") {
    process.env.COOPER_BACKGROUND_ENABLED = "true";
    await publishOutbox(jobs[0]!.id);
    const started = Date.now();
    while (Date.now() - started < 240_000) {
      const snapshot = await runSnapshot(user, jobs[0]!.id);
      if (!snapshot) throw new Error("Job disappeared");
      if (["completed", "failed", "waiting", "cancelled"].includes(snapshot.run.status)) {
        finished = true;
        const text = snapshot.run.content.filter(p => p.type === "text").map(p => String(p.text)).join("");
        const saved = await db.select().from(findings).where(eq(findings.delegationId, jobs[0]!.id));
        if (snapshot.run.status !== "completed" || !text.includes("COOPER_WORKER_OK") || !saved.length || !snapshot.events.length) throw new Error(`Hosted smoke failed: ${snapshot.run.status}; ${snapshot.run.error ?? "missing expected result/events/feed entry"}`);
        console.log("PASS: deployed worker completed; result, events and feed entry persisted without a phone connection.");
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    if (!finished) throw new Error("Hosted worker did not complete within four minutes");
  } else finished = true;
} finally {
  if (finished) {
    await db.delete(routines).where(eq(routines.clerkUserId, user));
    await db.delete(delegations).where(eq(delegations.clerkUserId, user));
    await db.delete(agentRuns).where(eq(agentRuns.clerkUserId, user));
    await db.delete(chats).where(eq(chats.clerkUserId, user));
    console.log("Smoke records removed.");
  } else {
    await db.update(delegations).set({ cancelRequested: true }).where(and(eq(delegations.clerkUserId, user), eq(delegations.status, "running")));
    await db.update(routines).set({ status: "cancelled" }).where(eq(routines.clerkUserId, user));
    console.log("Incomplete smoke records retained for diagnosis; no recurring schedule remains active.");
  }
}
