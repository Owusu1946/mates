/**
 * Your computer, as the app has it (apps/api/src/computers.ts): one desktop of your own, shared by
 * all your mates. It turns on for work and off when idle, keeping logins and files. One mouse, so
 * one job at a time: a mate's goal runs while the others wait in line, and you can take over
 * whenever you like. A goal can stop for you: your OK for a payment, a sign-in, or a question.
 * On desktop it can work in the cloud (the app's computer) or on this PC (lending, from the
 * desktop plan). UI only: goals play sample steps until the panel reaches the API.
 */

export type ComputerPlace = "cloud" | "thisPC";
export type ComputerPower = "off" | "starting" | "on" | "stopping";
export type GoalStatus = "queued" | "running" | "waiting" | "done" | "cancelled";
/** What a goal waits for, as the API names it. */
export type WaitingFor = "approval" | "login" | "question" | "user_control";

export type ScreenStep = {
  id: string;
  /** What it says it's doing: "Opening bolt.com". */
  label: string;
  /** Which sample page the screen shows. */
  screen: string;
  /** Where its cursor goes on that page, in percent. */
  cursor: { x: number; y: number };
  /** A step that stops for you before it carries on. */
  needs?: { kind: Exclude<WaitingFor, "user_control">; title: string; detail: string };
};

export type Goal = {
  id: string;
  mateId: string;
  title: string;
  steps: ScreenStep[];
  status: GoalStatus;
  /** Steps done so far; the last is what's on screen. */
  shown: number;
  waitingFor: WaitingFor | null;
};

export type ComputerState = {
  place: ComputerPlace;
  power: ComputerPower;
  /** Who has the mouse: a mate, or you after Take over. */
  controller: "mate" | "user";
  goals: Goal[];
};

export type ComputerAction =
  | { type: "turnOn" }
  | { type: "booted" }
  | { type: "turnOff" }
  | { type: "stopped" }
  | { type: "ask"; goal: Omit<Goal, "status" | "shown" | "waitingFor"> }
  | { type: "advance" }
  | { type: "answer"; allow: boolean }
  | { type: "takeOver" }
  | { type: "handBack" }
  | { type: "cancel"; goalId: string }
  | { type: "place"; place: ComputerPlace };

export const initialComputer = (place: ComputerPlace = "cloud"): ComputerState => ({ place, power: "off", controller: "mate", goals: [] });

const isLive = (goal: Goal) => goal.status === "running" || goal.status === "waiting";
/** The goal using the computer now: one at a time, like the API's lease. */
export const liveGoal = (state: ComputerState) => state.goals.find(isLive) ?? null;
export const queuedGoals = (state: ComputerState) => state.goals.filter((goal) => goal.status === "queued");
/** A mate's goal still in play: running, waiting or in line. */
export const goalOf = (state: ComputerState, mateId: string) => state.goals.find((goal) => goal.mateId === mateId && (isLive(goal) || goal.status === "queued")) ?? null;

/** Whether something should happen on the next tick: a step, or the next goal in line starting. */
export function hasWork(state: ComputerState): boolean {
  if (state.power !== "on") return false;
  const live = liveGoal(state);
  return live ? live.status === "running" : queuedGoals(state).length > 0;
}

const replaceGoal = (state: ComputerState, goal: Goal): ComputerState => ({ ...state, goals: state.goals.map((candidate) => (candidate.id === goal.id ? goal : candidate)) });

export function computerReducer(state: ComputerState, action: ComputerAction): ComputerState {
  switch (action.type) {
    case "turnOn":
      return state.power === "off" ? { ...state, power: "starting" } : state;
    case "booted":
      return state.power === "starting" ? { ...state, power: "on" } : state;
    case "turnOff":
      // Turning off ends the job in hand; anything in line waits for next time.
      if (state.power !== "on" && state.power !== "starting") return state;
      return { ...state, power: "stopping", controller: "mate", goals: state.goals.map((goal) => (isLive(goal) ? { ...goal, status: "cancelled", waitingFor: null } : goal)) };
    case "stopped":
      return state.power === "stopping" ? { ...state, power: "off" } : state;
    case "ask": {
      // Asking turns the computer on; the goal waits its turn behind whatever's running.
      if (goalOf(state, action.goal.mateId)) return state;
      const goal: Goal = { ...action.goal, status: "queued", shown: 0, waitingFor: null };
      return { ...state, power: state.power === "off" ? "starting" : state.power, goals: [...state.goals, goal] };
    }
    case "advance": {
      if (!hasWork(state)) return state;
      const live = liveGoal(state);
      if (!live) {
        const next = queuedGoals(state)[0]!;
        return replaceGoal(state, { ...next, status: "running" });
      }
      if (live.shown >= live.steps.length) return replaceGoal(state, { ...live, status: "done" });
      const step = live.steps[live.shown]!;
      return replaceGoal(state, { ...live, shown: live.shown + 1, status: step.needs ? "waiting" : "running", waitingFor: step.needs?.kind ?? null });
    }
    case "answer": {
      const live = liveGoal(state);
      if (!live || live.status !== "waiting" || live.waitingFor === "user_control") return state;
      // Not now: the mate stops there and says so in its chat; nothing is paid.
      return replaceGoal(state, action.allow ? { ...live, status: "running", waitingFor: null } : { ...live, status: "cancelled", waitingFor: null });
    }
    case "takeOver": {
      if (state.power !== "on" || state.controller === "user") return state;
      const live = liveGoal(state);
      // The mate's goal waits while you have the mouse; a sign-in you do yourself counts as done.
      return { ...(live ? replaceGoal(state, { ...live, status: "waiting", waitingFor: live.waitingFor === "login" ? "login" : "user_control" }) : state), controller: "user" };
    }
    case "handBack": {
      if (state.controller !== "user") return state;
      const live = liveGoal(state);
      const resumed = live ? replaceGoal(state, { ...live, status: "running", waitingFor: null }) : state;
      return { ...resumed, controller: "mate" };
    }
    case "cancel":
      return { ...state, controller: "mate", goals: state.goals.map((goal) => (goal.id === action.goalId && (isLive(goal) || goal.status === "queued") ? { ...goal, status: "cancelled", waitingFor: null } : goal)) };
    case "place":
      // Moving to the other computer starts over there.
      return state.place === action.place ? state : initialComputer(action.place);
  }
}
