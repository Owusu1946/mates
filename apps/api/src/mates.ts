import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db/client.js";
import { chats, groupMembers, mates } from "./db/schema.js";

/** Avatar gradients, light → dark. "amber" is the lead mate's original look. */
export const MATE_PALETTE = {
  amber: ["#e5c59e", "#d27e41", "#9A3412"],
  teal: ["#9fd8d1", "#3a9c94", "#155e63"],
  blue: ["#b9c8f5", "#5b7be0", "#26408b"],
  green: ["#cfe3a8", "#7ea33f", "#3f5a1c"],
  purple: ["#e7c3ef", "#b061c4", "#5f2370"],
  rose: ["#f6c1c7", "#e0607a", "#8f1d3a"],
  slate: ["#d5dbe3", "#7b8794", "#323f4b"],
  sunset: ["#fde68a", "#f59e0b", "#b45309"],
} as const;
export type MateColor = keyof typeof MATE_PALETTE;

export const ROLE_PRESETS = {
  companion: { label: "Companion", brief: "a warm, capable all-round personal assistant who helps with anything" },
  research: { label: "Research", brief: "a sharp researcher who finds, compares and verifies information with sources" },
  planning: { label: "Planning", brief: "an organised planner who manages calendars, schedules, tasks and reminders" },
  money: { label: "Money", brief: "a careful money mate who tracks budgets, spending, prices and bills" },
  creative: { label: "Creative", brief: "a creative partner for ideas, writing, design and brainstorming" },
  health: { label: "Health", brief: "a supportive health and fitness coach for habits, meals and workouts (not a doctor)" },
  study: { label: "Study", brief: "a patient tutor who explains, quizzes and helps the user learn" },
  custom: { label: "Custom", brief: "" },
} as const;
export type MateRole = keyof typeof ROLE_PRESETS;

/** Akan day names, Sunday first: a new lead mate is named for the day it arrives. */
export const DAY_NAMES = ["Kwesi", "Kojo", "Kwabena", "Kweku", "Yaw", "Kofi", "Kwame"] as const;
export const dayName = (date = new Date()) => DAY_NAMES[date.getUTCDay()]!;

const MAX_MATES = 20;
export const GROUP_LIMITS = { min: 2, max: 8 } as const;

/** Mascot silhouettes a mate can wear. Mates created without one get a random pick. */
/** Mirrors SHAPE_NAMES in @muse-clone/mascot; the app draws each one. */
export const MATE_SHAPES = ["hexagon", "circle", "triangle", "oval", "squircle", "pill", "cloud", "teardrop", "pebble"] as const;
export type MateShape = (typeof MATE_SHAPES)[number];
export const randomShape = (): MateShape => MATE_SHAPES[Math.floor(Math.random() * MATE_SHAPES.length)]!;
const shapeSchema = z.enum(MATE_SHAPES);

const colorSchema = z.enum(Object.keys(MATE_PALETTE) as [MateColor, ...MateColor[]]);
const roleSchema = z.enum(Object.keys(ROLE_PRESETS) as [MateRole, ...MateRole[]]);
/** No "@" so mentions stay unambiguous; letters, numbers, spaces and simple punctuation. */
const nameSchema = z.string().trim().min(1).max(40).regex(/^[\p{L}\p{N} .'_-]+$/u, "Use letters, numbers and spaces");

export const mateInputSchema = z.object({
  name: nameSchema,
  role: roleSchema.default("companion"),
  roleDescription: z.string().trim().max(600).default(""),
  color: colorSchema.default("teal"),
  shape: shapeSchema.optional(),
});
export const mateUpdateSchema = mateInputSchema.partial();
/** The setup screen after sign-up: the lead mate's name, shape and colour. */
export const leaderSetupSchema = z.object({ name: nameSchema, shape: shapeSchema, color: colorSchema });
export const groupInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  mateIds: z.array(z.string().uuid()).min(GROUP_LIMITS.min).max(GROUP_LIMITS.max),
  leaderMateId: z.string().uuid().optional(),
});
export const groupUpdateSchema = groupInputSchema.partial();

