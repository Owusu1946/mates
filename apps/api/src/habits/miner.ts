import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { getDb } from "../db/client.js";
import { activityEvents, habits, interests, routines, watches, type ActivityKind, type HabitTrigger } from "../db/schema.js";
import { nextOccurrence } from "../scheduling.js";
import { learningFor, SENSITIVE, structured } from "./shared.js";

/**
 * The nightly habit miner. Patterns are found by plain counting first (no model), then one small
 * call per person describes the ones that hold up in plain words. The model never decides what
 * counts as a habit; it only names them and drops sensitive ones.
 */

const WINDOW_DAYS = 56;
const DAY = 86_400_000;

export type Event = {
  at: Date;
  timezone: string | null;
  kind: ActivityKind;
  taskKey: string | null;
  label: string;
  slug: string | null;
  topic: string | null;
  mateId: string | null;
};

export type Candidate = {
  taskKey: string;
  trigger: HabitTrigger;
  score: number;
  evidence: { count: number; weeks: number; dates: string[] };
  labels: string[];
  mateId: string | null;
};

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
};
const mode = <T>(values: T[]) => {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};
const local = (event: Event) => DateTime.fromJSDate(event.at).setZone(event.timezone ?? "Africa/Accra");

/**
 * A task done at about the same time on the same weekdays: at least 3 days across 2 weeks, within
 * 90 minutes of its usual time, on weekdays seen in at least half the weeks since it first came up.
 */
export function timeHabit(taskKey: string, events: Event[], now = new Date()): Candidate | null {
  // One occurrence per local day: the first time it was done that day.
  const byDay = new Map<string, Event>();
  for (const event of [...events].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const day = local(event).toISODate()!;
    if (!byDay.has(day)) byDay.set(day, event);
  }
  const days = [...byDay.values()];
  if (days.length < 3) return null;
  const minutes = days.map((e) => local(e).hour * 60 + local(e).minute);
  const usual = median(minutes);
  const inliers = days.filter((_, i) => Math.abs(minutes[i]! - usual) <= 90);
  if (inliers.length < 3 || inliers.length / days.length < 0.6) return null;
  const isoWeeks = new Set(inliers.map((e) => `${local(e).weekYear}-${local(e).weekNumber}`));
  if (isoWeeks.size < 2) return null;

  const weeksSince = Math.min(WINDOW_DAYS / 7, Math.max(1, Math.ceil((now.getTime() - inliers[0]!.at.getTime()) / (7 * DAY))));
  const perDow = new Map<number, number>();
  for (const event of inliers) perDow.set(local(event).weekday, (perDow.get(local(event).weekday) ?? 0) + 1);
  const dows = [...perDow].filter(([, count]) => count >= 2 && count / weeksSince >= 0.5).map(([dow]) => dow).sort();
  if (!dows.length) return null;

  const onDows = inliers.filter((e) => dows.includes(local(e).weekday));
  const times = onDows.map((e) => local(e).hour * 60 + local(e).minute).sort((a, b) => a - b);
  // Offer it a little before they usually get to it: the earlier quarter of their times, to 5 minutes.
  const at = Math.round(times[Math.floor((times.length - 1) / 4)]! / 5) * 5;
  const spread = times.reduce((sum, t) => sum + Math.abs(t - median(times)), 0) / times.length;
  const regularity = Math.min(1, dows.reduce((sum, dow) => sum + perDow.get(dow)! / weeksSince, 0) / dows.length);
  const tightness = Math.max(0, 1 - spread / 90);
  const volume = Math.min(1, onDows.length / 4);
  const latest = onDows.at(-1)!;
  return {
    taskKey,
    trigger: { type: "time", dows, hour: Math.floor(at / 60) % 24, minute: at % 60, tz: latest.timezone ?? "Africa/Accra" },
    score: round(0.5 * regularity + 0.3 * tightness + 0.2 * volume),
    evidence: { count: onDows.length, weeks: isoWeeks.size, dates: onDows.slice(-5).map((e) => e.at.toISOString()) },
    labels: [...new Set(onDows.map((e) => e.label).filter(Boolean))].slice(0, 3),
    mateId: mode(onDows.map((e) => e.mateId).filter(Boolean)) as string | null,
  };
}

const AFTER_KINDS: ActivityKind[] = ["meeting", "call", "app_event"];

/**
 * A task that follows an event: in at least 60% of those events, at least 3 times, within 2 hours.
 * Events are grouped by kind and, for app events, by what happened ("GMAIL_NEW_EMAIL").
 */
