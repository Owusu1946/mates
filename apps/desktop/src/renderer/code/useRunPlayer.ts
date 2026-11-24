import { useEffect, useReducer, useRef } from "react";
import type { Run } from "../data/sampleRuns.ts";
import { initialRuns, isPlaying, nextDelay, runsReducer, type RunState } from "./runPlayer.logic.ts";

/** What a run is on right now; its timer is kept while this doesn't change. */
const positionOf = (run: RunState) => `${run.items.length}:${run.queue.length}:${run.live?.current?.id ?? ""}`;

/** Every run's state, with the timers that play live runs (rules: runPlayer.logic). */
export function useRunPlayer(runs: Run[]) {
  const [state, dispatch] = useReducer(runsReducer, runs, initialRuns);
  const timers = useRef(new Map<string, { position: string; timer: ReturnType<typeof setTimeout> }>());

  // Each event schedules the next, after the current step has had its time. A run that didn't
  // move keeps its timer, so one busy run never holds back another.
  useEffect(() => {
    const scheduled = timers.current;
    for (const [runId, run] of Object.entries(state)) {
      const existing = scheduled.get(runId);
      const position = positionOf(run);
      if (existing?.position === position && isPlaying(run)) continue;
      if (existing) clearTimeout(existing.timer);
      scheduled.delete(runId);
      if (isPlaying(run)) scheduled.set(runId, { position, timer: setTimeout(() => dispatch({ type: "advance", runId, at: Date.now() }), nextDelay(run)) });
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