export type Mate = typeof mates.$inferSelect;
export type PersonaMate = Pick<Mate, "id" | "name" | "role" | "roleDescription" | "color" | "shape">;
export type Persona = { kind: "mate" | "group"; chatId: string; mates: PersonaMate[]; leaderId: string };

export const mateChatId = (mateId: string) => `mate_${mateId}`;
/** The avatar gradient for a colour key; unknown keys (renamed palette entries) fall back to amber. */
export const gradientOf = (color: string): [string, string, string] => [...(MATE_PALETTE[color as MateColor] ?? MATE_PALETTE.amber)];
/** What the app needs to offer when creating a mate; served so app and server never drift. */
export const matePresets = () => ({
  palette: Object.entries(MATE_PALETTE).map(([key, gradient]) => ({ key, gradient: [...gradient] })),
  roles: Object.entries(ROLE_PRESETS).map(([key, role]) => ({ key, label: role.label, brief: role.brief })),
  shapes: [...MATE_SHAPES],
  dayNames: [...DAY_NAMES],
});
export class MateError extends Error {
  constructor(readonly code: "NAME_TAKEN" | "LIMIT" | "NOT_FOUND" | "DEFAULT_MATE" | "INVALID_MEMBERS") {
    super(code);
  }
}

const personaColumns = { id: mates.id, name: mates.name, role: mates.role, roleDescription: mates.roleDescription, color: mates.color, shape: mates.shape };

/**
 * Every user has a lead mate. Idempotent and race-safe, so it can run on every list. New ones are
 * named for today and wait for the setup screen (setupAt null); older accounts kept Cooper.
 */
export async function ensureDefaultMate(userId: string): Promise<Mate> {
  const [existing] = await getDb().select().from(mates).where(and(eq(mates.clerkUserId, userId), eq(mates.isDefault, true)));
  let cooper = existing;
  if (!cooper) {
    const [created] = await getDb()
      .insert(mates)
      .values({ clerkUserId: userId, name: dayName(), role: "companion", roleDescription: ROLE_PRESETS.companion.brief, color: "amber", isDefault: true })
      .onConflictDoNothing()
      .returning();
    cooper = created ?? (await getDb().select().from(mates).where(and(eq(mates.clerkUserId, userId), eq(mates.isDefault, true))))[0]!;
  }
  await getDb()
    .insert(chats)
    .values({ id: mateChatId(cooper.id), clerkUserId: userId, title: cooper.name, kind: "mate", mateId: cooper.id })
    .onConflictDoNothing();
  return cooper;
}

async function nameTaken(userId: string, name: string, exceptId?: string) {
  const rows = await getDb()
    .select({ id: mates.id })
    .from(mates)
    .where(and(eq(mates.clerkUserId, userId), sql`lower(${mates.name}) = lower(${name})`));
  return rows.some((row) => row.id !== exceptId);
}

export async function listMatesAndGroups(userId: string) {
  await ensureDefaultMate(userId);
  const [mateRows, groupRows, memberRows] = await Promise.all([
    getDb().select().from(mates).where(eq(mates.clerkUserId, userId)).orderBy(asc(mates.createdAt)),
    getDb().select().from(chats).where(and(eq(chats.clerkUserId, userId), eq(chats.kind, "group"))),
    getDb()
      .select({ chatId: groupMembers.chatId, mateId: groupMembers.mateId, position: groupMembers.position })
      .from(groupMembers)
      .innerJoin(chats, eq(chats.id, groupMembers.chatId))
      .where(eq(chats.clerkUserId, userId))
      .orderBy(asc(groupMembers.position)),
  ]);
  return {
    presets: matePresets(),
    mates: mateRows.map((mate) => ({ ...mate, gradient: gradientOf(mate.color), chatId: mateChatId(mate.id) })),
    groups: groupRows.map((group) => {
      const memberIds = memberRows.filter((m) => m.chatId === group.id).map((m) => m.mateId);
      return { chatId: group.id, name: group.title, mateIds: memberIds, leaderMateId: group.leaderMateId ?? memberIds[0] ?? null };
    }),
  };
}

