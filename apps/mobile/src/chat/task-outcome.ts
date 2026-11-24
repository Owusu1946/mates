import type { WorkflowCard } from "@expojet/api-contract";

type Code = NonNullable<WorkflowCard["code"]>;
type Computer = NonNullable<WorkflowCard["computer"]>;

/** Outcome copy for a terminal coding run. Active runs use their live activity label. */
export function codeOutcome(code: Code): string {
  if (code.status === "failed") return "Couldn’t finish";
  if (code.status === "cancelled") return "Stopped";
  if (code.pr?.draft) return "Draft pull request";
  if (code.checks.some(check => !check.passed)) return "Checks need attention";
  if (code.notes?.some(note => ["warning", "install_failed", "out_of_time"].includes(note.kind))) {
    return "Completed with warnings";
  }
  return code.pr ? "Ready for review" : "Completed";
}

export function computerOutcome(goal: Computer): string | null {
  if (goal.status === "done") return "Completed";
  if (goal.status === "failed") return "Couldn’t finish";
  if (goal.status === "cancelled") return "Stopped";
  if (goal.status !== "waiting") return null;
  switch (goal.waitingFor) {
    case "approval": return "Your approval is needed";
    case "login": return "Sign in to continue";
    case "question": return "Your answer is needed";
    case "user_control": return "You have control";
    default: return "Needs your input";
  }
}
