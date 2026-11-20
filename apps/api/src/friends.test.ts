import { describe, expect, it, vi } from "vitest";
import {
  acceptInvite, areFriends, blockFriend, createInviteLink, declineInvite, INVITE_DAYS, INVITES_PER_DAY, inviteByEmail, listFriends, newCode, previewInvite,
  removeFriend, permissionsFor, setNickname, setPermissions, type Friend, type FriendDeps, type Invite,
} from "./friends.js";

vi.mock("./db/client.js", () => ({ getDb: () => { throw new Error("no database in tests"); } }));

const KWAME = "user_kwame";
const AMA = "user_ama";
const KOFI = "user_kofi";

/** An in-memory store, named people, and a record of notifications. */
function harness() {
  let clock = 1_000_000_000;
  const invites = new Map<string, Invite>();
  const sides = new Map<string, Friend>();
  const notified: { userId: string; title: string }[] = [];
  const connected: [string, string][] = [];
  const key = (a: string, b: string) => `${a}>${b}`;
  const open = (i: Invite, now: Date) => !i.acceptedAt && !i.declinedAt && i.expiresAt > now;
  const deps: FriendDeps = {
    now: () => clock,
    notify: async (userId, message) => { notified.push({ userId, title: message.title }); },
    onConnected: async (a, b) => { connected.push([a, b]); },
    people: {
      names: async (ids) => new Map(ids.map((id) => [id, ({ [KWAME]: "Kwame", [AMA]: "Ama", [KOFI]: "Kofi" } as Record<string, string>)[id] ?? "A friend"])),
      byEmail: async (email) => ({ "ama@example.com": AMA, "kwame@example.com": KWAME } as Record<string, string>)[email] ?? null,
    },
    store: {
      invite: async (code) => invites.get(code) ?? null,
      createInvite: async (row) => {
        const invite: Invite = { ...row, acceptedBy: null, acceptedAt: null, declinedAt: null, createdAt: new Date(clock) };
        invites.set(row.code, invite);
        return invite;
      },
      invitesSince: async (userId, since) => [...invites.values()].filter((i) => i.clerkUserId === userId && i.createdAt > since).length,
      claimInvite: async (code, userId, at) => {
        const invite = invites.get(code);
        if (!invite || (invite.acceptedBy && invite.acceptedBy !== userId)) return null;
        const next = { ...invite, acceptedBy: userId, acceptedAt: at };
        invites.set(code, next);
        return next;
      },
      declineInvite: async (code, userId, at) => {
        const invite = invites.get(code);
        if (!invite || invite.toUserId !== userId || invite.acceptedAt) return false;
        invites.set(code, { ...invite, declinedAt: at });
        return true;
      },
      side: async (a, b) => sides.get(key(a, b)) ?? null,
      putSide: async (a, b, values) => {
        const existing = sides.get(key(a, b));
        sides.set(key(a, b), { clerkUserId: a, friendUserId: b, permissions: { freeTimes: true, messages: true, answers: false }, nickname: null, status: "active", createdAt: new Date(clock), updatedAt: new Date(clock), ...existing, ...values });
      },
      activeFriends: async (userId) => [...sides.values()].filter((s) => s.clerkUserId === userId && s.status === "active"),
      openRequestsTo: async (userId, now) => [...invites.values()].filter((i) => i.toUserId === userId && open(i, now)),
      openRequestsFrom: async (userId, now) => [...invites.values()].filter((i) => i.clerkUserId === userId && !!i.toUserId && open(i, now)),
    },
  };
  return { deps, invites, sides, notified, connected, tick: (ms: number) => { clock += ms; } };
}

const codeOf = (url: string) => new URL(url).searchParams.get("c")!;

