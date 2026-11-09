import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db/client.js";
import { chatMessages, chats, delegations, mates, missionNotes, missions, missionTasks, submissionOutbox } from "./db/schema.js";
import { boardView } from "./workboard.js";
import type { WorkflowCard } from "./integrations.js";
import { createGroup, createMate, gradientOf, MateError, MATE_PALETTE, ROLE_PRESETS, type MateColor, type MateRole, type PersonaMate } from "./mates.js";
import { CHAT_MODEL } from "./models.js";

const LIVE = ["running", "needs_input", "paused"] as const;
/** Rounds in a row with no note written before the leader stops to ask instead of looping. */
export const IDLE_ROUNDS_BEFORE_CHECKIN = 3;
const NOTE_CHARS = 20_000;
const DIGEST_CHARS = 12_000;

export type Mission = typeof missions.$inferSelect;

export async function liveMission(userId: string, chatId: string | null | undefined) {
  if (!chatId) return null;
  const [mission] = await getDb()
    .select()
    .from(missions)
    .where(and(eq(missions.clerkUserId, userId), eq(missions.chatId, chatId), inArray(missions.status, [...LIVE])));
  return mission ?? null;
}

export async function missionNotesOf(missionId: string) {
  return getDb()
    .select({ id: missionNotes.id, title: missionNotes.title, content: missionNotes.content, version: missionNotes.version, updatedAt: missionNotes.updatedAt, author: mates.name })
    .from(missionNotes)
    .leftJoin(mates, eq(mates.id, missionNotes.authorMateId))
    .where(eq(missionNotes.missionId, missionId))
    .orderBy(desc(missionNotes.updatedAt));
}

/** The notes as context: newest first, each cut short, the whole capped so prompts stay small. */
export function notesDigest(notes: { title: string; content: string; version: number; author: string | null }[], perNote = 900) {
  let budget = DIGEST_CHARS;
  const parts: string[] = [];
  for (const note of notes) {
    const body = note.content.length > perNote ? `${note.content.slice(0, perNote)}… [read the full note with cooper_mission_note]` : note.content;
    const entry = `### ${note.title} (v${note.version}${note.author ? `, by ${note.author}` : ""})\n${body}`;
    if (entry.length > budget) break;
    parts.push(entry);
    budget -= entry.length;
  }
  return parts.join("\n\n") || "(no notes yet)";
}

/** Shown to every mate in a group with a live mission, in rounds and in normal replies. */
export async function missionContext(mission: Mission) {
  const notes = await missionNotesOf(mission.id);
  return `This group is on a mission: ${mission.goal}
Status: ${mission.status}, round ${mission.round}.${mission.question ? ` Waiting on the user for: ${mission.question}` : ""}
Shared mission notes are the team's workspace. Do your part fully and concretely, then save it with cooper_mission_note (a clear title like "Market research" or "Financial model"; writing an existing title updates it). Build on teammates' notes rather than repeating them. You have your normal powers in the user's apps for this mission.
Notes so far:
${notesDigest(notes)}`;
}

export const assembleTeamTool = {
  type: "function" as const,
  function: {
    name: "cooper_assemble_team",
    description:
      "Create a team of new mates for a big goal (e.g. starting a company), put them in a group led by you, and start a mission they work on in rounds until it's done. Ask the user first if the goal is unclear (e.g. whether they already have a company idea).",
    parameters: {
      type: "object",
      properties: {
        team_name: { type: "string", description: "Group name, e.g. 'Venture HQ'." },
        goal: { type: "string", description: "The full mission, including what 'done' means (deliverables and what to set up in the user's apps)." },
        members: {
          type: "array",
          minItems: 1,
          maxItems: 6,
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "A short first name, unique among the user's mates." },
              role: { type: "string", enum: Object.keys(ROLE_PRESETS) },
              description: { type: "string", description: "Their job on this team, e.g. 'the CFO: owns pricing, costs and the financial model'." },
              color: { type: "string", enum: Object.keys(MATE_PALETTE) },
            },
            required: ["name", "role", "description"],
          },
        },
      },
      required: ["team_name", "goal", "members"],
      additionalProperties: false,
    },
  },
};