export function afterEventHabits(events: Event[]): Candidate[] {
  const triggers = new Map<string, Event[]>();
  for (const event of events)
    if (AFTER_KINDS.includes(event.kind)) {
      const key = `${event.kind}|${event.kind === "app_event" ? (event.slug ?? "") : ""}`;
      triggers.set(key, [...(triggers.get(key) ?? []), event]);
    }
  // What follows: something they asked for, or (from their apps) mail they sent.
  const asks = events.filter((e) => (e.kind === "ask" || e.kind === "app_event") && e.taskKey);
  const found: Candidate[] = [];
  for (const [key, happened] of triggers) {
    if (happened.length < 3) continue;
    const [kind, match] = key.split("|") as [ActivityKind, string];
    const followers = new Map<string, { delays: number[]; asks: Event[] }>();
    for (const event of happened) {
      const seen = new Set<string>();
      for (const ask of asks) {
        if (kind === "app_event" && ask.kind === "app_event") continue;
        const delay = (ask.at.getTime() - event.at.getTime()) / 60_000;
        if (delay <= 0 || delay > 120 || seen.has(ask.taskKey!)) continue;
        seen.add(ask.taskKey!);
        const entry = followers.get(ask.taskKey!) ?? { delays: [], asks: [] };
        entry.delays.push(delay);
        entry.asks.push(ask);
        followers.set(ask.taskKey!, entry);
      }
    }
    for (const [taskKey, { delays, asks: followed }] of followers) {
      const ratio = delays.length / happened.length;
      if (delays.length < 3 || ratio < 0.6) continue;
      found.push({
        taskKey,
        trigger: { type: "after_event", kind, match, withinMinutes: Math.min(180, Math.ceil(Math.max(...delays) / 15) * 15) },
        score: round(0.6 * Math.min(1, ratio) + 0.4 * Math.min(1, delays.length / 5)),
        evidence: { count: delays.length, weeks: new Set(followed.map((e) => `${local(e).weekYear}-${local(e).weekNumber}`)).size, dates: followed.slice(-5).map((e) => e.at.toISOString()) },
        labels: [...new Set(followed.map((e) => e.label).filter(Boolean))].slice(0, 3),
        mateId: mode(followed.map((e) => e.mateId).filter(Boolean)) as string | null,
      });
    }
  }
  return found;
}

/**
 * Topics someone keeps coming back to (asks and reads), weighted so the last four weeks count and
 * older ones fade: at least 3 times on 2 different days.
 */
export function topicWeights(events: Event[], now = new Date()) {
  const byTopic = new Map<string, Event[]>();
  for (const event of events) if (event.topic) byTopic.set(event.topic, [...(byTopic.get(event.topic) ?? []), event]);
  const weights = new Map<string, { weight: number; lastSeenAt: Date }>();
  for (const [topic, seen] of byTopic) {
    const recent = seen.filter((e) => now.getTime() - e.at.getTime() < 28 * DAY);
    if (recent.length < 3 || new Set(recent.map((e) => local(e).toISODate())).size < 2) continue;
    const weight = recent.reduce((sum, e) => sum + (1 - (now.getTime() - e.at.getTime()) / (28 * DAY)), 0);
    weights.set(topic, { weight: round(weight), lastSeenAt: new Date(Math.max(...recent.map((e) => e.at.getTime()))) });
  }
  return weights;
}

/** Every pattern in someone's activity, best first: tasks, topics read at regular times, and follow-ups. */
export function findCandidates(events: Event[], now = new Date()) {
  const byTask = new Map<string, Event[]>();
  for (const event of events) {
    if ((event.kind === "ask" || event.kind === "app_action" || event.kind === "app_event") && event.taskKey) byTask.set(event.taskKey, [...(byTask.get(event.taskKey) ?? []), event]);
    // A topic read or asked about at the same time each day is a digest they might want.
    if (event.topic && (event.kind === "read" || event.kind === "ask")) {
      const key = `follow_${event.topic.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40)}`;
      byTask.set(key, [...(byTask.get(key) ?? []), event]);
    }
  }
  const found: Candidate[] = [];
  for (const [taskKey, taskEvents] of byTask) {
    const habit = timeHabit(taskKey, taskEvents, now);
    if (habit) found.push(habit);
  }
  // A task can be a time habit or a follow-up, not both: the stronger reading wins.
  for (const after of afterEventHabits(events)) {
    const existing = found.findIndex((c) => c.taskKey === after.taskKey);
    if (existing === -1) found.push(after);
    else if (after.score > found[existing]!.score) found[existing] = after;
  }
  return found.sort((a, b) => b.score - a.score).slice(0, 12);
}

