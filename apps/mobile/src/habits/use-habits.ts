import { useAuth } from "@clerk/expo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { createApiClient } from "../data/api";

export type HabitTrigger = { type: "time"; dows: number[]; hour: number; minute: number; tz: string } | { type: "after_event"; kind: string; match: string; withinMinutes: number };
export type Habit = {
  id: string;
  version: number;
  title: string;
  description: string;
  when: string;
  trigger: HabitTrigger;
  evidence: { count: number; weeks: number; dates: string[] };
  confidence: number;
  status: "candidate" | "confirmed" | "paused" | "dismissed";
  automatic: boolean;
  canAutomate: boolean;
  accepted: number;
  nextDueAt: string | null;
  mate: { id: string; name: string; color: string; chatId: string } | null;
};
export type HabitSettings = { memoryEnabled: boolean; habitLearning: boolean; learnFromApps: boolean; meetingPrep: boolean; observing: string[]; plusFeatures: boolean };
export type Habits = { available: boolean; habits: Habit[]; topics: { topic: string; lastSeenAt: string }[]; settings: HabitSettings };
export type NudgeAction = "handle" | "skip" | "stop" | "automate";

const key = (userId: string | null | undefined) => ["habits", userId];

/** What the mates have noticed, and the switches; shared by "What I've noticed" and the nudge cards. */
export function useHabits() {
  const { getToken, userId } = useAuth();
  const api = useMemo(() => createApiClient(getToken), [getToken]);
  return useQuery({
    queryKey: key(userId),
    queryFn: async () => {
      const response = await api.v1.habits.$get();
      if (!response.ok) throw new Error("Couldn’t load what your mates noticed.");
      return (await response.json()) as unknown as Habits;
    },
    enabled: !!userId,
  });
}

async function ok<R extends { ok: boolean; json(): Promise<unknown> }>(response: R, message: string) {
  if (response.ok) return response;
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  throw new Error(body?.error?.message ?? message);
}

/** Every change on the page or a card, each refreshing the list after. */
export function useHabitActions() {
  const { getToken, userId } = useAuth();
  const api = useMemo(() => createApiClient(getToken), [getToken]);
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: key(userId) });
  const then = async <T,>(work: Promise<T>) => {
    try {
      return await work;
    } finally {
      await refresh();
    }
  };
  return {
    change: (habit: Pick<Habit, "id" | "version">, action: "confirm" | "pause" | "resume" | "retime", time?: { hour: number; minute: number }) =>
      then(api.v1.habits[":id"].$patch({ param: { id: habit.id }, json: { action, version: habit.version, ...time } }).then((r) => ok(r, "This changed. Pull to refresh and try again."))),
    remove: (id: string) => then(api.v1.habits[":id"].$delete({ param: { id } }).then((r) => ok(r, "Couldn’t remove that."))),
    removeTopic: (topic: string) => then(api.v1.habits.topics[":topic"].$delete({ param: { topic: encodeURIComponent(topic) } }).then((r) => ok(r, "Couldn’t remove that topic."))),
    clear: () => then(api.v1.habits.$delete().then((r) => ok(r, "Couldn’t clear everything."))),
    settings: (values: Partial<Pick<HabitSettings, "habitLearning" | "learnFromApps" | "meetingPrep">>) =>
      then(api.v1.habits.settings.$post({ json: values }).then((r) => ok(r, "Couldn’t update that setting."))),
    /** From the app, "Handle it" hands back the task, which the card sends in the open chat. */
    nudge: async (nudgeId: string, action: NudgeAction) => {
      const response = await then(api.v1.habits.nudges[":id"].$post({ param: { id: nudgeId }, json: { action, run: false } }).then((r) => ok(r, "That didn’t work. Try again.")));
      return (await response.json()) as { outcome: string; prompt?: string; chatId?: string };
    },
  };
}

/** "seen 5 Mondays", "seen 4 times". */
export function evidenceText(habit: Pick<Habit, "evidence" | "trigger">) {
  const { count } = habit.evidence;
  if (habit.trigger.type === "time" && habit.trigger.dows.length === 1) {
    const day = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][habit.trigger.dows[0]!];
    return `seen ${count} ${day}${count === 1 ? "" : "s"}`;
  }
  return `seen ${count} time${count === 1 ? "" : "s"}`;
}
