import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "./db/client.js";
import { actionGrants } from "./db/schema.js";

/**
 * Permission grants. Owner decisions (2026-11-19):
 * - When the user asks in chat, mates act at once, except spending money and permanent deletes.
 * - When the user isn't watching (routines, watches, habits, missions, call summaries), anything
 *   that reaches other people or can't be taken back asks first: sends, shares, deletes, spending.
 * - "Always allow" is remembered for the exact app and person, and never offered for money.
 * - Once allowed in a task, the same action isn't asked again in that task.
 */
export type ActionCategory = "read" | "draft" | "change" | "send" | "share" | "delete" | "spend";

const segment = (words: string) => new RegExp(`_(?:${words})(?:_|$)`);
const READ = segment("GET|FETCH|LIST|SEARCH|QUERY|READ|FIND|RETRIEVE|CHECK|LOOKUP|EXTRACT|DESCRIBE|COUNT");
const WRITE = segment("CREATE|UPDATE|UPSERT|SEND|DELETE|REMOVE|INSERT|ADD|EDIT|WRITE|POST|PATCH|EXECUTE|RUN|APPEND|MOVE|COPY|UPLOAD|PURCHASE|PAY|INVITE|SHARE|ASSIGN|ARCHIVE|MARK|SET|IMPORT");
const SPEND = segment("PAY|PAYMENT|PAYMENTS|PURCHASE|BUY|CHARGE|TRANSFER|SEND_MONEY|CHECKOUT|PAYOUT|TOPUP|TOP_UP|RECHARGE|DONATE|REFUND");
// Only what can't be undone: trash and archive keep the item, so they're ordinary changes.
const DELETE = segment("DELETE|PURGE|DESTROY|ERASE|PERMANENTLY_DELETE");
const SHARE = segment("SHARE|ADD_PERMISSION|CREATE_PERMISSION|INVITE|ADD_COLLABORATOR|ADD_MEMBER|ADD_MEMBERS|GRANT");
const SEND = segment("SEND|REPLY|FORWARD|POST|MESSAGE|COMMENT|TWEET|PUBLISH|NOTIFY|SMS|CALL|DIAL");
const DRAFT = segment("DRAFT|DRAFTS");

/** What an app action does, from its Composio slug (and, for invites, its arguments). */
export function categoryOf(slug: string, args: Record<string, unknown> = {}): ActionCategory {
  const name = slug.toUpperCase();
  if (SPEND.test(name)) return "spend";
  if (READ.test(name) && !WRITE.test(name)) return "read";
  if (DELETE.test(name)) return "delete";
  if (DRAFT.test(name)) return "draft";
  if (SHARE.test(name)) return "share";
  if (SEND.test(name)) return "send";
  // A calendar event with guests sends them invitations.
  if (/_(?:CREATE|UPDATE|PATCH)_EVENT$/.test(name) && targetsOf(slug, args).length) return "share";
  return "change";
}

const TARGET_KEYS = ["recipient_email", "recipient", "recipients", "to", "cc", "bcc", "email", "emails", "email_address", "emailAddress", "attendees", "invitees", "users", "phone", "phone_number", "to_number", "number", "channel", "channel_id"];

/** Who an action reaches: emails, phone numbers or channels, lower-cased and de-duplicated. */
export function targetsOf(_slug: string, args: Record<string, unknown>): string[] {
  const found = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string") {
      for (const part of value.split(/[,;]/)) {
        const clean = part.trim().replace(/^.*<([^>]+)>$/, "$1").toLowerCase();
        if (clean) found.add(clean);
      }
    } else if (Array.isArray(value)) value.forEach(add);
    else if (value && typeof value === "object") {
      const item = value as Record<string, unknown>;
      add(item.email ?? item.emailAddress ?? item.address ?? item.id);
    }
  };
  for (const key of TARGET_KEYS) add(args[key]);
  return [...found].slice(0, 20);
}

export type Origin = "chat" | "unattended";
export type Decision = "act" | "ask";
const ASK_IN_CHAT: ActionCategory[] = ["spend", "delete"];
const ASK_UNATTENDED: ActionCategory[] = ["spend", "delete", "send", "share"];

/** A grant key: exactly this kind of action, in this app, to this person (or to no one). */
export const grantKey = (category: ActionCategory, toolkit: string, target = "") => `${category}|${toolkit}|${target}`;

/**
 * Act or ask, for one action. `self` is the user's own addresses: mail to yourself never asks.
 * `allowed` holds keys approved earlier in this task and the user's "always" grants.
 */
