import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db/client.js";
import { mates } from "./db/schema.js";
import type { WorkflowCard } from "./integrations.js";
import { createGroup, createMate, GROUP_LIMITS, gradientOf, MateError, MATE_PALETTE, ROLE_PRESETS, type MateColor, type MateRole, type PersonaMate } from "./mates.js";

/**
 * The lead building out the crew from chat: one new mate ("create a CFO for me"), or a group to
 * talk to together. Missions (a team carrying out a goal over time) stay in missions.ts.
 */

type CrewMate = Pick<typeof mates.$inferSelect, "id" | "name" | "role" | "isDefault">;

/** A mate name as the app allows it: letters, numbers, spaces and a little punctuation. */
export const cleanName = (name: string) => name.replace(/[^\p{L}\p{N} .'_-]/gu, "").trim().slice(0, 24);

/** A specialist the user already has for this role (custom and companion roles never count). */
export function sameRole<T extends CrewMate>(crew: T[], role: string): T | undefined {
  if (role === "custom" || role === "companion") return undefined;
  return crew.find((m) => !m.isDefault && m.role === role);
}

/** The user's mates by name, case-insensitively, and the names that matched no one. */
export function resolveNames<T extends CrewMate>(crew: T[], names: string[]) {
  const found: T[] = [];
  const unknown: string[] = [];
  for (const name of names) {
    const mate = crew.find((m) => m.name.toLowerCase() === name.trim().toLowerCase());
    if (mate) found.push(mate);
    else unknown.push(name);
  }
  return { found, unknown };
}

const roleOf = (role: string) => (role in ROLE_PRESETS ? role : "custom") as MateRole;
const colorOf = (color: string | undefined, crewSize: number) =>
  (color && color in MATE_PALETTE ? color : (Object.keys(MATE_PALETTE) as MateColor[])[crewSize % Object.keys(MATE_PALETTE).length]) as MateColor;

const newMateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  role: z.string(),
  description: z.string().trim().min(1).max(600),
  color: z.string().optional(),
});

const memberProperties = {
  name: { type: "string", description: "A short first name, unique among the user's mates." },
  role: { type: "string", enum: Object.keys(ROLE_PRESETS) },
  description: { type: "string", description: "Their job, e.g. 'your CFO: budgets, spending, savings and investments'." },
  color: { type: "string", enum: Object.keys(MATE_PALETTE) },
};

export const createMateTool = {
  type: "function" as const,
  function: {
    name: "cooper_create_mate",
    description:
      "Create ONE new mate for the user, with its own chat, when they want a specialist of their own (e.g. 'create a CFO for me', 'I want a fitness coach'). This does not make a group or start any work. Pick a fitting name and colour yourself; the user can rename it.",
    parameters: {
      type: "object",
      properties: {
        ...memberProperties,
        duplicate_ok: { type: "boolean", description: "Only true when the user confirmed they want another mate with a role they already have." },
      },
      required: ["name", "role", "description"],
      additionalProperties: false,
    },
  },
};

export const createGroupTool = {
  type: "function" as const,
  function: {
    name: "cooper_create_group",
    description:
      "Create a group chat with you and some of the user's mates, to talk to together (e.g. 'put Esi and my planner in a group'). No work starts. Use existing mates by name; add new_members only if the user asked for new ones.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Group name, e.g. 'Money & plans'." },
        members: { type: "array", items: { type: "string" }, maxItems: GROUP_LIMITS.max - 1, description: "Names of existing mates to include (you are added as the leader)." },
        new_members: { type: "array", maxItems: 3, items: { type: "object", properties: memberProperties, required: ["name", "role", "description"] } },
      },
      required: ["name", "members"],
      additionalProperties: false,
    },
  },
};

type Created = Awaited<ReturnType<typeof createMate>>;

