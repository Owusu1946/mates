import { useEffect, useReducer } from "react";
import { COMPUTER_TASKS, DEFAULT_TASK } from "../data/sampleComputer.ts";
import { computerReducer, hasWork, initialComputer, liveGoal } from "./computer.logic.ts";

/** How long the computer takes to start and to turn off, and each step on screen. */
const BOOT_MS = 3200;
const STOP_MS = 1400;
const STEP_MS = 2600;

export const taskFor = (mateId: string) => COMPUTER_TASKS[mateId] ?? DEFAULT_TASK;

/**
 * Your computer, shared by your mates, with the timers that boot it, turn it off and play the
 * goal in hand (rules: computer.logic). One timer at a time, like the computer's one mouse.
 */
export function useComputer() {
  const [state, dispatch] = useReducer(computerReducer, undefined, () => initialComputer());
  const live = liveGoal(state);
  const position = `${state.power}:${live?.id}:${live?.shown}:${live?.status}:${state.controller}:${state.goals.length}`;

  useEffect(() => {
    const due =
      state.power === "starting" ? { ms: BOOT_MS, action: { type: "booted" } as const }
      : state.power === "stopping" ? { ms: STOP_MS, action: { type: "stopped" } as const }
      : hasWork(state) ? { ms: live ? STEP_MS : 600, action: { type: "advance" } as const }
      : null;
    if (!due) return;
    const timer = setTimeout(() => dispatch(due.action), due.ms);
    return () => clearTimeout(timer);
    // `position` sums up everything that decides the next tick.
  }, [position]);

  return [state, dispatch] as const;
}
