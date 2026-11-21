import { describe, expect, it, vi } from "vitest";
import { headOf, historyPageIds } from "./chats.js";

vi.mock("./db/client.js", () => ({ getDb: () => { throw new Error("no database in tests"); } }));

/** A straight chat of `n` messages: m1 → m2 → … → mn. */
const chain = (n: number, prefix = "m") => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, parentId: i ? `${prefix}${i}` : null }));
const sorted = (ids: Set<string>) => [...ids].sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")) || a.localeCompare(b));

describe("headOf", () => {
  it("is the newest leaf, even when a reply was saved before its question", () => {
    expect(headOf(chain(3))).toBe("m3");
    expect(headOf([{ id: "a", parentId: null }, { id: "c", parentId: "b" }, { id: "b", parentId: "a" }])).toBe("c");
    expect(headOf([])).toBeNull();
  });
});

describe("historyPageIds", () => {
  it("gives a short chat whole, with nothing more to load", () => {
    const page = historyPageIds(chain(5), { limit: 10 });
    expect(sorted(page.ids)).toEqual(["m1", "m2", "m3", "m4", "m5"]);
    expect(page.hasMore).toBe(false);
  });

  it("gives the newest messages of a long chat, and says there's more", () => {
    const page = historyPageIds(chain(100), { limit: 3 });
    expect(sorted(page.ids)).toEqual(["m98", "m99", "m100"]);
    expect(page.hasMore).toBe(true);
    expect(page.headId).toBe("m100");
  });

  it("pages back from the oldest message the app has, without repeating it", () => {
    const older = historyPageIds(chain(100), { limit: 3, before: "m98" });
    expect(sorted(older.ids)).toEqual(["m95", "m96", "m97"]);
    expect(older.hasMore).toBe(true);
    const first = historyPageIds(chain(5), { limit: 3, before: "m3" });
    expect(sorted(first.ids)).toEqual(["m1", "m2"]);
    expect(first.hasMore).toBe(false);
    expect(historyPageIds(chain(5), { limit: 3, before: "m1" }).ids.size).toBe(0);
  });

  it("keeps every branch that splits off inside the page, so the branch picker still works", () => {
    // m6 was regenerated as r6, which has its own reply r7; r7 is the newest, so it's the head.
    const nodes = [...chain(10), { id: "r6", parentId: "m5" }, { id: "r7", parentId: "r6" }];
    const page = historyPageIds(nodes, { limit: 4 });
    expect(page.headId).toBe("r7");
    // Four back from r7 is m4; everything below m4's parent comes too, so m6's old branch is there.
    expect(sorted(page.ids)).toEqual(["m4", "m5", "m6", "r6", "m7", "r7", "m8", "m9", "m10"]);
    expect(page.hasMore).toBe(true);
  });

  it("returns nothing for an unknown oldest message", () => {
    expect(historyPageIds(chain(5), { limit: 3, before: "nope" }).ids.size).toBe(0);
  });
});