/** The next time a time habit comes round, in its own timezone; null for follow-ups. */
export function nextDue(trigger: HabitTrigger, after = new Date()) {
  if (trigger.type !== "time") return null;
  const time = `${String(trigger.hour).padStart(2, "0")}:${String(trigger.minute).padStart(2, "0")}`;
  const next = trigger.dows
    .map((weekday) => nextOccurrence({ title: "habit", prompt: "habit", frequency: "weekly", timezone: trigger.tz, time, weekday, onceAt: null }, after))
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime());
  return next[0] ?? null;
}

const round = (n: number) => Math.round(n * 100) / 100;

const DESCRIBE_SCHEMA = {
  type: "object",
  properties: {
    habits: {
      type: "array",
      items: {
        type: "object",
        properties: {
          task_key: { type: "string" },
          keep: { type: "boolean" },
          title: { type: "string" },
          description: { type: "string" },
          line: { type: "string" },
          action_prompt: { type: "string" },
        },
        required: ["task_key", "keep", "title", "description", "line", "action_prompt"],
        additionalProperties: false,
      },
    },
  },
  required: ["habits"],
  additionalProperties: false,
};

type Described = { task_key: string; keep: boolean; title: string; description: string; line: string; action_prompt: string };

const DOW = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export function whenText(trigger: HabitTrigger) {
  if (trigger.type === "after_event") return `after ${trigger.kind === "app_event" ? (trigger.match ? trigger.match.toLowerCase().replace(/_/g, " ") : "an app event") : `a ${trigger.kind}`}`;
  const days = trigger.dows.length === 5 && trigger.dows.every((d) => d <= 5) ? "Weekdays" : trigger.dows.length === 7 ? "Every day" : trigger.dows.map((d) => `${DOW[d]}s`).join(", ");
  return `${days} around ${String(trigger.hour).padStart(2, "0")}:${String(trigger.minute).padStart(2, "0")}`;
}

