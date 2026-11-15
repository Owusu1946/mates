import type { WorkflowCard } from "@expojet/api-contract";

/**
 * What a coding run shows, worked out from the card the server sends: the one-line status (what
 * the computer is doing right now) and its steps, each with the activity lines that belong to it.
 * The server records activity without saying which step each line is from, so lines are grouped
 * by the markers it does write: "Starting the coder", "<check> passed", "Pushing …" and so on.
 */
export type Code = NonNullable<WorkflowCard["code"]>;
export type StepId = "setup" | "coding" | "checks" | "pr";
export type StepState = "done" | "current" | "failed" | "stopped" | "todo";
export type Step = { id: StepId; label: string; state: StepState; lines: string[] };

export const ACTIVE: Code["status"][] = ["queued", "cloning", "coding", "checking", "pushing"];

const LABELS: Record<StepId, { doing: string; done: string; todo: string }> = {
  setup: { doing: "Setting up the computer", done: "Set up the computer", todo: "Set up the computer" },
  coding: { doing: "Writing the code", done: "Wrote the code", todo: "Write the code" },
  checks: { doing: "Running checks", done: "Ran checks", todo: "Run checks" },
  pr: { doing: "Opening the pull request", done: "Opened the pull request", todo: "Open the pull request" },
};
const ORDER: StepId[] = ["setup", "coding", "checks", "pr"];

/** Which step a run status is in. */
function stepOf(status: Code["status"]): StepId | null {
  if (status === "queued" || status === "cloning") return "setup";
  if (status === "coding") return "coding";
  if (status === "checking") return "checks";
  if (status === "pushing") return "pr";
  return null;
}

const CHECK_RESULT = /^(.+) (passed|failed)$/;
const PR = /^(Pushing |Opening the pull request|Updating the pull request|Opened |Updated )/;

/** Splits activity lines into steps, in order. Lines before the coder starts belong to setup. */
export function groupActivity(lines: string[]): Record<StepId, string[]> {
  const groups: Record<StepId, string[]> = { setup: [], coding: [], checks: [], pr: [] };
  let current: StepId = "setup";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (PR.test(line)) current = "pr";
    else if (/^(Starting the coder|Fixing )/.test(line)) current = "coding";
    else if (current !== "setup" && current !== "pr") {
      const result = CHECK_RESULT.exec(line);
      // "<cmd> passed/failed" is written only by the run's own checks; its "Running <cmd>" just
      // before it is part of the check too, not the coder's.
      if (result) {
        const previous = groups.coding.at(-1);
        if (previous === `Running ${result[1]}`) groups.coding.pop(), groups.checks.push(previous);
        groups.checks.push(line);
        continue;
      }
    }
    groups[current].push(line);
  }
  return groups;
}

/** The steps to show, with their states, for any run status (running, done, failed or stopped). */
export function stepsOf(code: Code): Step[] {
  const groups = groupActivity((code.activity ?? []).map((line) => line.text));
  const now = stepOf(code.status);
  const ended = !ACTIVE.includes(code.status);
  // A run that ended early stopped in the last step that has anything in it.
  const last = [...ORDER].reverse().find((id) => groups[id].length) ?? "setup";
  const reached = (id: StepId) => (now ? ORDER.indexOf(id) <= ORDER.indexOf(now) : code.status === "done" || ORDER.indexOf(id) <= ORDER.indexOf(last));
  return ORDER.filter((id) => id !== "checks" || code.checks.length > 0 || groups.checks.length > 0 || (!ended && now === "checks"))
    .map((id) => {
      let state: StepState;
      if (code.status === "done") state = "done";
      else if (!ended) state = id === now ? "current" : reached(id) ? "done" : "todo";
      else if (id === last) state = code.status === "cancelled" ? "stopped" : "failed";
      else state = reached(id) ? "done" : "todo";
      const label = state === "current" ? LABELS[id].doing : state === "todo" ? LABELS[id].todo : LABELS[id].done;
      return { id, label: state === "failed" || state === "stopped" ? LABELS[id].doing : label, state, lines: groups[id] };
    });
}

/** "Reading src/app.tsx" → "Reading src/app.tsx…"; never doubles punctuation. */
const ongoing = (text: string) => (/[.…!?]$/.test(text) ? text : `${text}…`);

/** The one line shown for the run: what it's doing now, or how it ended. */
export function headlineOf(code: Code): string {
  if (code.status === "done") return code.pr ? `${code.pr.draft ? "Opened draft PR" : "Opened PR"} #${code.pr.number}${code.pr.draft ? " · needs attention" : ` · ${code.pr.title}`}` : "Done";
  if (code.status === "failed") return "Couldn’t finish";
  if (code.status === "cancelled") return "Stopped";
  if (code.status === "queued") return "Waiting for the computer…";
  // The newest thing the computer printed, when there is one; otherwise the step.
  const latest = code.activity?.at(-1)?.text;
  const now = stepOf(code.status);
  return ongoing(latest && !/ (passed|failed)$/.test(latest) ? latest : now ? LABELS[now].doing : "Working");
}