export function mateCard(mate: Created): WorkflowCard {
  return {
    kind: "mate",
    phase: "done",
    label: mate.name,
    mate: { id: mate.id, name: mate.name, role: mate.role, roleDescription: mate.roleDescription, color: mate.color, shape: mate.shape, gradient: gradientOf(mate.color), chatId: mate.chatId },
  };
}

const mateFailure = (error: unknown, name: string) => {
  if (error instanceof MateError && error.code === "LIMIT") return "The user has reached the 20-mate limit; they can remove a mate to make room.";
  if (error instanceof MateError && error.code === "NAME_TAKEN") return `There's already a mate called ${name}; pick another name.`;
  throw error;
};

/** One new mate. With a specialist already in that role, it asks first (unless duplicate_ok). */
export async function runCreateMate(userId: string, raw: unknown) {
  const args = newMateSchema.extend({ duplicate_ok: z.boolean().optional() }).safeParse(raw);
  if (!args.success) return { ok: false, error: "Give the mate a name, a role and a short description of its job." } as const;
  const crew = await getDb().select({ id: mates.id, name: mates.name, role: mates.role, isDefault: mates.isDefault }).from(mates).where(eq(mates.clerkUserId, userId));
  const role = roleOf(args.data.role);
  const existing = sameRole(crew, role);
  if (existing && !args.data.duplicate_ok)
    return { ok: false, exists: { name: existing.name, role: existing.role }, note: `The user already has ${existing.name} for this. Ask whether they want another before creating one.` } as const;
  const name = cleanName(args.data.name) || `Mate ${crew.length + 1}`;
  try {
    const mate = await createMate(userId, { name, role, roleDescription: args.data.description, color: colorOf(args.data.color, crew.length) });
    return { ok: true, mate } as const;
  } catch (error) {
    return { ok: false, error: mateFailure(error, name) } as const;
  }
}

/** A group with the lead and the named mates (plus any new ones asked for). No mission. */
export async function runCreateGroup(userId: string, leader: PersonaMate, raw: unknown) {
  const args = z
    .object({ name: z.string().trim().min(1).max(60), members: z.array(z.string()).max(GROUP_LIMITS.max - 1), new_members: z.array(newMateSchema).max(3).optional() })
    .safeParse(raw);
  if (!args.success) return { ok: false, error: "Name the group and say which mates to include." } as const;
  const crew = await getDb().select({ id: mates.id, name: mates.name, role: mates.role, isDefault: mates.isDefault }).from(mates).where(eq(mates.clerkUserId, userId));
  const { found, unknown } = resolveNames(crew, args.data.members);
  if (unknown.length) return { ok: false, error: `No mate called ${unknown.join(", ")}. The crew: ${crew.map((m) => m.name).join(", ")}.` } as const;
  const ids = new Set(found.map((m) => m.id).filter((id) => id !== leader.id));
  const created: Created[] = [];
  for (const member of args.data.new_members ?? []) {
    const name = cleanName(member.name) || `Mate ${crew.length + created.length + 1}`;
    try {
      const mate = await createMate(userId, { name, role: roleOf(member.role), roleDescription: member.description, color: colorOf(member.color, crew.length + created.length) });
      created.push(mate);
      ids.add(mate.id);
    } catch (error) {
      return { ok: false, error: mateFailure(error, name) } as const;
    }
  }
  if (ids.size + 1 < GROUP_LIMITS.min) return { ok: false, error: "A group needs at least one other mate besides you." } as const;
  if (ids.size + 1 > GROUP_LIMITS.max) return { ok: false, error: `A group can have at most ${GROUP_LIMITS.max} mates.` } as const;
  const group = await createGroup(userId, { name: args.data.name, mateIds: [leader.id, ...ids], leaderMateId: leader.id });
  const members = await getDb().select().from(mates).where(eq(mates.clerkUserId, userId));
  return { ok: true, group, members: members.filter((m) => group.mateIds.includes(m.id)), created: created.map((m) => m.name) } as const;
}