export const missionNoteTool = {
  type: "function" as const,
  function: {
    name: "cooper_mission_note",
    description: "Read or write the mission's shared notes. write creates or updates a note by title; read returns one note in full; list returns all titles.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["write", "read", "list"] },
        title: { type: "string" },
        content: { type: "string", description: "write: the full note in markdown (replaces the previous version)." },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
};

const assembleSchema = z.object({
  team_name: z.string().trim().min(1).max(60),
  goal: z.string().trim().min(1).max(2_000),
  members: z
    .array(z.object({ name: z.string().trim().min(1).max(40), role: z.string(), description: z.string().trim().max(600), color: z.string().optional() }))
    .min(1)
    .max(6),
});

/** Creates (or reuses, by name) the team, its group and the mission; the first round is queued. */
export type AssembledTeam =
  | { ok: true; group: { chatId: string; name: string; mateIds: string[] }; mission: Mission; members: (typeof mates.$inferSelect)[]; created: string[]; skipped: number }
  | { ok: false; error: string };

export async function assembleTeam(userId: string, leader: PersonaMate, raw: unknown): Promise<AssembledTeam> {
  const args = assembleSchema.safeParse(raw);
  if (!args.success) return { ok: false, error: "Give the team a name, a goal and 1–6 members with a name, role and description." };
  const existing = await getDb().select().from(mates).where(eq(mates.clerkUserId, userId));
  const palette = Object.keys(MATE_PALETTE) as MateColor[];
  const memberIds: string[] = [];
  const created: string[] = [];
  for (const [i, member] of args.data.members.entries()) {
    const same = existing.find((m) => m.name.toLowerCase() === member.name.toLowerCase());
    if (same) {
      if (same.id !== leader.id) memberIds.push(same.id);
      continue;
    }
    const role = (member.role in ROLE_PRESETS ? member.role : "custom") as MateRole;
    const color = (member.color && member.color in MATE_PALETTE ? member.color : palette[(i + 1) % palette.length]) as MateColor;
    try {
      const mate = await createMate(userId, { name: member.name.replace(/[^\p{L}\p{N} .'_-]/gu, "").trim() || `Mate ${i + 1}`, role, roleDescription: member.description, color });
      memberIds.push(mate.id);
      created.push(mate.name);
    } catch (error) {
      if (error instanceof MateError && error.code === "LIMIT") break; // Keep whoever fit; say so below.
      throw error;
    }
  }
  if (!memberIds.length) return { ok: false, error: "No mates could be added: the user has reached the 20-mate limit." };
  const group = await createGroup(userId, { name: args.data.team_name, mateIds: [leader.id, ...memberIds], leaderMateId: leader.id });
  const [mission] = await getDb().insert(missions).values({ clerkUserId: userId, chatId: group.chatId, goal: args.data.goal }).returning();
  await enqueueMissionRound(userId, mission!.id);
  const members = await getDb().select().from(mates).where(inArray(mates.id, group.mateIds));
  return { ok: true, group, mission: mission!, members, created, skipped: args.data.members.length - memberIds.length };
}

export function teamCard(result: { group: { chatId: string; name: string }; members: { id: string; name: string; role: string; color: string; shape?: string }[] }): WorkflowCard {
  return {
    kind: "team",
    phase: "done",
    label: result.group.name,
    team: {
      chatId: result.group.chatId,
      name: result.group.name,
      members: result.members.map((m) => ({ id: m.id, name: m.name, role: m.role, color: m.color, shape: m.shape, gradient: gradientOf(m.color) })),
    },
  };
}

const noteSchema = z.object({ action: z.enum(["write", "read", "list"]), title: z.string().trim().max(120).optional(), content: z.string().max(NOTE_CHARS).optional() });

export async function runMissionNote(missionId: string, authorMateId: string | undefined, raw: unknown) {
  const args = noteSchema.safeParse(raw);
  if (!args.success) return { error: "Use action write (title + content), read (title) or list." };
  const { action, title, content } = args.data;
  if (action === "list") return { notes: (await missionNotesOf(missionId)).map((n) => ({ title: n.title, version: n.version, author: n.author })) };
  if (!title) return { error: "A note needs a title." };
  const match = and(eq(missionNotes.missionId, missionId), sql`lower(${missionNotes.title}) = lower(${title})`);
  if (action === "read") {
    const [note] = await getDb().select().from(missionNotes).where(match);
    return note ? { title: note.title, version: note.version, content: note.content } : { error: `No note titled "${title}".` };
  }
  if (!content?.trim()) return { error: "A note needs content." };
  return saveNote(missionId, authorMateId, title, content);
}

/** Creates or replaces a note by title in one statement, so teammates writing at once never clash. */
export async function saveNote(missionId: string, authorMateId: string | undefined, title: string, content: string) {
  const result = await getDb().execute(sql`
    INSERT INTO mission_notes (mission_id, author_mate_id, title, content)
    VALUES (${missionId}, ${authorMateId ?? null}, ${title.slice(0, 120)}, ${content.slice(0, NOTE_CHARS)})
    ON CONFLICT (mission_id, lower(title)) DO UPDATE
      SET content = EXCLUDED.content, author_mate_id = EXCLUDED.author_mate_id, version = mission_notes.version + 1, updated_at = now()
    RETURNING title, version`);
  const row = result.rows[0] as { title: string; version: number } | undefined;
  return { saved: row?.title ?? title, version: Number(row?.version ?? 1) };
}

type StoredMessage = { role?: string; content?: { type?: string; text?: unknown; result?: { kind?: string; speaker?: { name?: string } } }[] };

/** The group's recent conversation as model turns, with who said what inside team replies. */
export async function recentTurns(chatId: string, limit = 16) {
  const rows = await getDb().select({ message: chatMessages.message }).from(chatMessages).where(eq(chatMessages.chatId, chatId)).orderBy(desc(chatMessages.createdAt)).limit(limit);
  return rows
    .reverse()
    .flatMap(({ message }) => {
      const m = message as StoredMessage;
      let speaker = "";
      const lines: string[] = [];
      for (const part of m.content ?? []) {
        if (part.result?.kind === "speaker") speaker = part.result.speaker?.name ?? "";
        else if (part.type === "text" && typeof part.text === "string" && part.text.trim()) lines.push(m.role === "assistant" && speaker ? `${speaker}: ${part.text.trim()}` : part.text.trim());
      }
      const content = lines.join("\n\n").slice(0, 8_000);
      return content && (m.role === "user" || m.role === "assistant") ? [{ role: m.role, content }] : [];
    });
}

/**
 * Queues the next round as an ordinary background run in the group, so it gets the same
 * heartbeats, cancellation and persistence as a message. Idempotent per round number.
 */
export async function enqueueMissionRound(userId: string, missionId: string) {
  const [mission] = await getDb()
    .update(missions)
    .set({ round: sql`${missions.round} + 1`, updatedAt: new Date() })
    .where(and(eq(missions.id, missionId), eq(missions.clerkUserId, userId), eq(missions.status, "running")))
    .returning();
  if (!mission) return null;
  // One run per chat at a time: a waiting user message or round goes first and continues the mission after.
  const [busy] = await getDb().select({ id: delegations.id }).from(delegations).where(and(eq(delegations.chatId, mission.chatId), inArray(delegations.status, ["queued", "running"])));
  if (busy) {
    await getDb().update(missions).set({ round: sql`${missions.round} - 1` }).where(eq(missions.id, missionId));
    return null;
  }
  const turns = await recentTurns(mission.chatId);
  const messages = [...turns.slice(-15), { role: "user" as const, content: `(Mission round ${mission.round}. Keep working on: ${mission.goal.slice(0, 1_500)})` }];
  const [latest] = await getDb().select({ id: chatMessages.id }).from(chatMessages).where(eq(chatMessages.chatId, mission.chatId)).orderBy(desc(chatMessages.createdAt)).limit(1);
  const id = randomUUID();
  const assistantMessageId = `mission_${mission.id}_${mission.round}`;
  const requestKey = `mission_${mission.id}_${mission.round}`;
  try {
    await getDb().batch([
      getDb().insert(delegations).values({
        id,
        clerkUserId: userId,
        chatId: mission.chatId,
        requestKey,
        requestHash: requestKey,
        request: { messages, chatId: mission.chatId, requestKey, assistantMessageId, parentId: latest?.id ?? null, mission: { id: mission.id, round: mission.round } },
        parentId: latest?.id ?? null,
        assistantMessageId,
        agentRunId: id,
      }),
      getDb().insert(submissionOutbox).values({ delegationId: id }),
      getDb().insert(chatMessages).values({
        chatId: mission.chatId,
        id: assistantMessageId,
        parentId: latest?.id ?? null,
        createdAt: sql`now()`,
        message: {
          id: assistantMessageId,
          role: "assistant",
          createdAt: new Date().toISOString(),
          content: [{ type: "tool-call", toolCallId: `queued_${id}`, toolName: "cooper_workflow", args: {}, argsText: "{}", result: { kind: "step", phase: "running", label: "The team is lining up the next step" } }],
          status: { type: "running" },
          metadata: { custom: { delegationId: id, mission: true } },
        },
      }),
      getDb().update(chats).set({ updatedAt: new Date() }).where(eq(chats.id, mission.chatId)),
    ]);
  } catch {
    return null; // Another worker queued this round first.
  }
  return id;
}

export async function setMissionStatus(userId: string, missionId: string, action: "pause" | "resume" | "stop") {
  if (!z.string().uuid().safeParse(missionId).success) return null;
  const next = action === "pause" ? "paused" : action === "stop" ? "stopped" : "running";
  const allowed: Mission["status"][] = action === "pause" ? ["running", "needs_input"] : action === "resume" ? ["paused", "needs_input"] : [...LIVE];
  const [mission] = await getDb()
    .update(missions)
    .set({ status: next, ...(action === "resume" ? { question: null, idleRounds: 0 } : {}), updatedAt: new Date() })
    .where(and(eq(missions.id, missionId), eq(missions.clerkUserId, userId), inArray(missions.status, allowed)))
    .returning();
  if (!mission) return null;
  if (action !== "resume") await stopRounds(mission.chatId);
  else await enqueueMissionRound(userId, mission.id);
  return mission;
}

export async function missionForChat(userId: string, chatId: string) {
  const [mission] = await getDb().select().from(missions).where(and(eq(missions.clerkUserId, userId), eq(missions.chatId, chatId))).orderBy(desc(missions.createdAt)).limit(1);
  if (!mission) return null;
  const notes = await missionNotesOf(mission.id);
  const [working] = await getDb()
    .select({ content: delegations.content })
    .from(delegations)
    .where(and(eq(delegations.chatId, chatId), inArray(delegations.status, ["queued", "running"])))
    .limit(1);
  const speaker = [...(working?.content ?? [])].reverse().find((p) => (p as { result?: { kind?: string } }).result?.kind === "speaker") as { result?: { speaker?: { name?: string } } } | undefined;
  // The task of whoever is working right now, from the round's relay card.
  const relay = [...(working?.content ?? [])].reverse().find((p) => (p as { result?: { kind?: string } }).result?.kind === "handoff") as { result?: WorkflowCard } | undefined;
  const current = relay?.result?.handoff?.items.find((item) => item.status === "working");
  // The board, with each working mate's live step from the round in progress.
  const steps = new Map((relay?.result?.handoff?.items ?? []).flatMap((item) => (item.id && item.step ? [[item.id, item.step] as const] : [])));
  const tasks = await getDb().select().from(missionTasks).where(eq(missionTasks.missionId, mission.id)).orderBy(asc(missionTasks.position));
  const owners = [...new Set(tasks.map((t) => t.mateId).filter((id): id is string => !!id))];
  const people = owners.length ? await getDb().select({ id: mates.id, name: mates.name, color: mates.color, shape: mates.shape }).from(mates).where(inArray(mates.id, owners)) : [];
  return {
    ...mission,
    working: working ? current?.mate.name ?? speaker?.result?.speaker?.name ?? "The team" : null,
    workingTask: current?.task || null,
    tasks: boardView(tasks, new Map(people.map((p) => [p.id, p])), steps),
    notes: notes.map((n) => ({ id: n.id, title: n.title, version: n.version, author: n.author, updatedAt: n.updatedAt, content: n.content })),
  };
}

/**
 * The user's message goes first: a round in progress in this chat is asked to stop, and the
 * caller waits briefly for it, so the message isn't refused while the team is mid-step.
 */
/**
 * Stops a chat's mission rounds: a running one at its next heartbeat; a queued one now, since a
 * worker skips it without ever closing it (which would hold the chat's single run slot). Its
 * placeholder message is closed too, so the conversation never keeps a half-made reply.
 */
async function stopRounds(chatId: string) {
  const isRound = sql`${delegations.request}->'mission' IS NOT NULL`;
  const signalled = await getDb()
    .update(delegations)
    .set({ cancelRequested: true })
    .where(and(eq(delegations.chatId, chatId), inArray(delegations.status, ["queued", "running"]), isRound))
    .returning({ id: delegations.id });
  const closed = await getDb()
    .update(delegations)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(delegations.chatId, chatId), eq(delegations.status, "queued"), isRound))
    .returning({ messageId: delegations.assistantMessageId });
  for (const { messageId } of closed)
    await getDb()
      .update(chatMessages)
      .set({
        message: {
          id: messageId,
          role: "assistant",
          createdAt: new Date().toISOString(),
          content: [{ type: "tool-call", toolCallId: `skipped_${messageId}`, toolName: "cooper_workflow", args: {}, argsText: "{}", result: { kind: "step", phase: "done", label: "Step skipped" } }],
          status: { type: "complete", reason: "stop" },
        },
      })
      .where(and(eq(chatMessages.chatId, chatId), eq(chatMessages.id, messageId)));
  return signalled.length > 0;
}

export async function yieldMissionRound(chatId: string, waitMs = 12_000) {
  const roundInChat = and(eq(delegations.chatId, chatId), inArray(delegations.status, ["queued", "running"]), sql`${delegations.request}->'mission' IS NOT NULL`);
  if (!(await stopRounds(chatId))) return;
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    const [active] = await getDb().select({ id: delegations.id }).from(delegations).where(roundInChat);
    if (!active) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/**
 * Keeps a live mission moving after any run in its group: the user's reply resumes a check-in,
 * and a finished round queues the next one. Rounds stopped for the user's message or by Pause
 * don't queue; the user's run continues the mission when it ends.
 */
export async function afterRunInChat(userId: string, chatId: string, wasRound: boolean, status: string) {
  const mission = await liveMission(userId, chatId);
  if (!mission) return;
  if (wasRound && status === "cancelled") return;
  if (status === "waiting") return; // Waiting on the user (connect an app, sign in); their resume continues it.
  if (!wasRound && mission.status === "needs_input") {
    await getDb().update(missions).set({ status: "running", question: null, idleRounds: 0, updatedAt: new Date() }).where(eq(missions.id, mission.id));
  } else if (mission.status !== "running") return;
  if (wasRound && status === "failed") {
    await getDb().update(missions).set({ status: "needs_input", question: "A step didn't finish. Reply to let the team retry, or tell them what to change.", updatedAt: new Date() }).where(eq(missions.id, mission.id));
    return;
  }
  await enqueueMissionRound(userId, mission.id);
}