describe("invite links", () => {
  it("makes unambiguous ten-character codes", () => {
    for (let i = 0; i < 50; i++) expect(newCode()).toMatch(/^[a-hjkmnp-z2-9]{10}$/);
  });

  it("connects both sides when a friend accepts, and tells the inviter", async () => {
    const h = harness();
    const link = await createInviteLink(KWAME, h.deps);
    expect(link.message).toContain(link.url);
    const result = await acceptInvite(AMA, codeOf(link.url), h.deps);
    expect(result).toEqual({ friendUserId: KWAME, name: "Kwame" });
    expect(await areFriends(KWAME, AMA, h.deps)).toBe(true);
    expect(h.notified).toEqual([{ userId: KWAME, title: "Ama is now your friend" }]);
  });

  it("is harmless to accept twice, but single-use for anyone else", async () => {
    const h = harness();
    const code = codeOf((await createInviteLink(KWAME, h.deps)).url);
    await acceptInvite(AMA, code, h.deps);
    await expect(acceptInvite(AMA, code, h.deps)).resolves.toMatchObject({ friendUserId: KWAME });
    await expect(acceptInvite(KOFI, code, h.deps)).rejects.toThrow(/already been used/);
  });

  it("won't accept your own invite, or one that expired", async () => {
    const h = harness();
    const code = codeOf((await createInviteLink(KWAME, h.deps)).url);
    await expect(acceptInvite(KWAME, code, h.deps)).rejects.toThrow(/your own/);
    h.tick(INVITE_DAYS * 86_400_000 + 1);
    await expect(acceptInvite(AMA, code, h.deps)).rejects.toThrow(/expired/);
  });

  it("limits how many invites one person makes in a day", async () => {
    const h = harness();
    for (let i = 0; i < INVITES_PER_DAY; i++) await createInviteLink(KWAME, h.deps);
    await expect(createInviteLink(KWAME, h.deps)).rejects.toThrow(/tomorrow/);
    h.tick(86_400_000 + 1);
    await expect(createInviteLink(KWAME, h.deps)).resolves.toBeTruthy();
  });

  it("shows the website only the inviter's name and whether it still works", async () => {
    const h = harness();
    const code = codeOf((await createInviteLink(KWAME, h.deps)).url);
    expect(await previewInvite(code, null, h.deps)).toEqual({ name: "Kwame", state: "open" });
    expect(await previewInvite("nope", null, h.deps)).toBeNull();
  });
});

