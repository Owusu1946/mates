import { tasks } from "@trigger.dev/sdk";
import { workerConfigured } from "../durable-runs.js";
import type { habitsJob, meetingPrep } from "../trigger/agent.js";
import { pruneActivity } from "./activity.js";
import { claimMining } from "./miner.js";
import { dispatchNudges } from "./nudges.js";
import { claimDuePreps, claimPrepSync } from "./prep.js";
import { habitsEnabled } from "./shared.js";

/**
 * The habits share of the every-minute dispatcher: nightly mining at each person's 3am, calendar
 * reads for meeting prep every few hours, preps coming due, and nudges coming due.
 */
export async function dispatchHabits(now = new Date()) {
  if (!habitsEnabled() || !workerConfigured()) return;
  const minute = Math.floor(now.getTime() / 60_000);
  const mine = await claimMining();
  const sync = await claimPrepSync();
  const jobs = [...mine.map((userId) => ({ userId, job: "mine" as const })), ...sync.filter((u) => !mine.includes(u)).map((userId) => ({ userId, job: "sync" as const }))];
  if (jobs.length)
    await tasks.batchTrigger<typeof habitsJob>("mate-habits", jobs.map((payload) => ({ payload, options: { idempotencyKey: `habits_${payload.job}_${payload.userId}_${minute}` } })));
  const preps = await claimDuePreps(now);
  if (preps.length)
    await tasks.batchTrigger<typeof meetingPrep>("mate-meeting-prep", preps.map((prepId) => ({ payload: { prepId }, options: { idempotencyKey: `prep_${prepId}` } })));
  await dispatchNudges(now);
  if (now.getUTCMinutes() === 17 && now.getUTCHours() % 6 === 0) await pruneActivity(now);
}