export async function createMate(userId: string, input: z.infer<typeof mateInputSchema>) {
  await ensureDefaultMate(userId);
  const [{ count }] = await getDb().select({ count: sql<number>`count(*)::int` }).from(mates).where(eq(mates.clerkUserId, userId));
  if (count >= MAX_MATES) throw new MateError("LIMIT");
  if (await nameTaken(userId, input.name)) throw new MateError("NAME_TAKEN");
  const id = randomUUID();
  const roleDescription = input.roleDescription || ROLE_PRESETS[input.role].brief;
  // The mate and its conversation are created together, so a mate never lacks a chat.
  const [[mate]] = await getDb().batch([
    getDb().insert(mates).values({ id, clerkUserId: userId, name: input.name, role: input.role, roleDescription, color: input.color, shape: input.shape ?? randomShape() }).returning(),
    getDb().insert(chats).values({ id: mateChatId(id), clerkUserId: userId, title: input.name, kind: "mate", mateId: id }),
  ]);
  return { ...mate!, gradient: gradientOf(mate!.color), chatId: mateChatId(id) };
}

export async function updateMate(userId: string, id: string, input: z.infer<typeof mateUpdateSchema>) {
  if (!z.string().uuid().safeParse(id).success) throw new MateError("NOT_FOUND");
  if (input.name && (await nameTaken(userId, input.name, id))) throw new MateError("NAME_TAKEN");
  const values = {
    ...input,
    ...(input.role && input.role !== "custom" && !input.roleDescription ? { roleDescription: ROLE_PRESETS[input.role].brief } : {}),
    updatedAt: new Date(),
  };
  const [mate] = await getDb().update(mates).set(values).where(and(eq(mates.id, id), eq(mates.clerkUserId, userId))).returning();
  if (!mate) throw new MateError("NOT_FOUND");
  // The chat title follows the name: recall, the feed and notifications read it.
  if (input.name) await getDb().update(chats).set({ title: input.name }).where(and(eq(chats.id, mateChatId(id)), eq(chats.clerkUserId, userId)));
  return { ...mate, gradient: gradientOf(mate.color), chatId: mateChatId(id) };
}

/** Saves the setup screen: names and styles the lead mate, and marks setup done. */
export async function setupLeader(userId: string, input: z.infer<typeof leaderSetupSchema>) {
  const leader = await ensureDefaultMate(userId);
  const mate = await updateMate(userId, leader.id, { name: input.name, shape: input.shape, color: input.color });
  await getDb().update(mates).set({ setupAt: new Date() }).where(eq(mates.id, leader.id));
  return { ...mate, setupAt: new Date() };
}

/** Cascades remove the mate's chat and its group memberships; leaders fall back to the first member. */
export async function deleteMate(userId: string, id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new MateError("NOT_FOUND");
  const [mate] = await getDb().select().from(mates).where(and(eq(mates.id, id), eq(mates.clerkUserId, userId)));
  if (!mate) throw new MateError("NOT_FOUND");
  if (mate.isDefault) throw new MateError("DEFAULT_MATE");
  await getDb().delete(mates).where(eq(mates.id, id));
}

async function ownedMateIds(userId: string, ids: string[]) {
  const rows = await getDb().select({ id: mates.id }).from(mates).where(and(eq(mates.clerkUserId, userId), inArray(mates.id, ids)));
  return new Set(rows.map((row) => row.id));
}

function memberValues(chatId: string, mateIds: string[]) {
  return [...new Set(mateIds)].map((mateId, position) => ({ chatId, mateId, position }));
}

export async function createGroup(userId: string, input: z.infer<typeof groupInputSchema>) {
  const ids = [...new Set(input.mateIds)];
  const owned = await ownedMateIds(userId, ids);
  if (ids.length < GROUP_LIMITS.min || ids.some((id) => !owned.has(id))) throw new MateError("INVALID_MEMBERS");
  const leader = input.leaderMateId && ids.includes(input.leaderMateId) ? input.leaderMateId : ids[0]!;
  const chatId = `group_${randomUUID()}`;
  await getDb().batch([
    getDb().insert(chats).values({ id: chatId, clerkUserId: userId, title: input.name, kind: "group", leaderMateId: leader }),
    getDb().insert(groupMembers).values(memberValues(chatId, ids)),
  ]);
  return { chatId, name: input.name, mateIds: ids, leaderMateId: leader };
}

