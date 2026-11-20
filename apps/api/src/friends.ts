import { z } from "zod";
import { randomInt } from "node:crypto";
import { and, count, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "./db/client.js";
import { DEFAULT_FRIEND_PERMISSIONS, friendInvites, friends, profiles, type FriendPermissions } from "./db/schema.js";
import { pushToUser } from "./delivery.js";

/**
 * Friends: people whose mates work together (find times, pass on updates, answer questions). Connecting is always two-sided and on
 * purpose (a link someone opens and accepts, or a request they accept), and each side chooses what
 * its mate may do with theirs without asking (see FriendPermissions); everything else waits for a tap.
 */

export type Friend = typeof friends.$inferSelect;
export type Invite = typeof friendInvites.$inferSelect;

export const INVITE_DAYS = 14;
/** Invite links and email requests one person can make in a day. */
export const INVITES_PER_DAY = 20;
const SITE = () => process.env.SITE_URL ?? "https://agents.askorin.app";
export const inviteUrl = (code: string) => `${SITE()}/connect?c=${code}`;

// No 0/O, 1/l/I: codes get read aloud and typed from screenshots.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const newCode = () => Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

export class FriendError extends Error {}

// ── What friendships depend on, injectable so the rules can be tested without a database ─────

export type FriendStore = {
  invite(code: string): Promise<Invite | null>;
  createInvite(row: { code: string; clerkUserId: string; toUserId: string | null; expiresAt: Date }): Promise<Invite>;
  invitesSince(userId: string, since: Date): Promise<number>;
  /** Marks an invite accepted by `userId`, only if nobody else has; null if someone has. */
  claimInvite(code: string, userId: string, at: Date): Promise<Invite | null>;
  declineInvite(code: string, userId: string, at: Date): Promise<boolean>;
  side(owner: string, friend: string): Promise<Friend | null>;
  /** Creates or updates one side of a friendship. */
  putSide(owner: string, friend: string, values: Partial<Pick<Friend, "permissions" | "status" | "nickname">>): Promise<void>;
  activeFriends(userId: string): Promise<Friend[]>;
  openRequestsTo(userId: string, now: Date): Promise<Invite[]>;
  openRequestsFrom(userId: string, now: Date): Promise<Invite[]>;
};

export type People = {
  /** First names (or a fallback) for showing people to each other; with `viewer`, what they call them. */
  names(userIds: string[], viewer?: string): Promise<Map<string, string>>;
  /** The account with this verified email, if any. */
  byEmail(email: string): Promise<string | null>;
};

export type FriendDeps = {
  store: FriendStore;
  people: People;
  notify(userId: string, message: { title: string; body: string; data: Record<string, unknown> }): Promise<unknown>;
  /** Two people just became friends: requests held for that go out now. */
  onConnected?(a: string, b: string): Promise<unknown>;
  now(): number;
};

export const dbFriendStore: FriendStore = {
  invite: async (code) => (await getDb().select().from(friendInvites).where(eq(friendInvites.code, code)))[0] ?? null,
  async createInvite(row) {
    const [invite] = await getDb().insert(friendInvites).values(row).returning();
    return invite!;
  },
  async invitesSince(userId, since) {
    const [row] = await getDb().select({ n: count() }).from(friendInvites).where(and(eq(friendInvites.clerkUserId, userId), gt(friendInvites.createdAt, since)));
    return row?.n ?? 0;
  },
  async claimInvite(code, userId, at) {
    const [row] = await getDb().update(friendInvites).set({ acceptedBy: userId, acceptedAt: at })
      .where(and(eq(friendInvites.code, code), or(isNull(friendInvites.acceptedBy), eq(friendInvites.acceptedBy, userId)))).returning();
    return row ?? null;
  },
  async declineInvite(code, userId, at) {
    const rows = await getDb().update(friendInvites).set({ declinedAt: at })
      .where(and(eq(friendInvites.code, code), eq(friendInvites.toUserId, userId), isNull(friendInvites.acceptedAt))).returning({ code: friendInvites.code });
    return rows.length > 0;
  },
  side: async (owner, friend) =>
    (await getDb().select().from(friends).where(and(eq(friends.clerkUserId, owner), eq(friends.friendUserId, friend))))[0] ?? null,
  async putSide(owner, friend, values) {
    await getDb().insert(friends).values({ clerkUserId: owner, friendUserId: friend, ...values })
      .onConflictDoUpdate({ target: [friends.clerkUserId, friends.friendUserId], set: { ...values, updatedAt: new Date() } });
  },
  activeFriends: (userId) => getDb().select().from(friends).where(and(eq(friends.clerkUserId, userId), eq(friends.status, "active"))),
  openRequestsTo: (userId, now) =>
    getDb().select().from(friendInvites).where(and(eq(friendInvites.toUserId, userId), isNull(friendInvites.acceptedAt), isNull(friendInvites.declinedAt), gt(friendInvites.expiresAt, now))),
  openRequestsFrom: (userId, now) =>
    getDb().select().from(friendInvites).where(and(eq(friendInvites.clerkUserId, userId), sql`${friendInvites.toUserId} IS NOT NULL`, isNull(friendInvites.acceptedAt), isNull(friendInvites.declinedAt), gt(friendInvites.expiresAt, now))),
};

/** The first word of a name, tidied: "samuel agbenyo" → "Samuel". */
export const firstName = (name: string) => {
  const word = name.trim().split(/\s+/)[0] ?? "";
  return word.charAt(0).toUpperCase() + word.slice(1);
};

const clerk = async () => {
  const { createClerkClient } = await import("@clerk/backend");
  return createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
};

export const clerkPeople: People = {
  async names(userIds, viewer) {
    const ids = [...new Set(userIds)];
    const names = new Map<string, string>();
    if (!ids.length) return names;
    const rows = await getDb().select({ id: profiles.clerkUserId, name: profiles.displayName }).from(profiles).where(inArray(profiles.clerkUserId, ids));
    for (const row of rows) if (row.name?.trim()) names.set(row.id, firstName(row.name));
    const missing = ids.filter((id) => !names.has(id));
    if (missing.length) {
      try {
        const { data } = await (await clerk()).users.getUserList({ userId: missing, limit: missing.length });
        // Someone who signed up with only an email has no name yet: the start of their email keeps
        // friends tell-apart-able until they set one.
        for (const user of data) names.set(user.id, user.firstName?.trim() || user.username || user.primaryEmailAddress?.emailAddress.split("@")[0] || "A friend");
      } catch {
        // Clerk unreachable: the fallback below still names everyone.
      }
    }
    for (const id of ids) if (!names.has(id)) names.set(id, "A friend");
    if (viewer) {
      const own = await getDb().select({ id: friends.friendUserId, nickname: friends.nickname }).from(friends)
        .where(and(eq(friends.clerkUserId, viewer), inArray(friends.friendUserId, ids), sql`${friends.nickname} IS NOT NULL`));
      for (const row of own) if (row.nickname?.trim()) names.set(row.id, row.nickname.trim());
    }
    return names;
  },
  async byEmail(email) {
    const { data } = await (await clerk()).users.getUserList({ emailAddress: [email], limit: 5 });
    const match = data.find((user) => user.emailAddresses.some((address) => address.emailAddress.toLowerCase() === email && address.verification?.status === "verified"));
    return match?.id ?? null;
  },
};

export const realFriendDeps = (): FriendDeps => ({
  store: dbFriendStore,
  people: clerkPeople,
  notify: pushToUser,
  // Imported when needed: requests depend on friends, not the other way round.
  onConnected: async (a, b) => (await import("./mate-requests.js")).releaseHeld(a, b),
  now: () => Date.now(),
});

// ── Rules ─────────────────────────────────────────────────────────────────────────────────

async function makeInvite(userId: string, toUserId: string | null, deps: FriendDeps) {
  const since = new Date(deps.now() - 86_400_000);
  if ((await deps.store.invitesSince(userId, since)) >= INVITES_PER_DAY) throw new FriendError("You've sent a lot of invites today. Try again tomorrow.");
  return deps.store.createInvite({ code: newCode(), clerkUserId: userId, toUserId, expiresAt: new Date(deps.now() + INVITE_DAYS * 86_400_000) });
}

/** A fresh single-use link to share anywhere (WhatsApp, SMS…). */
export async function createInviteLink(userId: string, deps = realFriendDeps()) {
  const invite = await makeInvite(userId, null, deps);
  const name = (await deps.people.names([userId])).get(userId)!;
  return { code: invite.code, url: inviteUrl(invite.code), message: `${name} wants to connect on Mates, so our mates can sort things out for us. ${inviteUrl(invite.code)}` };
}

export type EmailInviteResult = { status: "sent" | "not_found" | "already_friends" | "self" | "already_sent" };

/** A request to someone already on Mates, found by their verified email. It shows in their Friends. */
export async function inviteByEmail(userId: string, rawEmail: string, deps = realFriendDeps()): Promise<EmailInviteResult> {
  const email = rawEmail.trim().toLowerCase();
  const target = await deps.people.byEmail(email);
  if (!target) return { status: "not_found" };
  if (target === userId) return { status: "self" };
  const [mine, theirs] = await Promise.all([deps.store.side(userId, target), deps.store.side(target, userId)]);
  if (mine?.status === "active" && theirs?.status === "active") return { status: "already_friends" };
  // Someone who blocked you just sees nothing arrive; you aren't told.
  if (theirs?.status === "blocked") return { status: "sent" };
  const open = await deps.store.openRequestsFrom(userId, new Date(deps.now()));
  if (open.some((invite) => invite.toUserId === target)) return { status: "already_sent" };
  await makeInvite(userId, target, deps);
  const name = (await deps.people.names([userId])).get(userId)!;
  await deps.notify(target, { title: `Friend request from ${name}`, body: `${name} wants to be your friend, so your mates can plan things together. Tap to accept.`, data: { url: "/friends" } }).catch(() => undefined);
  return { status: "sent" };
}

export type InvitePreview = {
  name: string;
  state: "open" | "expired" | "used" | "own" | "friends" | "unavailable";
};

/** What an invite link shows before accepting. `userId` is null on the website. */
export async function previewInvite(code: string, userId: string | null, deps = realFriendDeps()): Promise<InvitePreview | null> {
  const invite = await deps.store.invite(code);
  if (!invite) return null;
  const name = (await deps.people.names([invite.clerkUserId])).get(invite.clerkUserId)!;
  if (userId === invite.clerkUserId) return { name, state: "own" };
  if (invite.acceptedBy && invite.acceptedBy !== userId) return { name, state: "used" };
  if (invite.declinedAt) return { name, state: "used" };
  if (invite.expiresAt.getTime() < deps.now()) return { name, state: "expired" };
  if (userId && invite.toUserId && invite.toUserId !== userId) return { name, state: "unavailable" };
  if (userId) {
    const [mine, theirs] = await Promise.all([deps.store.side(userId, invite.clerkUserId), deps.store.side(invite.clerkUserId, userId)]);
    if (mine?.status === "active" && theirs?.status === "active") return { name, state: "friends" };
    if (theirs?.status === "blocked") return { name, state: "unavailable" };
  }
  return { name, state: "open" };
}

/** Accepts an invite: both sides become friends. Accepting again is harmless. */
export async function acceptInvite(userId: string, code: string, deps = realFriendDeps()) {
  const preview = await previewInvite(code, userId, deps);
  if (!preview) throw new FriendError("This invite link doesn't work. Ask for a new one.");
  const messages: Partial<Record<InvitePreview["state"], string>> = {
    own: "That's your own invite. Send it to a friend.",
    used: "This invite has already been used. Ask for a new one.",
    expired: "This invite has expired. Ask for a new one.",
    unavailable: "This invite doesn't work. Ask for a new one.",
  };
  if (messages[preview.state]) throw new FriendError(messages[preview.state]);
  const invite = (await deps.store.invite(code))!;
  const inviter = invite.clerkUserId;
  if (preview.state === "friends") return { friendUserId: inviter, name: preview.name };
  const claimed = await deps.store.claimInvite(code, userId, new Date(deps.now()));
  if (!claimed) throw new FriendError(messages.used);
  // Accepting someone you'd blocked is choosing them again. Each side keeps its sharing choice.
  await deps.store.putSide(userId, inviter, { status: "active" });
  await deps.store.putSide(inviter, userId, { status: "active" });
  const name = (await deps.people.names([userId])).get(userId)!;
  await deps.notify(inviter, { title: `${name} is now your friend`, body: `Your mates can work together now. Try "find a time with ${name} for lunch".`, data: { url: "/friends" } }).catch(() => undefined);
  // Anything either side asked for while waiting on this friendship goes out now.
  await deps.onConnected?.(inviter, userId)?.catch((error: unknown) => console.warn("held_requests_failed", { message: error instanceof Error ? error.message : String(error) }));
  return { friendUserId: inviter, name: preview.name };
}

export async function declineInvite(userId: string, code: string, deps = realFriendDeps()) {
  if (!(await deps.store.declineInvite(code, userId, new Date(deps.now())))) throw new FriendError("This request is no longer open.");
}

export type FriendsView = {
  /** `name` is what you call them: your nickname for them, else their own name (`ownName`). */
  friends: { userId: string; name: string; ownName: string; nickname: string | null; permissions: FriendPermissions; since: string }[];
  requests: { code: string; name: string; at: string }[];
  sent: { code: string; name: string; at: string }[];
};

export async function listFriends(userId: string, deps = realFriendDeps()): Promise<FriendsView> {
  const now = new Date(deps.now());
  const [mine, incoming, outgoing] = await Promise.all([deps.store.activeFriends(userId), deps.store.openRequestsTo(userId, now), deps.store.openRequestsFrom(userId, now)]);
  // A friend is someone both sides still have; a one-sided row (they removed you) isn't shown.
  const mutual = (await Promise.all(mine.map(async (row) => ((await deps.store.side(row.friendUserId, userId))?.status === "active" ? row : null)))).filter((row): row is Friend => !!row);
  const names = await deps.people.names([...mutual.map((f) => f.friendUserId), ...incoming.map((i) => i.clerkUserId), ...outgoing.map((i) => i.toUserId!)]);
  return {
    friends: mutual.map((f) => ({ userId: f.friendUserId, name: f.nickname?.trim() || names.get(f.friendUserId)!, ownName: names.get(f.friendUserId)!, nickname: f.nickname ?? null, permissions: { ...DEFAULT_FRIEND_PERMISSIONS, ...f.permissions }, since: f.createdAt.toISOString() })).sort((a, b) => a.name.localeCompare(b.name)),
    requests: incoming.map((i) => ({ code: i.code, name: names.get(i.clerkUserId)!, at: i.createdAt.toISOString() })),
    sent: outgoing.map((i) => ({ code: i.code, name: names.get(i.toUserId!)!, at: i.createdAt.toISOString() })),
  };
}

/** Whether two people are friends right now: both sides active. */
export async function areFriends(a: string, b: string, deps = realFriendDeps()) {
  const [one, two] = await Promise.all([deps.store.side(a, b), deps.store.side(b, a)]);
  return one?.status === "active" && two?.status === "active";
}

/** Changes what this friend's mate may do without asking; switches left out keep their value. */
export async function setPermissions(userId: string, friendUserId: string, change: Partial<FriendPermissions>, deps = realFriendDeps()) {
  const side = await deps.store.side(userId, friendUserId);
  if (side?.status !== "active") throw new FriendError("You're not connected to this person.");
  const permissions = { ...DEFAULT_FRIEND_PERMISSIONS, ...side.permissions, ...change };
  await deps.store.putSide(userId, friendUserId, { permissions });
  return permissions;
}

/**
 * What `friendUserId`'s mate may do with `userId`'s without asking, or null when they aren't
 * friends right now (both sides active). Every mate-to-mate request checks this first.
 */
export async function permissionsFor(userId: string, friendUserId: string, deps = realFriendDeps()): Promise<FriendPermissions | null> {
  const [mine, theirs] = await Promise.all([deps.store.side(userId, friendUserId), deps.store.side(friendUserId, userId)]);
  if (mine?.status !== "active" || theirs?.status !== "active") return null;
  return { ...DEFAULT_FRIEND_PERMISSIONS, ...mine.permissions };
}

/** Ends the friendship for both. Either can connect again later with a new invite. */
export async function removeFriend(userId: string, friendUserId: string, deps = realFriendDeps()) {
  await deps.store.putSide(userId, friendUserId, { status: "removed" });
  if ((await deps.store.side(friendUserId, userId))?.status === "active") await deps.store.putSide(friendUserId, userId, { status: "removed" });
}

/** Ends it and keeps them out: their invites and requests stop reaching you. They aren't told. */
export async function blockFriend(userId: string, friendUserId: string, deps = realFriendDeps()) {
  await deps.store.putSide(userId, friendUserId, { status: "blocked" });
  if ((await deps.store.side(friendUserId, userId))?.status === "active") await deps.store.putSide(friendUserId, userId, { status: "removed" });
}

/** For account deletion: rows about this person on other people's side, which aren't keyed by them. */
export async function deleteFriendRowsAbout(userId: string) {
  await getDb().batch([
    getDb().delete(friends).where(eq(friends.friendUserId, userId)),
    getDb().delete(friendInvites).where(eq(friendInvites.toUserId, userId)),
  ]);
}

/** What you call a friend ("Sammy"); null or empty goes back to their own name. */
export async function setNickname(userId: string, friendUserId: string, nickname: string | null, deps = realFriendDeps()) {
  const side = await deps.store.side(userId, friendUserId);
  if (side?.status !== "active") throw new FriendError("You're not connected to this person.");
  const value = nickname?.trim().slice(0, 40) || null;
  await deps.store.putSide(userId, friendUserId, { nickname: value });
  return value;
}

// ── Your own name, as friends see it ──────────────────────────────────────────────────────

export const nameSchema = z.object({ name: z.string().trim().min(1).max(40) });

/** Your name as friends see it (null until you set one), and a suggestion from your sign-in. */
export async function myName(userId: string) {
  const [row] = await getDb().select({ name: profiles.displayName }).from(profiles).where(eq(profiles.clerkUserId, userId));
  let suggestion: string | null = null;
  if (!row?.name) {
    try {
      const user = await (await clerk()).users.getUser(userId);
      suggestion = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || null;
    } catch {
      suggestion = null;
    }
  }
  return { name: row?.name ?? null, suggestion };
}

export async function setMyName(userId: string, name: string) {
  const value = name.trim().replace(/\s+/g, " ").slice(0, 40);
  await getDb().insert(profiles).values({ clerkUserId: userId, displayName: value })
    .onConflictDoUpdate({ target: profiles.clerkUserId, set: { displayName: value, updatedAt: new Date() } });
  return { name: value, suggestion: null };
}
