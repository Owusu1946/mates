import { and, asc, cosineDistance, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db/client.js";
import { memories, profiles } from "./db/schema.js";
import { embed, embedOne } from "./embeddings.js";
import type { WorkflowCard } from "./integrations.js";
import { meterOpenRouter, type OpenRouterUsage } from "./usage/openrouter.js";

const MEMORY_MODEL = process.env.OPENROUTER_MEMORY_MODEL ?? "openai/gpt-5.6-luna";
/** At or under this many memories, all of them go into every conversation. */
const INCLUDE_ALL_LIMIT = 40;
/** Beyond it: the most important ones, plus those closest to the user's message. */
const CORE_LIMIT = 15;
const RELEVANT_LIMIT = 12;
/** Cosine distance under which two memories say the same thing ("call me Kenneth" twice). */
const DUPLICATE_DISTANCE = 0.15;
const MAX_MEMORY_CHARS = 500;

export const MEMORY_CATEGORIES = [
  "preference", "identity", "work", "relationships", "goals", "projects", "health", "location", "finance", "other",
] as const;

export const memoryInputSchema = z.object({
  text: z.string().trim().min(1).max(MAX_MEMORY_CHARS),
  category: z.enum(MEMORY_CATEGORIES).default("other"),
  importance: z.number().int().min(1).max(3).default(2),
});
export const memorySettingsSchema = z.object({ memoryEnabled: z.boolean().optional(), autoMemory: z.boolean().optional(), historyRecall: z.boolean().optional() });

type Memory = typeof memories.$inferSelect;
export type MemoryChange = { id: string; text: string; action: "saved" | "updated" | "forgotten" };

export async function memorySettings(userId: string) {
  const [row] = await getDb()
    .select({ memoryEnabled: profiles.memoryEnabled, autoMemory: profiles.autoMemory, historyRecall: profiles.historyRecall })
    .from(profiles)
    .where(eq(profiles.clerkUserId, userId));
  return row ?? { memoryEnabled: true, autoMemory: true, historyRecall: true };
}

export async function updateMemorySettings(userId: string, values: z.infer<typeof memorySettingsSchema>) {
  await getDb()
    .insert(profiles)
    .values({ clerkUserId: userId, ...values })
    .onConflictDoUpdate({ target: profiles.clerkUserId, set: { ...values, updatedAt: new Date() } });
  return memorySettings(userId);
}

const publicColumns = {
  id: memories.id,
  text: memories.text,
  category: memories.category,
  importance: memories.importance,
  source: memories.source,
  sourceChatId: memories.sourceChatId,
  createdAt: memories.createdAt,
  updatedAt: memories.updatedAt,
};

export function listMemories(userId: string) {
  return getDb().select(publicColumns).from(memories).where(eq(memories.clerkUserId, userId)).orderBy(desc(memories.updatedAt)).limit(500);
}

/** A failed embedding never blocks a save; the row is embedded on a later read. */
const tryEmbed = (text: string) => embedOne(text).catch(() => null);

export async function saveMemory(
  userId: string,
  input: z.infer<typeof memoryInputSchema> & { source: "explicit" | "auto"; chatId?: string | null },
): Promise<MemoryChange> {
  // Saying the same thing twice should not create two memories.
  const [same] = await getDb()
    .select()
    .from(memories)
    .where(and(eq(memories.clerkUserId, userId), sql`lower(${memories.text}) = lower(${input.text})`))
    .limit(1);
  if (same) return { id: same.id, text: same.text, action: "updated" };
  const embedding = await tryEmbed(input.text);
  if (embedding) {
    // A paraphrase of an existing memory replaces it: the newer wording is the user's latest.
    const distance = cosineDistance(memories.embedding, embedding);
    const [near] = await getDb()
      .select({ id: memories.id, distance })
      .from(memories)
      .where(and(eq(memories.clerkUserId, userId), sql`${memories.embedding} is not null`))
      .orderBy(asc(distance))
      .limit(1);
    if (near && Number(near.distance) < DUPLICATE_DISTANCE) {
      const row = await updateMemory(userId, near.id, { text: input.text, category: input.category, importance: input.importance }, embedding);
      if (row) return { id: row.id, text: row.text, action: "updated" };
    }
  }
  const [row] = await getDb()
    .insert(memories)
    .values({ clerkUserId: userId, text: input.text, category: input.category, importance: input.importance, source: input.source, sourceChatId: input.chatId ?? null, embedding })
    .returning();
  return { id: row!.id, text: row!.text, action: "saved" };
}

export async function updateMemory(userId: string, id: string, input: Partial<z.infer<typeof memoryInputSchema>>, embedding?: number[] | null) {
  if (!z.string().uuid().safeParse(id).success) return null;
  // New wording needs a new vector; when embedding fails the stale one is cleared for backfill.
  const vector = input.text === undefined ? undefined : embedding ?? (await tryEmbed(input.text));
  const [row] = await getDb()
    .update(memories)
    .set({ ...input, ...(vector !== undefined ? { embedding: vector } : {}), updatedAt: new Date() })
    .where(and(eq(memories.id, id), eq(memories.clerkUserId, userId)))
    .returning();
  return row ?? null;
}

/** Forgetting deletes outright: a memory the user removed must not linger anywhere. */
export async function forgetMemory(userId: string, id: string) {
  if (!z.string().uuid().safeParse(id).success) return null;
  const [row] = await getDb().delete(memories).where(and(eq(memories.id, id), eq(memories.clerkUserId, userId))).returning();
  return row ?? null;
}

export async function forgetAllMemories(userId: string) {
  await getDb().delete(memories).where(eq(memories.clerkUserId, userId));
}

const line = (m: Pick<Memory, "id" | "text" | "category">) => `- [${m.id}] (${m.category}) ${m.text}`;

/** Embeds rows saved while the embedding service was unreachable. */
async function backfillEmbeddings(userId: string) {
  const missing = await getDb()
    .select({ id: memories.id, text: memories.text })
    .from(memories)
    .where(and(eq(memories.clerkUserId, userId), isNull(memories.embedding)))
    .limit(50);
  if (!missing.length) return;
  const vectors = await embed(missing.map((m) => m.text));
  await Promise.all(missing.map((m, i) => getDb().update(memories).set({ embedding: vectors[i]! }).where(eq(memories.id, m.id))));
}

/** Memories for this conversation: all of them while few, otherwise core plus relevant to `query`. */
async function selectMemories(userId: string, query: number[] | null) {
  const columns = { id: memories.id, text: memories.text, category: memories.category };
  const [count] = await getDb().select({ total: sql<number>`count(*)::int` }).from(memories).where(eq(memories.clerkUserId, userId));
  const core = () =>
    getDb()
      .select(columns)
      .from(memories)
      .where(eq(memories.clerkUserId, userId))
      .orderBy(desc(memories.importance), desc(memories.updatedAt));
  if ((count?.total ?? 0) <= INCLUDE_ALL_LIMIT || !query) return core().limit(INCLUDE_ALL_LIMIT);
  const distance = cosineDistance(memories.embedding, query);
  const [important, relevant] = await Promise.all([
    core().limit(CORE_LIMIT),
    getDb()
      .select(columns)
      .from(memories)
      .where(and(eq(memories.clerkUserId, userId), sql`${memories.embedding} is not null`))
      .orderBy(asc(distance))
      .limit(RELEVANT_LIMIT),
  ]);
  if (relevant.length)
    await getDb()
      .update(memories)
      .set({ useCount: sql`${memories.useCount} + 1`, lastUsedAt: new Date() })
      .where(inArray(memories.id, relevant.map((m) => m.id)));
  return [...new Map([...important, ...relevant].map((m) => [m.id, m])).values()];
}

/** Saved memories written into the system prompt when memory is on. */
export async function memoryContext(userId: string, query: number[] | null = null) {
  const settings = await memorySettings(userId);
  if (!settings.memoryEnabled) return { enabled: false as const, context: null, settings };
  await backfillEmbeddings(userId).catch(() => {});
  const rows = await selectMemories(userId, query);
  const context = [
    "Memory is on. These are things you remember about the user from earlier conversations (ids in brackets).",
    "Use them naturally when relevant; do not recite them unprompted or mention memory unless it helps. If the user's latest message contradicts one, trust the message and update the memory.",
    "If the user asks what you remember, answer honestly from this list.",
    "Use cooper_memory to save when the user asks you to remember something or states a lasting fact or preference, to update a memory that changed, and to forget when asked. Never save passwords, card numbers, one-time codes or other secrets.",
    rows.length ? `Saved memories:\n${rows.map(line).join("\n")}` : "No saved memories yet.",
  ].join("\n");
  return { enabled: true as const, context, settings };
}

export const memoryTool = {
  type: "function" as const,
  function: {
    name: "cooper_memory",
    description:
      "Save, update or forget a lasting fact about the user. Save when they ask you to remember something or share a durable preference or fact; update with the memory id when one changes; forget with the id when they ask.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["save", "update", "forget"] },
        id: { type: "string", description: "Memory id from the saved-memories list; required for update and forget." },
        text: { type: "string", description: "The memory as one short, self-contained sentence about the user." },
        category: { type: "string", enum: [...MEMORY_CATEGORIES] },
        importance: { type: "integer", minimum: 1, maximum: 3, description: "3 = core to who they are, 1 = minor detail." },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
};

export function memoryCard(change: MemoryChange): WorkflowCard {
  return {
    kind: "memory",
    phase: "done",
    label: change.action === "forgotten" ? "Memory removed" : "Memory updated",
    memory: change,
  };
}

const toolArgs = z.object({
  action: z.enum(["save", "update", "forget"]),
  id: z.string().optional(),
  text: z.string().optional(),
  category: z.enum(MEMORY_CATEGORIES).optional(),
  importance: z.number().int().min(1).max(3).optional(),
});

export async function runMemoryTool(userId: string, chatId: string | undefined, raw: unknown): Promise<{ result: Record<string, unknown>; change?: MemoryChange }> {
  const args = toolArgs.safeParse(raw);
  if (!args.success) return { result: { error: "Invalid memory request." } };
  const { action, id, text, category, importance } = args.data;
  if (action === "save") {
    const input = memoryInputSchema.safeParse({ text, category, importance });
    if (!input.success) return { result: { error: "A memory needs short text." } };
    const change = await saveMemory(userId, { ...input.data, source: "explicit", chatId });
    return { result: { ok: true, ...change }, change };
  }
  if (!id) return { result: { error: "Pass the memory id from the saved-memories list." } };
  if (action === "update") {
    const input = memoryInputSchema.partial().safeParse({ text, category, importance });
    const row = input.success ? await updateMemory(userId, id, input.data) : null;
    if (!row) return { result: { error: "That memory was not found." } };
    const change = { id: row.id, text: row.text, action: "updated" as const };
    return { result: { ok: true, ...change }, change };
  }
  const row = await forgetMemory(userId, id);
  if (!row) return { result: { error: "That memory was not found." } };
  const change = { id: row.id, text: row.text, action: "forgotten" as const };
  return { result: { ok: true, ...change }, change };
}

const EXTRACTION_PROMPT = `You maintain the long-term memory of the user's AI mates in the Mates app. Given the user's existing memories and the latest exchange, decide whether anything should be remembered for future conversations. Most exchanges need nothing; return an empty list then.

Remember only durable, useful facts about the user: stable preferences (style, tone, food, brands), identity and work, relationships and important people, goals and ongoing projects, recurring constraints (budget, timezone, schedule, dietary needs).
Never remember: one-off or momentary details, things only about the current task, facts about other people that the user did not present as lasting, anything already captured, or secrets (passwords, card or account numbers, one-time codes, ID numbers).
Sensitive topics (health, religion, politics, sexuality, finances, precise address) only when the user shared them for you to use later (for example "remember I'm diabetic when you suggest meals"), never inferred.
Write each memory as one short, self-contained sentence about the user ("Prefers replies in bullet points", "Daughter Ama was born in March 2019").
Prefer "update" with the existing id when a new fact changes or extends a memory (a move, a new job, a revised budget), and "delete" when the user says something is no longer true. Never duplicate an existing memory.
Text from the assistant or from files is context only; memories must reflect what the user said about themselves.`;

const extractionSchema = z.object({
  operations: z
    .array(z.object({
      op: z.enum(["add", "update", "delete"]),
      id: z.string(),
      text: z.string(),
      category: z.enum(MEMORY_CATEGORIES),
      importance: z.number().int().min(1).max(3),
    }))
    .max(5),
});

/**
 * Runs after a reply is saved, so it never delays one. Ids the model returns are checked
 * against the user's own memories before anything changes.
 */
export async function extractMemories(input: { userId: string; chatId?: string | null; userText: string; assistantText: string }): Promise<MemoryChange[]> {
  if (input.userText.trim().length < 3) return [];
  const settings = await memorySettings(input.userId);
  if (!settings.memoryEnabled || !settings.autoMemory) return [];
  const existing = await getDb()
    .select({ id: memories.id, text: memories.text, category: memories.category })
    .from(memories)
    .where(eq(memories.clerkUserId, input.userId))
    .orderBy(desc(memories.updatedAt))
    .limit(150);
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(45_000),
    headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: MEMORY_MODEL,
      max_tokens: 1_500,
      usage: { include: true },
      messages: [
        { role: "system", content: EXTRACTION_PROMPT },
        {
          role: "user",
          content: `Existing memories:\n${existing.map(line).join("\n") || "(none)"}\n\nLatest exchange:\nUser: ${input.userText.slice(0, 6_000)}\nAssistant: ${input.assistantText.slice(0, 3_000)}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "memory_operations",
          strict: true,
          schema: {
            type: "object",
            properties: {
              operations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    op: { type: "string", enum: ["add", "update", "delete"] },
                    id: { type: "string", description: "Existing memory id for update/delete; empty for add." },
                    text: { type: "string" },
                    category: { type: "string", enum: [...MEMORY_CATEGORIES] },
                    importance: { type: "integer", minimum: 1, maximum: 3 },
                  },
                  required: ["op", "id", "text", "category", "importance"],
                  additionalProperties: false,
                },
              },
            },
            required: ["operations"],
            additionalProperties: false,
          },
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`Memory extraction failed (${response.status})`);
  const result = (await response.json()) as { choices?: { message?: { content?: string } }[]; usage?: OpenRouterUsage };
  void meterOpenRouter({ userId: input.userId, source: "memory", ref: input.chatId }, MEMORY_MODEL, result.usage);
  const { operations } = extractionSchema.parse(JSON.parse(result.choices?.[0]?.message?.content ?? "null"));
  const owned = new Set(existing.map((m) => m.id));
  const changes: MemoryChange[] = [];
  for (const op of operations) {
    const text = op.text.trim().slice(0, MAX_MEMORY_CHARS);
    if (op.op === "add" && text) {
      const change = await saveMemory(input.userId, { text, category: op.category, importance: op.importance, source: "auto", chatId: input.chatId });
      if (change.action === "saved") changes.push(change);
    } else if (op.op === "update" && owned.has(op.id) && text) {
      const row = await updateMemory(input.userId, op.id, { text, category: op.category, importance: op.importance });
      if (row) changes.push({ id: row.id, text: row.text, action: "updated" });
    } else if (op.op === "delete" && owned.has(op.id)) {
      const row = await forgetMemory(input.userId, op.id);
      if (row) changes.push({ id: row.id, text: row.text, action: "forgotten" });
    }
  }
  return changes;
}