export async function updateGroup(userId: string, chatId: string, input: z.infer<typeof groupUpdateSchema>) {
  const [group] = await getDb().select().from(chats).where(and(eq(chats.id, chatId), eq(chats.clerkUserId, userId), eq(chats.kind, "group")));
  if (!group) throw new MateError("NOT_FOUND");
  const statements = [];
  let ids: string[] | undefined;
  if (input.mateIds) {
    ids = [...new Set(input.mateIds)];
    const owned = await ownedMateIds(userId, ids);
    if (ids.length < GROUP_LIMITS.min || ids.some((id) => !owned.has(id))) throw new MateError("INVALID_MEMBERS");
    statements.push(getDb().delete(groupMembers).where(eq(groupMembers.chatId, chatId)), getDb().insert(groupMembers).values(memberValues(chatId, ids)));
  }
  const members = ids ?? (await getDb().select({ mateId: groupMembers.mateId }).from(groupMembers).where(eq(groupMembers.chatId, chatId))).map((m) => m.mateId);
  const wantedLeader = input.leaderMateId ?? group.leaderMateId;
  const leader = wantedLeader && members.includes(wantedLeader) ? wantedLeader : members[0] ?? null;
  statements.push(
    getDb()
      .update(chats)
      .set({ ...(input.name ? { title: input.name } : {}), leaderMateId: leader, updatedAt: new Date() })
      .where(eq(chats.id, chatId)),
  );
  await getDb().batch(statements as [(typeof statements)[number], ...(typeof statements)[number][]]);
  return { chatId, name: input.name ?? group.title, mateIds: members, leaderMateId: leader };
}

export async function deleteGroup(userId: string, chatId: string) {
  const rows = await getDb().delete(chats).where(and(eq(chats.id, chatId), eq(chats.clerkUserId, userId), eq(chats.kind, "group"))).returning({ id: chats.id });
  if (!rows.length) throw new MateError("NOT_FOUND");
}

/**
 * Who speaks in a chat. Mate chats speak as their mate; groups as their members with a leader;
 * everything else (earlier chats, routines, old app builds) speaks as Cooper.
 */
export async function resolvePersona(userId: string, chatId: string | null | undefined): Promise<Persona> {
  const cooper = await ensureDefaultMate(userId);
  const fallback: Persona = { kind: "mate", chatId: chatId ?? "", mates: [cooper], leaderId: cooper.id };
  if (!chatId) return fallback;
  const [chat] = await getDb().select().from(chats).where(and(eq(chats.id, chatId), eq(chats.clerkUserId, userId)));
  if (!chat) return fallback;
  if (chat.kind === "mate" && chat.mateId) {
    const [mate] = await getDb().select(personaColumns).from(mates).where(eq(mates.id, chat.mateId));
    return mate ? { kind: "mate", chatId, mates: [mate], leaderId: mate.id } : fallback;
  }
  if (chat.kind === "group") {
    const members = await getDb()
      .select(personaColumns)
      .from(groupMembers)
      .innerJoin(mates, eq(mates.id, groupMembers.mateId))
      .where(eq(groupMembers.chatId, chatId))
      .orderBy(asc(groupMembers.position));
    if (!members.length) return fallback;
    const leaderId = members.some((m) => m.id === chat.leaderMateId) ? chat.leaderMateId! : members[0]!.id;
    return { kind: "group", chatId, mates: members, leaderId };
  }
  // A routine run speaks as the mate whose chat scheduled it (stored as its speaker).
  if (chat.kind === "routine" && chat.leaderMateId) {
    const [mate] = await getDb().select(personaColumns).from(mates).where(eq(mates.id, chat.leaderMateId));
    if (mate) return { kind: "mate", chatId, mates: [mate], leaderId: mate.id };
  }
  return fallback;
}

