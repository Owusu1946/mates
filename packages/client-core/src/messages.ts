/**
 * Chat messages as the API stores them (assistant-ui ThreadMessage JSON in chat_messages; written
 * by durable runs in apps/api/src/durable-runs.ts), made safe to show, and the branch the chat is
 * on. The rules follow the phone's remote-chats.ts: older rows may lack a status or hold malformed
 * parts, and one bad row must never break a chat.
 */

export type StoredTextPart = { type: "text"; text: string };
export type StoredToolPart = { type: "tool-call"; toolCallId: string; toolName: string; args?: unknown; argsText?: string; result?: unknown };
export type StoredPart = StoredTextPart | StoredToolPart | { type: string; [key: string]: unknown };

export type StoredMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  createdAt: string;
  content: StoredPart[];
  status?: { type: string; reason?: string };
  metadata?: { custom?: Record<string, unknown> };
  attachments?: unknown[];
};

export type StoredItem = { message: StoredMessage; parentId: string | null };

const ROLES = new Set(["user", "assistant", "system", "tool"]);

/**
 * A stored message ready to show, or null when it isn't one (no id or role). Parts without a type
 * are dropped, and `live` says the server is still writing this reply: a run here or elsewhere
 * (another device, a routine, a mission round).
 */
export function cleanMessage(raw: unknown): { message: StoredMessage; live: boolean } | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<StoredMessage>;
  const created: unknown = (raw as { createdAt?: unknown }).createdAt;
  if (typeof value.id !== "string" || !value.id || typeof value.role !== "string" || !ROLES.has(value.role)) return null;
  const content = Array.isArray(value.content) ? value.content.filter((part): part is StoredPart => !!part && typeof part === "object" && typeof (part as { type?: unknown }).type === "string") : [];
  const createdAt = typeof created === "string" ? created : created instanceof Date ? created.toISOString() : new Date(0).toISOString();
  const live = value.role === "assistant" && value.status?.type === "running";
  return { message: { ...value, id: value.id, role: value.role, createdAt, content } as StoredMessage, live };
}

/** The text of a message's text parts, in order. */
export const textOf = (message: Pick<StoredMessage, "content">) =>
  message.content
    .filter((part): part is StoredTextPart => part.type === "text" && typeof (part as StoredTextPart).text === "string")
    .map((part) => part.text)
    .join("");

/**
 * The newest leaf, not the newest row: rows saved with a skewed clock can sort a reply before
 * its question (remote-chats.ts headOf).
 */
export function headOf(items: StoredItem[]): string | null {
  const parents = new Set(items.map((item) => item.parentId));
  const leaves = items.filter((item) => !parents.has(item.message.id));
  return (leaves.at(-1) ?? items.at(-1))?.message.id ?? null;
}

/** The chat as read: from the top down to `headId`, following each message's parent. */
export function branchTo(items: StoredItem[], headId: string | null): StoredItem[] {
  const byId = new Map(items.map((item) => [item.message.id, item]));
  const chain: StoredItem[] = [];
  const visited = new Set<string>();
  for (let id = headId; id && !visited.has(id); ) {
    const item = byId.get(id);
    if (!item) break;
    visited.add(id);
    chain.push(item);
    id = item.parentId;
  }
  return chain.reverse();
}

/** Messages that answer the same message in the same voice: the versions of a reply, oldest first. */
export function siblingsOf(items: StoredItem[], id: string): string[] {
  const item = items.find((candidate) => candidate.message.id === id);
  if (!item) return [];
  return items.filter((candidate) => candidate.parentId === item.parentId && candidate.message.role === item.message.role).map((candidate) => candidate.message.id);
}

/** The newest message at the end of the branch that starts at `id`: switching to a version reads on to there. */
export function leafUnder(items: StoredItem[], id: string): string {
  const children = new Map<string, string[]>();
  for (const item of items) if (item.parentId) children.set(item.parentId, [...(children.get(item.parentId) ?? []), item.message.id]);
  const visited = new Set<string>();
  let current = id;
  while (!visited.has(current)) {
    visited.add(current);
    const next = children.get(current)?.at(-1);
    if (!next) break;
    current = next;
  }
  return current;
}
