import type { WorkflowCard } from "@expojet/api-contract";

/** Keep the same signed-in account in the same cohort across devices and launches. */
export function quietChatActivity(mode: string | undefined, userId: string | null | undefined): boolean {
  if (mode === "detailed") return false;
  if (mode !== "split" || !userId) return true;
  let hash = 2166136261;
  const key = `chat-activity-v1:${userId}`;
  for (let i = 0; i < key.length; i++) {
    hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  }
  return (hash >>> 0) < 0x80000000;
}

/** User decisions, errors, and completed outcomes stay where the mate put them. */
export function isRoutineActivity(card: WorkflowCard | undefined): boolean {
  return card?.kind === "step"
    && (card.phase === "running" || card.phase === "done")
    && card.stage !== "summary"
    && !card.approval
    && !card.approvalFields?.length
    && !card.options?.length
    && !card.resumeRunId;
}