/** Opens every system prompt: who this mate is. The rest of Cooper's rules follow unchanged. */
export function personaPreamble(mate: PersonaMate, group?: { members: PersonaMate[]; task?: string }) {
  const brief = mate.roleDescription.trim() || ROLE_PRESETS[(mate.role as MateRole) in ROLE_PRESETS ? (mate.role as MateRole) : "companion"].brief;
  const lines = [
    `You are ${mate.name}, ${brief}. You are one of the user's AI mates in the Mates app; stay in character as ${mate.name}, warm and clear.`,
  ];
  if (group) {
    const others = group.members.filter((m) => m.id !== mate.id).map((m) => `${m.name} (${m.roleDescription || m.role})`);
    lines.push(
      `You are in a group chat with the user${others.length ? ` and fellow mates ${others.join(", ")}` : ""}. Speak only as yourself; never write lines for other mates.`,
      group.task ? `Your part of this message: ${group.task}. Do only that part; other mates handle the rest.` : "",
    );
  }
  return lines.filter(Boolean).join(" ");
}

type StoredMessage = { role?: string; content?: { type?: string; text?: unknown; result?: { kind?: string; mate?: { name?: string } } }[]; attachments?: { name?: string; type?: string }[] };

/** One-line sidebar preview of a chat's newest message. */
export function previewOf(message: StoredMessage, persona?: { name: string }) {
  const parts = message.content ?? [];
  const text = parts.filter((p) => p.type === "text" && typeof p.text === "string").map((p) => String(p.text)).join(" ").replace(/\s+/g, " ").trim();
  const speaker = [...parts].reverse().find((p) => p.result?.kind === "speaker")?.result?.mate?.name;
  const from = message.role === "user" ? "you" : speaker ?? persona?.name ?? "Mate";
  if (text) return { from, text: text.slice(0, 120) };
  const attachment = message.attachments?.[0];
  if (attachment) return { from, text: attachment.type === "image" ? "📷 Photo" : `📎 ${attachment.name ?? "File"}` };
  const card = parts.find((p) => p.result?.kind)?.result?.kind;
  return { from, text: card === "plan" ? "Done" : card === "memory" ? "Memory updated" : card === "schedule" ? "Routine drafted" : "…" };
}

type ChatRow = typeof chats.$inferSelect;
const publicMate = (m: PersonaMate) => ({ id: m.id, name: m.name, role: m.role, color: m.color, shape: m.shape, gradient: gradientOf(m.color) });

/** Adds who each chat is with and its newest message, in one parallel round of queries. */
export async function enrichChats(userId: string, rows: ChatRow[]) {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const [mateRows, memberRows, latest] = await Promise.all([
    getDb().select(personaColumns).from(mates).where(eq(mates.clerkUserId, userId)),
    getDb()
      .select({ chatId: groupMembers.chatId, mateId: groupMembers.mateId })
      .from(groupMembers)
      .innerJoin(chats, eq(chats.id, groupMembers.chatId))
      .where(eq(chats.clerkUserId, userId))
      .orderBy(asc(groupMembers.position)),
    getDb().execute(
      sql`SELECT DISTINCT ON (chat_id) chat_id, message, created_at FROM chat_messages WHERE chat_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) ORDER BY chat_id, created_at DESC`,
    ),
  ]);
  const mateById = new Map(mateRows.map((m) => [m.id, m]));
  const newest = new Map((latest.rows as { chat_id: string; message: StoredMessage; created_at: string }[]).map((r) => [r.chat_id, r]));
  return rows.map((row) => {
    const mate = row.mateId ? mateById.get(row.mateId) : undefined;
    const members = row.kind === "group" ? memberRows.filter((m) => m.chatId === row.id).flatMap((m) => mateById.get(m.mateId) ?? []) : [];
    const message = newest.get(row.id);
    return {
      ...row,
      mate: mate ? publicMate(mate) : null,
      members: members.map(publicMate),
      preview: message ? { ...previewOf(message.message, mate ?? members.find((m) => m.id === row.leaderMateId)), at: new Date(message.created_at).toISOString() } : null,
    };
  });
}
