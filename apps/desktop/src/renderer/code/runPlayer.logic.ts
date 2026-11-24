import type { Run, RunItem, ScriptEvent, Step } from "../data/sampleRuns.ts";

/**
 * A coding run without a code host: the mate's script plays one event at a time. Steps gather
 * into a live work group (T3 Code's "work-live" row), an approval closes the group and waits for
 * you, a message closes it too, and the changes card lists every patch that landed. Timers live in
 * useRunPlayer; this only decides what each step does.
 */

export type LiveGroup = { id: string; startedAt: number; steps: Step[]; current: Step | null };

export type RunState = {
  items: RunItem[];
  queue: ScriptEvent[];
  live: LiveGroup | null;
  /** The open approval's id, while the run waits on you. */
  waitingOn: string | null;
  /** Reply for a denied approval, from the event that asked. */
  deniedReply: string | null;
  patchIds: string[];
  /** Output played into each terminal, by terminal id. */
  terminalOutput: Record<string, string[]>;
  started: boolean;
  turns: number;
};

export type RunsState = Record<string, RunState>;

export type RunAction =
  | { type: "start"; runId: string; at: number }
  | { type: "advance"; runId: string; at: number }
  | { type: "answer"; runId: string; approvalId: string; allow: boolean; at: number }
  | { type: "stop"; runId: string; at: number }
  | { type: "followUp"; runId: string; text: string; script: ScriptEvent[]; at: number }
  | { type: "create"; run: Run };

export function initialRunState(run: Run): RunState {
  const open = run.items.find((item): item is Extract<RunItem, { type: "approval" }> => item.type === "approval" && item.state === "open");
  return {
    items: run.items,
    queue: run.script,
    live: null,
    waitingOn: open?.id ?? null,
    deniedReply: open ? "OK, I won't run it. Tell me another way you'd like me to go." : null,
    patchIds: run.patchIds,
    terminalOutput: Object.fromEntries(run.terminals.map((terminal) => [terminal.id, terminal.outputIds])),
    // A run that's waiting on you has already started; only a fresh one waits to be opened.
    started: Boolean(open) || run.script.length === 0,
    turns: 0,
  };
}

export const initialRuns = (runs: Run[]): RunsState => Object.fromEntries(runs.map((run) => [run.id, initialRunState(run)]));

/** Whether the run has more to do right now (not finished, not waiting on you). */
export const isPlaying = (state: RunState) => state.started && !state.waitingOn && (state.queue.length > 0 || state.live?.current != null);

export type RunStatus = "working" | "waiting" | "done" | "ready";
export function runStatus(state: RunState): RunStatus {
  if (state.waitingOn) return "waiting";
  if (!state.started) return "ready";
  return isPlaying(state) ? "working" : "done";
}

/** The current step settles into the group; a closed group becomes a timeline item. */
function closeGroup(state: RunState, at: number): RunState {
  const live = state.live;
  if (!live) return state;
  const steps = live.current ? [...live.steps, live.current] : live.steps;
  if (!steps.length) return { ...state, live: null };
  return { ...state, live: null, items: [...state.items, { type: "work", id: live.id, steps, durationMs: at - live.startedAt }] };
}

/** Command output goes to the run's first terminal, as a run's commands share one. */
function withOutput(state: RunState, outputId: string | undefined): RunState {
  if (!outputId) return state;
  const terminalId = Object.keys(state.terminalOutput)[0];
  if (!terminalId) return state;
  return { ...state, terminalOutput: { ...state.terminalOutput, [terminalId]: [...state.terminalOutput[terminalId]!, outputId] } };
}

function advance(state: RunState, at: number): RunState {
  const [event, ...queue] = state.queue;
  if (!event) return closeGroup(state, at);
  const next = { ...state, queue };
  switch (event.type) {
    case "step": {
      const live = next.live ?? { id: `g${next.items.length}-${at}`, startedAt: at, steps: [], current: null };
      const steps = live.current ? [...live.steps, live.current] : live.steps;
      const withPatch = event.step.patchId && !next.patchIds.includes(event.step.patchId) ? { ...next, patchIds: [...next.patchIds, event.step.patchId] } : next;
      return withOutput({ ...withPatch, live: { ...live, steps, current: event.step } }, event.step.outputId);
    }
    case "approval": {
      const closed = closeGroup(next, at);
      return { ...closed, waitingOn: event.id, deniedReply: event.denied, items: [...closed.items, { type: "approval", id: event.id, command: event.command, reason: event.reason, state: "open" }] };
    }
    case "message": {
      const closed = closeGroup(next, at);
      return { ...closed, items: [...closed.items, { type: "message", id: `m${closed.items.length}-${at}`, author: "mate", text: event.text }] };
    }
    case "changes":
      return next.patchIds.length ? { ...next, items: [...next.items, { type: "changes", id: `c${next.items.length}-${at}`, patchIds: next.patchIds }] } : next;
  }
}

function update(state: RunsState, runId: string, change: (run: RunState) => RunState): RunsState {
  const run = state[runId];
  if (!run) return state;
  const next = change(run);
  // Unchanged runs keep their identity, so nothing showing them re-renders.
  return next === run ? state : { ...state, [runId]: next };
}

export function runsReducer(state: RunsState, action: RunAction): RunsState {
  switch (action.type) {
    case "create":
      return { ...state, [action.run.id]: { ...initialRunState(action.run), started: true } };
    case "start":
      return update(state, action.runId, (run) => (run.started ? run : { ...run, started: true }));
    case "advance":
      return update(state, action.runId, (run) => (isPlaying(run) ? advance(run, action.at) : run));
    case "answer":
      return update(state, action.runId, (run) => {
        if (run.waitingOn !== action.approvalId) return run;
        const items = run.items.map((item) => (item.type === "approval" && item.id === action.approvalId ? { ...item, state: action.allow ? ("allowed" as const) : ("denied" as const) } : item));
        if (action.allow) return { ...run, items, waitingOn: null, started: true };
        // Denied: the mate says what it did instead, and stops.
        const reply: RunItem = { type: "message", id: `d${items.length}-${action.at}`, author: "mate", text: run.deniedReply ?? "OK, I won't." };
        return { ...run, items: [...items, reply], waitingOn: null, queue: [] };
      });
    case "stop":
      return update(state, action.runId, (run) => ({ ...closeGroup(run, action.at), queue: [] }));
    case "followUp":
      return update(state, action.runId, (run) => {
        const text = action.text.trim();
        if (!text || isPlaying(run) || run.waitingOn) return run;
        const message: RunItem = { type: "message", id: `u${run.items.length}-${action.at}`, author: "me", text };
        return { ...run, items: [...run.items, message], queue: action.script, started: true, turns: run.turns + 1 };
      });
  }
}

/** How long to wait before the next event: the current step's own time, or a short beat. */
export function nextDelay(state: RunState): number {
  return state.live?.current?.ms ?? 450;
}
