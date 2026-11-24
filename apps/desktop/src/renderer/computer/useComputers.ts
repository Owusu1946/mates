import { useEffect, useReducer, useRef } from "react";
import { COMPUTER_TASKS, DEFAULT_TASK } from "../data/sampleComputer.ts";
import { computerReducer, initialComputer, isRunning, type ComputerAction, type ComputerState } from "./computer.logic.ts";

/** How long a computer takes to start, and each step on screen. */
const START_MS = 2400;
const STEP_MS = 2600;

type State = Record<string, ComputerState>;
type Action = { mateId: string; action: ComputerAction };

const reducer = (state: State, { mateId, action }: Action): State => {
  const current = state[mateId] ?? initialComputer();
  const next = computerReducer(current, action);
  return next === current ? state : { ...state, [mateId]: next };
};

export const taskFor = (mateId: string) => COMPUTER_TASKS[mateId] ?? DEFAULT_TASK;

/**
 * Every mate's computer, and the timers that start it and play its steps (rules: computer.logic).
 * Each computer keeps its own timer while it's on the same step, so one never holds another back.
 */
export function useComputers() {
  const [state, dispatch] = useReducer(reducer, {});
  const timers = useRef(new Map<string, { at: string; timer: ReturnType<typeof setTimeout> }>());

  useEffect(() => {
    const scheduled = timers.current;
    for (const [mateId, computer] of Object.entries(state)) {
      const position = `${computer.power}:${computer.shown}:${computer.waitingOn}:${computer.takenOver}`;
      const due = computer.power === "starting" ? { ms: START_MS, action: { type: "started" } as const } : isRunning(computer) ? { ms: STEP_MS, action: { type: "advance", steps: taskFor(mateId).steps } as const } : null;
      const existing = scheduled.get(mateId);
      if (existing?.at === position && due) continue;
      if (existing) clearTimeout(existing.timer);
      scheduled.delete(mateId);
      if (due) scheduled.set(mateId, { at: position, timer: setTimeout(() => dispatch({ mateId, action: due.action }), due.ms) });
    }
  }, [state]);

  useEffect(() => {
    const scheduled = timers.current;
    return () => {
      for (const { timer } of scheduled.values()) clearTimeout(timer);
      scheduled.clear();
    };
  }, []);

  return [state, dispatch] as const;
}
