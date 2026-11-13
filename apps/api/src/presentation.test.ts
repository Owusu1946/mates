import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ results: [] as unknown[][], updates: [] as unknown[] }));
const recall = vi.hoisted(() => ({ start: vi.fn(async () => {}), stop: vi.fn(async () => {}), meeting: null as Record<string, unknown> | null, pageOk: false }));

const flatten = (value: unknown) => {
  const seen = new WeakSet();
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === "object" && item !== null) {
      if (seen.has(item)) return undefined;
      seen.add(item);
    }
    return item;
  });
};

vi.mock("./db/client.js", () => {
  const rows = () => {
    const next = db.results.shift() ?? [];
    const result = Promise.resolve(next);
    return Object.assign(result, { orderBy: () => ({ limit: async () => next }) });
  };
  return {
    getDb: () => ({
      select: () => ({ from: () => ({ where: rows }) }),
      // Updates are SQL objects (jsonb_set) with cycles; keep their text and parameters to check.
      update: () => ({ set: (value: unknown) => ({ where: async () => void db.updates.push(flatten(value)) }) }),
    }),
  };
});

vi.mock("./meetings.js", () => ({
  startScreenshare: recall.start,
  stopScreenshare: recall.stop,
  sharePageUrl: (id: string, token: string) => `https://site/meet-share?m=${id}&s=${token}`,
  meetingById: async () => recall.meeting,
  pageTokenMatches: () => recall.pageOk,
}));

const { present, presentationDeck, presentationState, PresentError, signShareToken, stopPresenting, verifyShareToken } = await import("./presentation.js");

const CALL = "00000000-0000-4000-8000-0000000000aa";
const DECK = "00000000-0000-4000-8000-0000000000dd";
const slides = [
  { id: "a", layout: "title", title: "Q3 review", notes: "Welcome everyone.", muted: null },
  { id: "b", layout: "list", title: "Revenue", notes: "Revenue doubled.", items: ["Up"], takeaway: null },
  { id: "c", layout: "closing", title: "Thanks", notes: "", subtitle: null, contact: null },
];
const meeting = (extra: Record<string, unknown> = {}) => ({ id: CALL, clerkUserId: "user_1", kind: "meeting", status: "live", chatId: "mate_1", createdAt: new Date(), meeting: { url: "https://meet.google.com/abc-defg-hij", botId: "bot_1", pageKey: "k", ...extra } });
const deck = (extra: Record<string, unknown> = {}) => ({ id: DECK, clerkUserId: "user_1", title: "Q3 review", status: "ready", built: 3, total: 3, version: 2, slides, theme: {}, meta: {}, sources: [], ...extra });

beforeEach(() => {
  db.results = [];
  db.updates = [];
  recall.start.mockReset().mockResolvedValue(undefined);
  recall.stop.mockReset().mockResolvedValue(undefined);
  recall.meeting = null;
  recall.pageOk = false;
});

describe("presenting a deck in a meeting", () => {
  it("starts sharing the screen the first time and returns the slide's notes to narrate", async () => {
    db.results = [[meeting()], [deck()]];
    const result = await present("user_1", CALL, { deckId: DECK, slide: 2 });
    expect(result).toEqual({ status: "presenting", mode: "screenshare", deck: { id: DECK, title: "Q3 review", total: 3 }, slide: { index: 2, title: "Revenue", notes: "Revenue doubled.", layout: "list" } });
    expect(recall.start).toHaveBeenCalledTimes(1);
    expect((recall.start.mock.calls[0] as unknown as [string, string])[1]).toContain("/meet-share?m=");
    expect(db.updates[0]).toContain("presentation");
    expect(db.updates[0]).toContain('\\"slide\\":2');
  });

  it("keeps the same screen share for later slides, and clamps slide numbers", async () => {
    db.results = [[meeting({ presentation: { deckId: DECK, slide: 1, mode: "screenshare", version: 2, startedAt: "x" } })], [deck()]];
    const result = await present("user_1", CALL, { deckId: DECK, slide: 9 });
    expect(result).toMatchObject({ mode: "screenshare", slide: { index: 3, title: "Thanks" } });
    expect(recall.start).not.toHaveBeenCalled();
  });

  it("shows the slides on the tile when the meeting won't allow sharing", async () => {
    recall.start.mockRejectedValue(new Error("Recall answered 400: screenshare not permitted"));
    db.results = [[meeting()], [deck()]];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await present("user_1", CALL, { deckId: DECK, slide: 1 })).toMatchObject({ mode: "tile" });
    warn.mockRestore();
  });

  it("says a deck is still building instead of presenting it", async () => {
    db.results = [[meeting()], [deck({ status: "writing", built: 1, slides: [] })]];
    expect(await present("user_1", CALL, { deckId: DECK, slide: 1 })).toEqual({ status: "building", deck: { id: DECK, title: "Q3 review", built: 1, total: 3 } });
    expect(recall.start).not.toHaveBeenCalled();
  });

  it("refuses ended meetings and decks that aren't the owner's", async () => {
    db.results = [[meeting({})].map((m) => ({ ...m, status: "ended" }))];
    await expect(present("user_1", CALL, { deckId: DECK, slide: 1 })).rejects.toBeInstanceOf(PresentError);
    db.results = [[meeting()], []];
    await expect(present("user_1", CALL, { deckId: DECK, slide: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("stops the screen share and clears the presentation", async () => {
    db.results = [[meeting({ presentation: { deckId: DECK, slide: 2, mode: "screenshare", version: 2, startedAt: "x" } })]];
    expect(await stopPresenting("user_1", CALL)).toEqual({ stopped: true });
    expect(recall.stop).toHaveBeenCalledWith("bot_1");
    expect(db.updates[0]).toContain('"null"');
  });
});

describe("what the share page can read", () => {
  it("signs a share link for one meeting only, and it expires", () => {
    const token = signShareToken(CALL, 0);
    expect(verifyShareToken(token, CALL, 1_000)).toBe(true);
    expect(verifyShareToken(token, "00000000-0000-4000-8000-0000000000bb", 1_000)).toBe(false);
    expect(verifyShareToken(token, CALL, 5 * 60 * 60_000)).toBe(false);
    expect(verifyShareToken(`${token.split(".")[0]}.forged`, CALL, 1_000)).toBe(false);
  });

  it("returns the current slide with a valid token, and nothing without one", async () => {
    recall.meeting = meeting({ presentation: { deckId: DECK, slide: 2, mode: "screenshare", version: 2, startedAt: "x" } });
    expect(await presentationState(CALL, { share: signShareToken(CALL) })).toEqual({ presentation: { deckId: DECK, slide: 2, mode: "screenshare", version: 2 } });
    expect(await presentationState(CALL, { share: "nope" })).toBeNull();
    recall.pageOk = true;
    expect(await presentationState(CALL, { page: "camera-token" })).not.toBeNull();
  });

  it("serves the deck being presented, and nothing when there's no presentation or the meeting ended", async () => {
    recall.meeting = meeting({ presentation: { deckId: DECK, slide: 1, mode: "tile", version: 2, startedAt: "x" } });
    db.results = [[deck()]];
    expect((await presentationDeck(CALL, { share: signShareToken(CALL) }))?.deck).toMatchObject({ id: DECK, version: 2, slides });
    recall.meeting = meeting();
    expect(await presentationDeck(CALL, { share: signShareToken(CALL) })).toBeNull();
    recall.meeting = { ...meeting(), status: "ended" };
    expect(await presentationState(CALL, { share: signShareToken(CALL) })).toBeNull();
  });
});