export function decide(input: { category: ActionCategory; toolkit: string; targets: string[]; origin: Origin; self: Set<string>; allowed: Set<string> }): { decision: Decision; keys: string[] } {
  const others = input.targets.filter((target) => !input.self.has(target));
  const keys = others.length ? others.map((target) => grantKey(input.category, input.toolkit, target)) : [grantKey(input.category, input.toolkit)];
  const risky = (input.origin === "chat" ? ASK_IN_CHAT : ASK_UNATTENDED).includes(input.category);
  // Sending or sharing only with yourself reaches no one else.
  if (!risky || ((input.category === "send" || input.category === "share") && !others.length)) return { decision: "act", keys };
  return { decision: keys.every((key) => input.allowed.has(key)) ? "act" : "ask", keys };
}

/** Money is never "always allowed": every payment needs a tap. */
export const canAlwaysAllow = (categories: ActionCategory[]) => !categories.includes("spend");

/** "Send emails to ama@x.com" for the card and the Permissions list. */
export function grantLabel(category: ActionCategory, appName: string, target: string) {
  const verb = { read: "Read", draft: "Draft", change: "Make changes", send: "Send messages", share: "Share and invite", delete: "Delete", spend: "Spend money" }[category];
  return `${verb}${target ? ` to ${target}` : ""} in ${appName}`;
}

export async function grantedKeys(userId: string, keys: string[]) {
  if (!keys.length) return new Set<string>();
  const rows = await getDb().select({ category: actionGrants.category, toolkit: actionGrants.toolkit, target: actionGrants.target }).from(actionGrants).where(eq(actionGrants.clerkUserId, userId));
  const wanted = new Set(keys);
  return new Set(rows.map((row) => grantKey(row.category as ActionCategory, row.toolkit, row.target)).filter((key) => wanted.has(key)));
}

/** Saves "always allow" for each key; money keys are refused here too, not just hidden in the app. */
export async function saveGrants(userId: string, keys: string[]) {
  const rows = keys
    .map((key) => key.split("|") as [ActionCategory, string, string])
    .filter(([category, toolkit]) => category !== "spend" && category !== "read" && !!toolkit)
    .map(([category, toolkit, target]) => ({ clerkUserId: userId, category, toolkit, target: target ?? "" }));
  if (rows.length) await getDb().insert(actionGrants).values(rows).onConflictDoNothing();
  return rows.length;
}

export async function markGrantsUsed(userId: string, keys: string[]) {
  const parts = keys.map((key) => key.split("|"));
  if (!parts.length) return;
  const rows = await getDb().select({ id: actionGrants.id, category: actionGrants.category, toolkit: actionGrants.toolkit, target: actionGrants.target }).from(actionGrants).where(eq(actionGrants.clerkUserId, userId));
  const ids = rows.filter((row) => parts.some(([c, t, g]) => c === row.category && t === row.toolkit && (g ?? "") === row.target)).map((row) => row.id);
  if (ids.length) await getDb().update(actionGrants).set({ lastUsedAt: new Date() }).where(and(eq(actionGrants.clerkUserId, userId), inArray(actionGrants.id, ids)));
}

export function listGrants(userId: string) {
  return getDb()
    .select({ id: actionGrants.id, category: actionGrants.category, toolkit: actionGrants.toolkit, target: actionGrants.target, createdAt: actionGrants.createdAt, lastUsedAt: actionGrants.lastUsedAt })
    .from(actionGrants)
    .where(eq(actionGrants.clerkUserId, userId))
    .orderBy(desc(actionGrants.createdAt));
}

export async function removeGrant(userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const rows = await getDb().delete(actionGrants).where(and(eq(actionGrants.id, id), eq(actionGrants.clerkUserId, userId))).returning({ id: actionGrants.id });
  return rows.length > 0;
}

const selfCache = new Map<string, { at: number; value: Set<string> }>();
/** The user's own verified email addresses, from Clerk; cached for 10 minutes per process. */
export async function selfAddresses(userId: string): Promise<Set<string>> {
  const cached = selfCache.get(userId);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.value;
  try {
    const { createClerkClient } = await import("@clerk/backend");
    const user = await createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! }).users.getUser(userId);
    const value = new Set(user.emailAddresses.filter((address) => address.verification?.status === "verified").map((address) => address.emailAddress.toLowerCase()));
    selfCache.set(userId, { at: Date.now(), value });
    return value;
  } catch {
    // Unknown: nothing counts as "yourself", so the safer path (asking) applies.
    return new Set();
  }
}
