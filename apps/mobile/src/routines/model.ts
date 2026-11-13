import { useAuth } from "@clerk/expo";
import { useQuery } from "@tanstack/react-query";
import { runRequest } from "../chat/background-chat";

/** What a routine does and when, as the API stores it. Weekdays run 1 (Monday) to 7 (Sunday). */
export type RoutineSpec = { title: string; prompt: string; frequency: "once" | "daily" | "weekly"; timezone: string; time: string; weekday: number | null; onceAt: string | null };
export type RoutineStatus = "draft" | "active" | "paused" | "cancelled" | "finished";
export type Routine = { id: string; title: string; spec: RoutineSpec; version: number; status: RoutineStatus; nextRunAt: string | null };
export type RoutineRun = { id: string; status: string; scheduledFor: string; error: string | null };
export type Reminder = { id: string; title: string; body: string | null; remindAt: string };

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export const deviceTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

export const routinesKey = (userId: string | null | undefined) => ["routines", userId] as const;
export const remindersKey = (userId: string | null | undefined) => ["reminders", userId] as const;

export function useRoutines() {
  const { getToken, userId } = useAuth();
  return useQuery({ queryKey: routinesKey(userId), queryFn: async () => (await runRequest<{ routines: Routine[] }>(getToken, "schedules")).routines, refetchInterval: 15_000 });
}

export function useReminders() {
  const { getToken, userId } = useAuth();
  return useQuery({ queryKey: remindersKey(userId), queryFn: async () => (await runRequest<{ reminders: Reminder[] }>(getToken, "reminders")).reminders, refetchInterval: 30_000 });
}

/** "08:00" as the reader's clock shows it ("8:00 AM" or "08:00"). */
export function clockTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  return new Date(Date.UTC(2000, 0, 1, h ?? 0, m ?? 0)).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}

/** When it runs, in plain words: "Every day at 8:00 AM", "Mondays at 9:00 AM", "Once, Fri 14 Nov at 3:00 PM". */
export function scheduleText(spec: RoutineSpec) {
  if (spec.frequency === "daily") return `Every day at ${clockTime(spec.time)}`;
  if (spec.frequency === "weekly") return `${WEEKDAYS[(spec.weekday ?? 1) - 1]}s at ${clockTime(spec.time)}`;
  if (!spec.onceAt) return "Once";
  const at = new Date(spec.onceAt);
  return `Once, ${at.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: spec.timezone })} at ${at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: spec.timezone })}`;
}

/** How soon the next run is: "in 25 min", "in 3 h", "tomorrow", "in 4 days". */
export function untilText(iso: string | null, now = Date.now()) {
  if (!iso) return null;
  const minutes = Math.round((new Date(iso).getTime() - now) / 60_000);
  if (minutes < 1) return "any moment";
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

export const isEnded = (routine: Routine) => routine.status === "cancelled" || routine.status === "finished";

/** Ready-made routines to start from when there are none yet. */
export const TEMPLATES: { key: string; title: string; caption: string; spec: Omit<RoutineSpec, "timezone" | "onceAt"> }[] = [
  {
    key: "briefing",
    title: "Morning briefing",
    caption: "Your day, emails and priorities at 7:30",
    spec: { title: "Morning briefing", prompt: "Brief me on today: my calendar, the emails that need me, and the three things I should get done first.", frequency: "daily", time: "07:30", weekday: null },
  },
  {
    key: "inbox",
    title: "Evening inbox sweep",
    caption: "What still needs a reply, every evening",
    spec: { title: "Evening inbox sweep", prompt: "Go through today's email and list what still needs a reply from me, with a suggested answer for each.", frequency: "daily", time: "18:00", weekday: null },
  },
  {
    key: "weekly",
    title: "Weekly review",
    caption: "What got done and what's next, Fridays",
    spec: { title: "Weekly review", prompt: "Review my week: what got done, what slipped, and what I should focus on next week.", frequency: "weekly", time: "16:00", weekday: 5 },
  },
];