describe("requests by email", () => {
  it("reaches an existing user, who sees it in their requests and can accept", async () => {
    const h = harness();
    expect(await inviteByEmail(KWAME, " Ama@Example.com ", h.deps)).toEqual({ status: "sent" });
    expect(h.notified[0]).toEqual({ userId: AMA, title: "Friend request from Kwame" });
    const view = await listFriends(AMA, h.deps);
    expect(view.requests).toHaveLength(1);
    expect((await listFriends(KWAME, h.deps)).sent).toMatchObject([{ name: "Ama" }]);
    await acceptInvite(AMA, view.requests[0]!.code, h.deps);
    expect((await listFriends(AMA, h.deps)).friends).toMatchObject([{ userId: KWAME, name: "Kwame", permissions: { freeTimes: true, messages: true, answers: false } }]);
  });

  it("can only be accepted or declined by the person it was for", async () => {
    const h = harness();
    await inviteByEmail(KWAME, "ama@example.com", h.deps);
    const code = [...h.invites.keys()][0]!;
    await expect(acceptInvite(KOFI, code, h.deps)).rejects.toThrow(/doesn't work/);
    await declineInvite(AMA, code, h.deps);
    expect((await listFriends(AMA, h.deps)).requests).toHaveLength(0);
  });

  it("says plainly when there's nobody to send it to, or it's already sent", async () => {
    const h = harness();
    expect(await inviteByEmail(KWAME, "nobody@example.com", h.deps)).toEqual({ status: "not_found" });
    expect(await inviteByEmail(KWAME, "kwame@example.com", h.deps)).toEqual({ status: "self" });
    await inviteByEmail(KWAME, "ama@example.com", h.deps);
    expect(await inviteByEmail(KWAME, "ama@example.com", h.deps)).toEqual({ status: "already_sent" });
  });
});

describe("after connecting", () => {
  async function connected() {
    const h = harness();
    await acceptInvite(AMA, codeOf((await createInviteLink(KWAME, h.deps)).url), h.deps);
    return h;
  }

  it("starts with free times and messages allowed, and answers asking first", async () => {
    const h = await connected();
    expect(await permissionsFor(AMA, KWAME, h.deps)).toEqual({ freeTimes: true, messages: true, answers: false });
  });

  it("lets each side choose its own permissions, one switch at a time", async () => {
    const h = await connected();
    expect(await setPermissions(AMA, KWAME, { freeTimes: false }, h.deps)).toEqual({ freeTimes: false, messages: true, answers: false });
    await setPermissions(AMA, KWAME, { answers: true }, h.deps);
    expect(await permissionsFor(AMA, KWAME, h.deps)).toEqual({ freeTimes: false, messages: true, answers: true });
    expect(await permissionsFor(KWAME, AMA, h.deps)).toEqual({ freeTimes: true, messages: true, answers: false });
  });

  it("gives a friend's mate nothing once either side ends it", async () => {
    const h = await connected();
    await removeFriend(KWAME, AMA, h.deps);
    expect(await permissionsFor(AMA, KWAME, h.deps)).toBeNull();
    await expect(setPermissions(AMA, KWAME, { answers: true }, h.deps)).rejects.toThrow(/not connected/);
  });

  it("ends it for both when either removes the other", async () => {
    const h = await connected();
    await removeFriend(AMA, KWAME, h.deps);
    expect(await areFriends(KWAME, AMA, h.deps)).toBe(false);
    expect((await listFriends(KWAME, h.deps)).friends).toEqual([]);
  });

  it("keeps a blocked person out without telling them", async () => {
    const h = await connected();
    await blockFriend(AMA, KWAME, h.deps);
    expect(await areFriends(KWAME, AMA, h.deps)).toBe(false);
    const sent = h.notified.length;
    expect(await inviteByEmail(KWAME, "ama@example.com", h.deps)).toEqual({ status: "sent" });
    expect(h.notified.length).toBe(sent);
    const code = codeOf((await createInviteLink(KWAME, h.deps)).url);
    await expect(acceptInvite(AMA, code, h.deps)).resolves.toMatchObject({ friendUserId: KWAME });
    expect(await areFriends(KWAME, AMA, h.deps)).toBe(true);
  });

  it("won't let a blocked person connect through the blocker's link", async () => {
    const h = await connected();
    await blockFriend(AMA, KWAME, h.deps);
    const fromAma = codeOf((await createInviteLink(AMA, h.deps)).url);
    // Kwame gets Ama's link second-hand: it doesn't work for him, and doesn't say why.
    expect((await previewInvite(fromAma, KWAME, h.deps))?.state).toBe("unavailable");
    await expect(acceptInvite(KWAME, fromAma, h.deps)).rejects.toThrow(/doesn't work/);
    expect(await areFriends(KWAME, AMA, h.deps)).toBe(false);
  });
});

describe("names", () => {
  it("lets you call a friend what you like, and clear it again", async () => {
    const h = harness();
    await acceptInvite(AMA, codeOf((await createInviteLink(KWAME, h.deps)).url), h.deps);
    expect(await setNickname(KWAME, AMA, "  Sis  ", h.deps)).toBe("Sis");
    expect((await listFriends(KWAME, h.deps)).friends[0]).toMatchObject({ name: "Sis", ownName: "Ama", nickname: "Sis" });
    expect(await setNickname(KWAME, AMA, "", h.deps)).toBeNull();
    expect((await listFriends(KWAME, h.deps)).friends[0]).toMatchObject({ name: "Ama", nickname: null });
  });

  it("releases anything held for the friendship once it's accepted", async () => {
    const h = harness();
    await acceptInvite(AMA, codeOf((await createInviteLink(KWAME, h.deps)).url), h.deps);
    expect(h.connected).toEqual([[KWAME, AMA]]);
  });
});
