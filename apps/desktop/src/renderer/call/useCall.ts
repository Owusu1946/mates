import { useEffect, useReducer } from "react";
import { CALL_LINES, YOUR_LINES } from "../data/sampleComputer.ts";
import { callReducer } from "./call.logic.ts";

/** Ringing before the mates pick up, and the pace of the conversation. */
const CONNECT_MS = 1600;
const TURN_MS = 2800;

/** The one call in progress, wherever you are in the app (rules: call.logic). */
export function useCall() {
  const [call, dispatch] = useReducer(callReducer, null);

  useEffect(() => {
    if (!call || call.phase === "ended") return;
    const timer =
      call.phase === "connecting"
        ? setTimeout(() => dispatch({ type: "connected", at: Date.now() }), CONNECT_MS)
        : setTimeout(() => dispatch({ type: "turn", lines: CALL_LINES, you: YOUR_LINES }), call.turn === 0 ? 500 : TURN_MS);
    return () => clearTimeout(timer);
  }, [call?.phase, call?.turn]);

  return [call, dispatch] as const;
}
