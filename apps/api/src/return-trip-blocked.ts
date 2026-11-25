import { sql } from "drizzle-orm";
import { getDb } from "./db/client.js";
import { pushReturnTripToUser } from "./delivery.js";

const REMINDER_DELAY_MS = 3 * 60 * 60_000;

/** Claims one reminder per unresolved waiting run across overlapping dispatcher ticks. */
export async function remindBlockedRuns(now = new Date()) {
  const due = await getDb().execute(sql`
    WITH claimed AS (
      SELECT d.id FROM delegations d
      WHERE d.status = 'waiting' AND d.blocked_since <= ${new Date(now.getTime() - REMINDER_DELAY_MS)}
        AND (d.blocked_reminder_at IS NULL OR (
          d.blocked_reminder_at <= ${new Date(now.getTime() - 2 * 60_000)}
          AND NOT EXISTS (SELECT 1 FROM proactive_notifications pn
            WHERE pn.source_key = 'return-trip:run:' || d.id::text || ':blocked-reminder')
        ))
        AND NOT EXISTS (
          SELECT 1 FROM delegations resumed
          WHERE resumed.clerk_user_id = d.clerk_user_id
            AND resumed.request->>'resumeRunId' = d.agent_run_id::text
        )
      ORDER BY d.blocked_since FOR UPDATE SKIP LOCKED LIMIT 50
    )
    UPDATE delegations d SET blocked_reminder_at = ${now}
    FROM claimed WHERE d.id = claimed.id
    RETURNING d.id, d.clerk_user_id AS "userId", d.chat_id AS "chatId"
  `) as unknown as { rows?: { id: string; userId: string; chatId: string | null }[] };
  for (const run of due.rows ?? []) {
    await pushReturnTripToUser({
      userId: run.userId, chatId: run.chatId, sourceKey: `run:${run.id}:blocked-reminder`,
      title: "A task still needs you", body: "Open Mates to make a decision and continue.",
      data: { chatId: run.chatId, delegationId: run.id },
    }).catch(() => console.warn("blocked_reminder_enqueue_failed", { id: run.id }));
  }
  const waiting = await getDb().execute(sql`
    SELECT g.id, g.clerk_user_id AS "userId", g.chat_id AS "chatId", g.mate_id AS "mateId", g.question
    FROM computer_goals g WHERE g.status = 'waiting' AND g.updated_at <= ${new Date(now.getTime() - REMINDER_DELAY_MS)}
      AND NOT EXISTS (SELECT 1 FROM proactive_notifications pn WHERE pn.source_key = 'return-trip:computer:' || g.id::text || ':blocked-reminder')
    ORDER BY g.updated_at LIMIT 50
  `) as unknown as { rows?: { id: string; userId: string; chatId: string | null; mateId: string | null; question: string | null }[] };
  for (const goal of waiting.rows ?? []) {
    await pushReturnTripToUser({
      userId: goal.userId, chatId: goal.chatId, mateId: goal.mateId,
      sourceKey: `computer:${goal.id}:blocked-reminder`, title: "Your computer task needs you",
      body: goal.question?.slice(0, 160) || "Open Mates to continue this task.",
      data: { chatId: goal.chatId, computerGoalId: goal.id },
    }).catch(() => console.warn("computer_reminder_enqueue_failed", { id: goal.id }));
  }
  const missionsDue = await getDb().execute(sql`
    SELECT m.id, m.clerk_user_id AS "userId", m.chat_id AS "chatId", m.question
    FROM missions m WHERE m.status = 'needs_input' AND m.updated_at <= ${new Date(now.getTime() - REMINDER_DELAY_MS)}
      AND NOT EXISTS (SELECT 1 FROM proactive_notifications pn WHERE pn.source_key = 'return-trip:mission:' || m.id::text || ':blocked-reminder')
    ORDER BY m.updated_at LIMIT 50
  `) as unknown as { rows?: { id: string; userId: string; chatId: string | null; question: string | null }[] };
  for (const mission of missionsDue.rows ?? []) {
    await pushReturnTripToUser({
      userId: mission.userId, chatId: mission.chatId, sourceKey: `mission:${mission.id}:blocked-reminder`,
      title: "Your team needs a decision", body: mission.question?.slice(0, 160) || "Open Mates to continue your mission.",
      data: { chatId: mission.chatId },
    }).catch(() => console.warn("mission_reminder_enqueue_failed", { id: mission.id }));
  }
}