/** Mines one person's last 8 weeks: upserts habits and topics, and lets unseen candidates go. */
export async function mineHabits(userId: string, now = new Date()) {
  const learning = await learningFor(userId);
  if (!learning.habits) return { habits: 0 };
  const events: Event[] = await getDb()
    .select({ at: activityEvents.at, timezone: activityEvents.timezone, kind: activityEvents.kind, taskKey: activityEvents.taskKey, label: activityEvents.label, slug: activityEvents.slug, topic: activityEvents.topic, mateId: activityEvents.mateId })
    .from(activityEvents)
    .where(and(eq(activityEvents.clerkUserId, userId), gte(activityEvents.at, new Date(now.getTime() - WINDOW_DAYS * DAY))));

  await saveTopics(userId, topicWeights(events, now), now);

  const existing = await getDb().select().from(habits).where(eq(habits.clerkUserId, userId));
  // Settled ones aren't re-described: dismissed stays dismissed, automatic ones are routines now.
  const settled = new Set(existing.filter((h) => h.status === "dismissed" || h.automatic).map((h) => h.taskKey));
  const candidates = findCandidates(events, now).filter((c) => !settled.has(c.taskKey));
  if (candidates.length) {
    const scheduled = [
      ...(await getDb().select({ title: routines.title }).from(routines).where(and(eq(routines.clerkUserId, userId), inArray(routines.status, ["active", "paused"])))).map((r) => `routine: ${r.title}`),
      ...(await getDb().select({ title: watches.title }).from(watches).where(and(eq(watches.clerkUserId, userId), inArray(watches.status, ["active", "paused"])))).map((w) => `watch: ${w.title}`),
    ];
    const described = await structured<{ habits: Described[] }>(
      "habits_describe",
      DESCRIBE_SCHEMA,
      [
        {
          role: "system",
          content: `You help a personal assistant offer to handle things a user does regularly. For each pattern found in their activity, write:
- title: a short plain label in the third person ("Plans the week on Monday mornings").
- description: one sentence on what they do, from the labels given.
- line: what the assistant says when offering, in the first person, friendly and short, ending with a question: "You usually plan your week around now. Want me to handle it?" For follow-ups: "You usually email a recap after meetings. Want me to draft it?" For a topic they follow: "You've been reading about fintech in Ghana in the mornings. Want a short digest?"
- action_prompt: the task to carry out when they say yes, as an instruction to the assistant ("Plan my week: go through my calendar and tasks for this week and give me a short plan.").
- keep: false when the pattern is about ${SENSITIVE}; when it's already covered by one of their routines or watches; or when it's not something an assistant could do or offer. Otherwise true.
Use the same task_key you were given. Patterns with keep=false still need the other fields, which can be empty.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            patterns: candidates.map((c) => ({ task_key: c.taskKey, when: whenText(c.trigger), times_seen: c.evidence.count, labels: c.labels })),
            already_scheduled: scheduled,
            existing_titles: existing.filter((h) => candidates.some((c) => c.taskKey === h.taskKey)).map((h) => ({ task_key: h.taskKey, title: h.title })),
          }),
        },
      ],
      { userId, source: "habit", ref: `mine_${now.toISOString().slice(0, 10)}` },
      1600,
    );
    for (const candidate of candidates) {
      const text = described.habits.find((h) => h.task_key === candidate.taskKey);
      if (!text?.keep || !text.title.trim() || !text.action_prompt.trim()) continue;
      const before = existing.find((h) => h.taskKey === candidate.taskKey);
      // Feedback moves it: each "Handle it" adds, a run of skips takes away.
      const confidence = Math.max(0, Math.min(1, round(candidate.score + 0.05 * Math.min(4, before?.accepted ?? 0) - 0.1 * (before?.skipped ?? 0))));
      const values = {
        title: text.title.slice(0, 120),
        description: text.description.slice(0, 300),
        line: text.line.slice(0, 240),
        actionPrompt: text.action_prompt.slice(0, 2000),
        trigger: candidate.trigger,
        evidence: candidate.evidence,
        confidence,
        nextDueAt: before?.status === "paused" ? null : nextDue(candidate.trigger, now),
        lastSeenAt: new Date(candidate.evidence.dates.at(-1)!),
        updatedAt: now,
      };
      await getDb()
        .insert(habits)
        .values({ clerkUserId: userId, mateId: candidate.mateId, taskKey: candidate.taskKey, ...values })
        .onConflictDoUpdate({ target: [habits.clerkUserId, habits.taskKey], set: { ...values, version: sql`${habits.version} + 1` }, where: sql`${habits.status} <> 'dismissed' AND NOT ${habits.automatic}` });
    }
  }
  // Candidates not seen for 4 weeks are let go; ones the user confirmed stay until they remove them.
  await getDb().delete(habits).where(and(eq(habits.clerkUserId, userId), eq(habits.status, "candidate"), lt(habits.lastSeenAt, new Date(now.getTime() - 28 * DAY))));
  return { habits: candidates.length };
}

async function saveTopics(userId: string, weights: Map<string, { weight: number; lastSeenAt: Date }>, now: Date) {
  for (const [topic, { weight, lastSeenAt }] of weights)
    await getDb()
      .insert(interests)
      .values({ clerkUserId: userId, topic, weight, lastSeenAt })
      .onConflictDoUpdate({ target: [interests.clerkUserId, interests.topic], set: { weight, lastSeenAt }, where: sql`${interests.weight} >= 0` });
  // Faded: not seen in 4 weeks. Removed topics (weight -1) stay, so they aren't learned again.
  await getDb().delete(interests).where(and(eq(interests.clerkUserId, userId), gte(interests.weight, 0), lt(interests.lastSeenAt, new Date(now.getTime() - 28 * DAY))));
}

/**
 * The dispatcher's share: people whose local time is 3am and who haven't been mined in the last
 * 20 hours are claimed (stamped first, so each runs once) and handed to the worker.
 */
export async function claimMining(limit = 100) {
  const result = (await getDb().execute(sql`
    UPDATE profiles SET habits_mined_at = now()
    WHERE clerk_user_id IN (
      SELECT p.clerk_user_id FROM profiles p
      JOIN LATERAL (SELECT a.timezone FROM activity_events a WHERE a.clerk_user_id = p.clerk_user_id ORDER BY a.at DESC LIMIT 1) last ON true
      WHERE p.habit_learning AND p.memory_enabled
        AND (p.habits_mined_at IS NULL OR p.habits_mined_at < now() - interval '20 hours')
        AND extract(hour FROM now() AT TIME ZONE coalesce(last.timezone, 'Africa/Accra')) = 3
      LIMIT ${limit} FOR UPDATE OF p SKIP LOCKED
    )
    RETURNING clerk_user_id`)) as unknown as { rows: { clerk_user_id: string }[] };
  return result.rows.map((r) => r.clerk_user_id);
}
