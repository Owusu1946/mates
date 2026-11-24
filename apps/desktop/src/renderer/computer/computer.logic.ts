/**
 * A mate's computer, as the panel shows it: where it works (a private cloud computer, this PC, or
 * none), whether it's asleep, starting, working or paused, and the steps it takes on screen. You can
 * take over at any time, and a step that spends money waits for your OK. UI only: the steps come
 * from a sample task until the panel reaches the desktop service.
 */

export type ComputerPlace = "cloud" | "thisPC" | "off";
export type ComputerPower = "asleep" | "starting" | "working" | "paused" | "done";

export type ScreenStep = {
  id: string;
  /** What it says it's doing: "Opening bolt.com". */
  label: string;
  /** Which sample page the screen shows. */
  screen: string;
  /** Where its cursor goes on that page, in percent. */
  cursor: { x: number; y: number };
  /** A step that waits for your OK, like a payment. */
  approval?: { title: string; detail: string };
};

export type ComputerState = {
  place: ComputerPlace;
  power: ComputerPower;
  /** Steps done so far; the last is what's on screen. */
  shown: number;
  /** The approval waiting on you, by step id. */
  waitingOn: string | null;
  /** You're driving: the mate waits until you hand back. */
  takenOver: boolean;
};

export type ComputerAction =
  | { type: "wake" }
  | { type: "started" }
  | { type: "advance"; steps: ScreenStep[] }
  | { type: "answer"; allow: boolean }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "takeOver" }
  | { type: "handBack" }
  | { type: "stop" }
  | { type: "place"; place: ComputerPlace };

export const initialComputer = (place: ComputerPlace = "cloud"): ComputerState => ({ place, power: "asleep", shown: 0, waitingOn: null, takenOver: false });

/** Whether the next step should play now. */
export const isRunning = (state: ComputerState) => state.power === "working" && !state.waitingOn && !state.takenOver;

export function computerReducer(state: ComputerState, action: ComputerAction): ComputerState {
  switch (action.type) {
    case "wake":
      return state.place !== "off" && (state.power === "asleep" || state.power === "done") ? { ...state, power: "starting", shown: 0, waitingOn: null, takenOver: false } : state;
    case "started":
      return state.power === "starting" ? { ...state, power: "working" } : state;
    case "advance": {
      if (!isRunning(state)) return state;
      if (state.shown >= action.steps.length) return { ...state, power: "done" };
      const step = action.steps[state.shown]!;
      return { ...state, shown: state.shown + 1, waitingOn: step.approval ? step.id : null };
    }
    case "answer":
      if (!state.waitingOn) return state;
      // Not now: the mate stops there and says so in the chat; nothing is paid.
      return action.allow ? { ...state, waitingOn: null } : { ...state, waitingOn: null, power: "done" };
    case "pause":
      return state.power === "working" ? { ...state, power: "paused" } : state;
    case "resume":
      return state.power === "paused" ? { ...state, power: "working" } : state;
    case "takeOver":
      return state.power === "working" || state.power === "paused" ? { ...state, takenOver: true, power: "working" } : state;
    case "handBack":
      return state.takenOver ? { ...state, takenOver: false } : state;
    case "stop":
      return { ...state, power: "asleep", shown: 0, waitingOn: null, takenOver: false };
    case "place":
      // Moving somewhere else ends what it was doing there.
      return state.place === action.place ? state : { ...initialComputer(action.place) };
  }
}
